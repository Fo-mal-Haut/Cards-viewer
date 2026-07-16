from __future__ import annotations

import argparse
import html
import json
import os
import re
import shutil
import threading
import time
import webbrowser
from datetime import datetime, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parent
HTML_DIR = ROOT / "html"
DIST = ROOT / "dist"
DEV_DIR = ROOT / ".dev"
ASSETS_DIR = ROOT / "assets"
BANKS_DIR = ASSETS_DIR / "banks"
DOCS_DIR = ROOT / "docs"
TEMPLATES_DIR = ROOT / "templates"
HTML_FILES = (
    "index.html",
    "credit.html",
    "referral.html",
    "bin.html",
    "withdrawal.html",
)
ROOT_MARKDOWN_PAGES = (("docs/link.md", "link.html", "link"),)
STATIC_DIRS = ("assets", "css", "js")
PRELOADED_SCRIPT = '<script src="js/generated/site-data.js"></script>'
PRELOADED_MARKER = '<script src="js/common.js"></script>'
DEV_RELOAD_SCRIPT = """<script>
(() => {
  let lastToken = null;

  async function checkReload() {
    try {
      const response = await fetch("/__reload.txt?ts=" + Date.now(), {
        cache: "no-cache",
      });
      if (!response.ok) return;

      const token = (await response.text()).trim();
      if (!token) return;

      if (lastToken === null) {
        lastToken = token;
        return;
      }

      if (token !== lastToken) {
        location.reload();
      }
    } catch {
      // Ignore transient polling failures while rebuilding.
    }
  }

  checkReload();
  window.setInterval(checkReload, 1000);
})();
</script>"""
WATCH_DIRECTORIES = ("assets", "css", "docs", "html", "js", "templates")
WATCH_FILE_SUFFIXES = {
    ".html",
    ".css",
    ".js",
    ".json",
    ".md",
    ".svg",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".ico",
    ".jfif",
    ".pptx",
}


def read_json(path: Path) -> object:
    with path.open("r", encoding="utf-8-sig") as handle:
        return json.load(handle)


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8", newline="\n")


def finalize_html(content: str, output_dir: Path) -> str:
    if output_dir == DEV_DIR and DEV_RELOAD_SCRIPT not in content:
        return content.replace("</body>", f"  {DEV_RELOAD_SCRIPT}\n  </body>")
    return content


def recreate_directory(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path, ignore_errors=True)
    path.mkdir(parents=True, exist_ok=True)


def remove_path(path: Path) -> None:
    if path.is_dir():
        shutil.rmtree(path, ignore_errors=True)
    elif path.exists():
        path.unlink(missing_ok=True)


def same_file(source: Path, target: Path) -> bool:
    if not target.exists() or not target.is_file():
        return False

    source_stat = source.stat()
    target_stat = target.stat()
    return (
        source_stat.st_size == target_stat.st_size
        and source_stat.st_mtime_ns == target_stat.st_mtime_ns
    )


def sync_directory(source_dir: Path, target_dir: Path) -> None:
    target_dir.mkdir(parents=True, exist_ok=True)

    for source_path in source_dir.rglob("*"):
        relative_path = source_path.relative_to(source_dir)
        target_path = target_dir / relative_path

        if source_path.is_dir():
            target_path.mkdir(parents=True, exist_ok=True)
            continue

        if same_file(source_path, target_path):
            continue

        target_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source_path, target_path)


def prepare_output_dir(output_dir: Path) -> None:
    if output_dir == DEV_DIR:
        output_dir.mkdir(parents=True, exist_ok=True)
        for name in HTML_FILES:
            remove_path(output_dir / name)
        remove_path(output_dir / "__reload.txt")
        return

    recreate_directory(output_dir)


def copy_static_files(output_dir: Path) -> None:
    for directory in STATIC_DIRS:
        if output_dir == DEV_DIR:
            sync_directory(ROOT / directory, output_dir / directory)
            continue
        shutil.copytree(
            ROOT / directory,
            output_dir / directory,
        )


def build_site_data() -> dict[str, object]:
    manifest_raw = read_json(ASSETS_DIR / "manifest.json")
    if not isinstance(manifest_raw, dict):
        raise ValueError("assets/manifest.json must be a dict mapping category names to bank name arrays")

    # Build bank-to-category mapping by scanning category directories
    bank_to_category: dict[str, str] = {}
    for entry in sorted(BANKS_DIR.iterdir()):
        if not entry.is_dir():
            continue
        category_name = entry.name
        for bank_dir in sorted(entry.iterdir()):
            if bank_dir.is_dir():
                bank_to_category[bank_dir.name] = category_name

    # Build flat bank list preserving manifest order, and read each bank's data
    flat_manifest: list[str] = []
    banks: dict[str, object] = {}
    for item in manifest_raw.values():
        if not isinstance(item, list):
            continue
        for bank_key in item:
            bank_key = str(bank_key).strip()
            if not bank_key:
                continue
            flat_manifest.append(bank_key)
            category = bank_to_category.get(bank_key)
            if category:
                banks[bank_key] = read_json(BANKS_DIR / category / bank_key / "data.json")
            else:
                flat_path = BANKS_DIR / bank_key / "data.json"
                if flat_path.exists():
                    banks[bank_key] = read_json(flat_path)
                else:
                    print(f"Warning: Bank '{bank_key}' not found in any category directory under assets/banks/")
                    continue

    referral = read_json(ASSETS_DIR / "referral.json")
    footer_links = read_json(ASSETS_DIR / "footer-links.json")
    bin_overlays = read_json(ASSETS_DIR / "bin-overlays.json")
    regions = read_json(ASSETS_DIR / "regions.json")
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "manifest": flat_manifest,
        "manifestCategories": manifest_raw,
        "banks": banks,
        "bankToCategory": bank_to_category,
        "referral": referral,
        "footerLinks": footer_links,
        "binOverlays": bin_overlays,
        "regions": regions,
    }


def write_site_data(output_dir: Path, data: dict[str, object]) -> None:
    payload = json.dumps(
        data,
        ensure_ascii=False,
        separators=(",", ":"),
    )
    content = f"window.__CARDS_VIEWER_DATA__ = {payload};\n"
    write_text(output_dir / "js" / "generated" / "site-data.js", content)


def write_html_files(output_dir: Path) -> None:
    for name in HTML_FILES:
        source = (HTML_DIR / name).read_text(encoding="utf-8")
        if PRELOADED_SCRIPT not in source and PRELOADED_MARKER in source:
            source = source.replace(
                PRELOADED_MARKER,
                f"{PRELOADED_SCRIPT}\n    {PRELOADED_MARKER}",
                1,
            )
        write_text(output_dir / name, finalize_html(source, output_dir))


def read_template(name: str) -> str:
    return (TEMPLATES_DIR / name).read_text(encoding="utf-8")


def extract_markdown_title(markdown: str, fallback: str) -> str:
    for line in markdown.splitlines():
        stripped = line.strip()
        if stripped.startswith("#"):
            title = stripped.lstrip("#").strip()
            if title:
                return title
    return fallback


FRONT_MATTER_PATTERN = re.compile(
    r"\A---\s*\r?\n(?P<body>.*?)\r?\n---\s*(?:\r?\n|$)",
    re.DOTALL,
)


def parse_markdown_metadata(markdown: str) -> tuple[str, dict[str, str]]:
    match = FRONT_MATTER_PATTERN.match(markdown)
    if not match:
        return markdown, {}

    metadata: dict[str, str] = {}
    for line in match.group("body").splitlines():
        key, separator, value = line.partition(":")
        if not separator:
            continue
        normalized_key = key.strip().lower()
        normalized_value = value.strip().strip("\"'")
        if normalized_key in {"author", "date"} and normalized_value:
            metadata[normalized_key] = normalized_value

    return markdown[match.end() :].lstrip("\r\n"), metadata


INLINE_CODE_PATTERN = re.compile(r"`([^`]+)`")
STRONG_PATTERN = re.compile(r"\*\*([^*]+)\*\*")
EM_PATTERN = re.compile(r"\*([^*]+)\*")
MARKDOWN_LINK_PATTERN = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
BARE_URL_PATTERN = re.compile(r'(?<!["])(https?://[^\s<]+)')


def escape_html(value: object) -> str:
    return html.escape(str(value), quote=True)


def render_markdown_link(match: re.Match[str]) -> str:
    href = match.group(2)
    class_attr = (
        ' class="external-link"'
        if re.match(r"^(https?:)?//", href, re.IGNORECASE)
        else ""
    )
    return (
        f'<a{class_attr} href="{escape_html(href)}" target="_blank" '
        f'rel="noopener noreferrer">{match.group(1)}</a>'
    )


BR_PLACEHOLDER = "\x00BR\x00"


def render_inline(text: str) -> str:
    rendered = text.strip()
    rendered = rendered.replace("<br>", BR_PLACEHOLDER).replace("<br/>", BR_PLACEHOLDER).replace("<br />", BR_PLACEHOLDER)
    rendered = escape_html(rendered)
    rendered = rendered.replace(BR_PLACEHOLDER, "<br>")
    rendered = INLINE_CODE_PATTERN.sub(
        lambda match: f"<code>{escape_html(match.group(1))}</code>",
        rendered,
    )
    rendered = STRONG_PATTERN.sub(
        lambda match: f"<strong>{escape_html(match.group(1))}</strong>",
        rendered,
    )
    rendered = EM_PATTERN.sub(
        lambda match: f"<em>{escape_html(match.group(1))}</em>",
        rendered,
    )
    rendered = MARKDOWN_LINK_PATTERN.sub(render_markdown_link, rendered)
    rendered = BARE_URL_PATTERN.sub(
        lambda match: (
            f'<a class="external-link" href="{match.group(1)}" target="_blank" '
            f'rel="noopener noreferrer">{match.group(1)}</a>'
        ),
        rendered,
    )
    return rendered


def split_table_row(line: str) -> list[str] | None:
    trimmed = line.strip()
    if "|" not in trimmed:
        return None

    normalized = trimmed.removeprefix("|").removesuffix("|")
    return [cell.strip() for cell in normalized.split("|")]


def is_table_separator(line: str) -> bool:
    cells = split_table_row(line)
    return bool(cells) and all(re.fullmatch(r":?-+:?", cell) for cell in cells)


def get_table_alignment(cell: str) -> str:
    if cell.startswith(":") and cell.endswith(":"):
        return "center"
    if cell.endswith(":"):
        return "right"
    if cell.startswith(":"):
        return "left"
    return ""


def render_table_section(
    rows: list[list[str]],
    tag_name: str,
    alignments: list[str],
) -> str:
    logical_column_count = max([len(alignments), *(len(row) for row in rows), 0])
    active_columns: list[dict[str, object] | None] = [None] * logical_column_count
    rendered_rows: list[list[dict[str, object]]] = []

    for row in rows:
        visible_cells: list[dict[str, object]] = []
        row_coverage: list[dict[str, object] | None] = [None] * logical_column_count

        for column_index in range(logical_column_count):
            cell = (row[column_index] if column_index < len(row) else "").strip()
            left_cell = row_coverage[column_index - 1] if column_index > 0 else None

            if cell == "<" and left_cell:
                left_cell["colspan"] = int(left_cell["colspan"]) + 1
                row_coverage[column_index] = left_cell
                continue

            if cell == "^" and active_columns[column_index]:
                upper_cell = active_columns[column_index]
                upper_cell["rowspan"] = int(upper_cell["rowspan"]) + 1
                row_coverage[column_index] = upper_cell
                continue

            if tag_name == "th":
                align = "center"
            else:
                align = alignments[column_index] if column_index < len(alignments) else ""
            cell_state: dict[str, object] = {
                "align": f' class="align-{align}"' if align else "",
                "colspan": 1,
                "rowspan": 1,
                "content": render_inline(cell),
                "tag_name": tag_name,
            }
            visible_cells.append(cell_state)
            row_coverage[column_index] = cell_state

        active_columns = row_coverage[:]
        rendered_rows.append(visible_cells)

    return "".join(
        "<tr>"
        + "".join(
            (
                f'<{cell_state["tag_name"]}{cell_state["align"]}'
                f'{f" colspan={chr(34)}{cell_state["colspan"]}{chr(34)}" if int(cell_state["colspan"]) > 1 else ""}'
                f'{f" rowspan={chr(34)}{cell_state["rowspan"]}{chr(34)}" if int(cell_state["rowspan"]) > 1 else ""}'
                f'>{cell_state["content"]}</{cell_state["tag_name"]}>'
            )
            for cell_state in visible_cells
        )
        + "</tr>"
        for visible_cells in rendered_rows
    )


def render_table(lines: list[str], start_index: int) -> tuple[str, int] | None:
    if start_index + 1 >= len(lines):
        return None

    header_cells = split_table_row(lines[start_index])
    separator_line = lines[start_index + 1].strip()
    if not header_cells or not is_table_separator(separator_line):
        return None

    alignments = [get_table_alignment(cell) for cell in split_table_row(separator_line) or []]
    has_visible_header = any(cell.strip() for cell in header_cells)
    body_rows: list[list[str]] = []
    index = start_index + 2

    while index < len(lines):
        candidate = lines[index].strip()
        if not candidate or "|" not in candidate:
            break
        row_cells = split_table_row(candidate)
        if not row_cells:
            break
        body_rows.append(row_cells)
        index += 1

    header_html = (
        render_table_section([header_cells], "th", alignments)
        if has_visible_header
        else ""
    )
    body_html = render_table_section(body_rows, "td", alignments)
    html_output = (
        '<div class="markdown-table-wrap"><table class="markdown-table">'
        + (f"<thead>{header_html}</thead>" if has_visible_header else "")
        + f"<tbody>{body_html}</tbody></table></div>"
    )
    return html_output, index


def markdown_to_html(markdown: str) -> tuple[str, str]:
    blocks: list[str] = []
    paragraph_lines: list[str] = []
    list_items: list[str] = []
    toc_items: list[dict[str, str | int]] = []
    lines = markdown.splitlines()
    skipped_first_title = False
    heading_numbers = [0] * 6

    def flush_paragraph() -> None:
        if not paragraph_lines:
            return
        content = " ".join(line.strip() for line in paragraph_lines if line.strip())
        if content:
            blocks.append(f"<p>{render_inline(content)}</p>")
        paragraph_lines.clear()

    def flush_list() -> None:
        if not list_items:
            return
        items = "".join(f"<li>{render_inline(item)}</li>" for item in list_items if item.strip())
        if items:
            blocks.append(f"<ul>{items}</ul>")
        list_items.clear()

    index = 0
    while index < len(lines):
        stripped = lines[index].rstrip().strip()

        if not stripped:
            flush_paragraph()
            flush_list()
            index += 1
            continue

        table = render_table(lines, index)
        if table:
            flush_paragraph()
            flush_list()
            table_html, next_index = table
            blocks.append(table_html)
            index = next_index
            continue

        if stripped == r"\[":
            flush_paragraph()
            flush_list()
            math_lines = [stripped]
            index += 1
            while index < len(lines):
                inner_line = lines[index].rstrip()
                math_lines.append(inner_line)
                if inner_line.strip() == r"\]":
                    index += 1
                    break
                index += 1
            blocks.append('<div class="math">\n' + "\n".join(math_lines) + "\n</div>")
            continue

        if stripped.startswith("- ") or stripped.startswith("* "):
            flush_paragraph()
            list_items.append(stripped[2:])
            index += 1
            continue

        heading_match = re.match(r"^(#{1,6})\s+(.*)$", stripped)
        if heading_match:
            flush_paragraph()
            flush_list()
            level = len(heading_match.group(1))
            if not skipped_first_title and level == 1:
                skipped_first_title = True
                index += 1
                continue
            heading_numbers[level - 1] += 1
            for heading_index in range(level, len(heading_numbers)):
                heading_numbers[heading_index] = 0
            numbering = ".".join(
                str(value) for value in heading_numbers[:level] if value > 0
            )
            heading_text = heading_match.group(2).strip()
            display_text = f"{numbering} {heading_text}"
            heading_id = re.sub(r"[^a-z0-9]+", "-", display_text.lower()).strip("-")
            if not heading_id:
                heading_id = f"section-{len(toc_items) + 1}"
            toc_items.append(
                {
                    "level": level,
                    "id": heading_id,
                    "text": display_text,
                }
            )
            text = render_inline(display_text)
            blocks.append(f'<h{level} id="{heading_id}">{text}</h{level}>')
            index += 1
            continue

        paragraph_lines.append(stripped)
        index += 1

    flush_paragraph()
    flush_list()
    toc_html = ""
    if toc_items:
        toc_links = "".join(
            (
                f'<li class="markdown-toc-item level-{item["level"]}">'
                f'<a href="#{item["id"]}">{html.escape(str(item["text"]))}</a>'
                "</li>"
            )
            for item in toc_items
        )
        toc_html = (
            '<nav class="markdown-toc" aria-label="页面目录">'
            '<div class="markdown-toc-card">'
            '<p class="markdown-toc-title">目录</p>'
            f"<ol>{toc_links}</ol>"
            "</div>"
            "</nav>"
        )
    return "\n".join(blocks), toc_html


def relative_prefix(output_dir: Path, path: Path) -> str:
    depth = len(path.relative_to(output_dir).parts)
    return "../" * depth


def build_markdown_page_html(
    output_dir: Path,
    markdown_path: Path,
    output_path: Path,
    page: str,
) -> str:
    template = read_template("doc-page.html")
    prefix = relative_prefix(output_dir, output_path.parent)
    markdown = markdown_path.read_text(encoding="utf-8")
    markdown, metadata = parse_markdown_metadata(markdown)
    title = extract_markdown_title(markdown, markdown_path.stem)
    content, toc = markdown_to_html(markdown)
    content = content or '<p class="markdown-status">文件为空。</p>'
    metadata_items = []
    if metadata.get("author"):
        metadata_items.append(f'作者：{escape_html(metadata["author"])}')
    if metadata.get("date"):
        metadata_items.append(f'日期：{escape_html(metadata["date"])}')
    metadata_html = (
        f'<div class="markdown-meta">{"".join(f"<span>{item}</span>" for item in metadata_items)}</div>'
        if metadata_items
        else ""
    )
    return template.format(
        title=title,
        page=page,
        base_path=prefix,
        root_path=f"{prefix}index.html",
        content=content,
        toc=toc,
        metadata=metadata_html,
    )


def write_generated_doc_pages(output_dir: Path) -> None:
    generated_outputs: set[Path] = set()

    for markdown_path in DOCS_DIR.rglob("*.md"):
        relative_markdown = markdown_path.relative_to(ROOT)
        if relative_markdown.as_posix() == "docs/link.md":
            continue

        output_path = output_dir / relative_markdown.with_suffix(".html")
        generated_outputs.add(output_path)
        page = (
            "about"
            if relative_markdown.as_posix() == "docs/about.md"
            else "doc"
        )
        content = build_markdown_page_html(output_dir, markdown_path, output_path, page)
        write_text(output_path, finalize_html(content, output_dir))

    docs_output_dir = output_dir / "docs"
    if docs_output_dir.exists():
        for html_path in docs_output_dir.rglob("*.html"):
            if html_path not in generated_outputs:
                html_path.unlink(missing_ok=True)


def build_to(output_dir: Path) -> None:
    prepare_output_dir(output_dir)
    copy_static_files(output_dir)
    write_site_data(output_dir, build_site_data())
    write_html_files(output_dir)
    for markdown_path_text, output_name, page in ROOT_MARKDOWN_PAGES:
        markdown_path = ROOT / markdown_path_text
        output_path = output_dir / output_name
        content = build_markdown_page_html(output_dir, markdown_path, output_path, page)
        write_text(output_path, finalize_html(content, output_dir))
    write_generated_doc_pages(output_dir)
    if output_dir == DEV_DIR:
        write_text(output_dir / "__reload.txt", str(time.time_ns()))
    print(f"Built site at {output_dir}")


def iter_watch_files() -> list[Path]:
    files: list[Path] = [ROOT / "build.py"]
    files.extend(HTML_DIR / name for name in HTML_FILES)

    for directory in WATCH_DIRECTORIES:
        root = ROOT / directory
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if path.is_file() and path.suffix.lower() in WATCH_FILE_SUFFIXES:
                files.append(path)

    return sorted(set(files))


def build_snapshot() -> dict[str, tuple[int, int]]:
    snapshot: dict[str, tuple[int, int]] = {}
    for path in iter_watch_files():
        stat = path.stat()
        snapshot[str(path)] = (stat.st_mtime_ns, stat.st_size)
    return snapshot


def watch_and_rebuild(output_dir: Path, interval: float) -> None:
    previous = build_snapshot()
    print(f"Watching for changes every {interval:.1f}s ...")

    while True:
        time.sleep(interval)
        current = build_snapshot()
        if current == previous:
            continue

        changed = sorted(set(previous) ^ set(current))
        if not changed:
            changed = [
                name for name, state in current.items() if previous.get(name) != state
            ]

        preview = ", ".join(
            Path(name).relative_to(ROOT).as_posix() for name in changed[:5]
        )
        if len(changed) > 5:
            preview += ", ..."
        print(f"Detected changes: {preview}")

        build_to(output_dir)
        previous = current


class QuietDevRequestHandler(SimpleHTTPRequestHandler):
    def log_message(self, format: str, *args: object) -> None:
        # Keep the dev server quiet; rebuild messages are enough signal.
        return


def run_dev_server(
    output_dir: Path,
    host: str,
    port: int,
    open_browser: bool,
) -> None:
    handler = partial(QuietDevRequestHandler, directory=os.fspath(output_dir))
    server = ThreadingHTTPServer((host, port), handler)
    url = f"http://{host if host != '0.0.0.0' else '127.0.0.1'}:{port}/index.html"

    print(f"Serving {output_dir} at {url}")
    if open_browser:
        print("Opening browser ...")
        threading.Timer(0.3, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    finally:
        server.server_close()


def run_dev(args: argparse.Namespace) -> None:
    build_to(DEV_DIR)

    watcher = threading.Thread(
        target=watch_and_rebuild,
        args=(DEV_DIR, max(args.interval, 0.2)),
        daemon=True,
    )
    watcher.start()
    run_dev_server(DEV_DIR, args.host, args.port, not args.no_open)


def run_deploy(_: argparse.Namespace) -> None:
    build_to(DIST)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Cards viewer workflow tools.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    deploy_parser = subparsers.add_parser(
        "deploy",
        help="Build the production site into dist/.",
    )
    deploy_parser.set_defaults(handler=run_deploy)

    dev_parser = subparsers.add_parser(
        "dev",
        help="Build, watch, serve, and open the site for local development.",
    )
    dev_parser.add_argument("--host", default="127.0.0.1")
    dev_parser.add_argument("--port", type=int, default=8000)
    dev_parser.add_argument("--interval", type=float, default=0.8)
    dev_parser.add_argument(
        "--no-open",
        action="store_true",
        help="Start the dev server without opening a browser window.",
    )
    dev_parser.set_defaults(handler=run_dev)

    return parser.parse_args()


def main() -> None:
    args = parse_args()
    args.handler(args)


if __name__ == "__main__":
    main()


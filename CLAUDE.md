# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development mode (build + watch + dev server at http://127.0.0.1:8000)
python build.py dev

# Dev server with custom options
python build.py dev --host 0.0.0.0 --port 3000 --interval 0.5 --no-open

# Production build (output to dist/)
python build.py deploy

# No Node.js, npm, or package.json -- this is a pure Python + vanilla HTML/CSS/JS project.
# No tests, linters, or formatters are configured.
```

## Architecture

A **static site** for organizing and displaying Chinese bank card information (debit, credit, prepaid, transit). Built with zero frameworks -- all vanilla HTML/CSS/JavaScript.

### Build System (`build.py`)

Python 3 script that executes a 6-step pipeline:

1. **Prepare output directory** -- `dist/` for deploy, `.dev/` for dev
2. **Copy static files** -- `assets/`, `css/`, `js/` → output dir
3. **Build site data** -- Reads `assets/manifest.json` to enumerate banks, loads each `assets/banks/*/*/data.json`, merges with `referral.json`, `footer-links.json`, `bin-overlays.json`, `regions.json`, and writes as `js/generated/site-data.js` (`window.__CARDS_VIEWER_DATA__`)
4. **Write HTML pages** -- Injects preloaded data script into each `html/*.html` template before `common.js`
5. **Build Markdown docs** -- Custom MD-to-HTML renderer (heading auto-numbering with TOC sidebar, tables with colspan/rowspan), wrapped in `templates/doc-page.html`
6. **Clean stale docs** -- Removes orphaned `.html` files in `docs/`

Dev mode also starts a file watcher (0.8s polling) + HTTP server + auto-opens browser.

### Runtime (Browser)

5 pages, each a separate `.html` file loaded with pre-injected data:

| Page | File | Purpose |
|------|------|---------|
| Home | `html/index.html` + `js/index.js` | Card gallery: grid, search, filters (issuer, org, region, status), sort, card detail modal, image lightbox |
| Credit | `html/credit.html` + `js/credit.js` | Credit card table with full specs |
| BIN | `html/bin.html` + `js/bin.js` | BIN lookup table grouped by BIN number |
| Referral | `html/referral.html` + `js/referral.js` | Referral links table |
| Withdrawal | `html/withdrawal.html` + `js/withdrawal.js` | ATM withdrawal fee calculator with live FX rates (Frankfurter API) |

### Shared JS Modules

All are IIFEs exposing global namespaces via `window`:

- **`js/common.js`** -- `window.cardUtils` (~30 utility functions), nav bar, footer, theme toggle (localStorage key: `bankcard-theme`), cookie consent, back-to-top
- **`js/currency.js`** -- `window.currencyUtils` (13 currencies, formatting, parsing)
- **`js/batch.js`** -- `window.batchUtils` (requestAnimationFrame-batched DOM append)

### Data Flow

1. **Build time**: Python bundles all `data.json` files into `site-data.js`
2. **Page load**: `<script>` tag for `site-data.js` sets `window.__CARDS_VIEWER_DATA__` immediately
3. **Runtime**: Each page's JS reads from `window.__CARDS_VIEWER_DATA__` synchronously (no async fetch needed)

### Card Data Schema (`assets/banks/*/*/data.json`)

```json
{
  "bank": {
    "native_name": "Bank Name (Chinese)",
    "english_name": "Bank Name (English)",
    "region": "CN",
    "tag": "state|stock|city|rural|foreign|digital|transit",
    "province": "Beijing",
    "url": "...",
    "logo": "logo.svg"
  },
  "cards": [
    {
      "name": "Card Name",
      "type": "Debit|Credit|Prepaid|Transit",
      "organization": "UnionPay|VISA|Mastercard|AMEX|JCB|China T-Union",
      "tier": "Standard|Gold|Platinum|World|World Elite|Signature|Infinite|Diamond|...",
      "bin": "621663",
      "currency": ["CNY", "USD"],
      "ext": "png|jpg|jpeg|webp",
      "status": "active|inactive|expired|cancelled",
      "acquired": "2026-05",
      "alt_image": "alt-filename.png",
      "billing_day": "06",
      "due_day": "26",
      "annual_fee": "无",
      "ftf": "0%",
      "limit": {"CNY": "125000"},
      "sub_card": true
    }
  ]
}
```

### CSS Architecture

- **`css/common.css`** -- Shared styles: nav, layout, card gallery grid, card modal, image lightbox, filter panels, sort controls, theme variables (light/dark via `[data-theme]` on `<html>`), responsive breakpoints (820px, 600px), cookie notice, footer, back-to-top
- **Per-page CSS** -- `credit.css`, `bin.css`, `referral.css`, `withdrawal.css`, `article.css` (docs)

### Key Conventions

- All JS uses IIFEs (`(() => { ... })()`) to scope variables
- Only 3 global objects: `window.cardUtils`, `window.currencyUtils`, `window.batchUtils`, plus `window.__CARDS_VIEWER_DATA__`
- Images use deferred loading (`data-src` → `queueImageLoad`/`activateDeferredImages`)
- URL query params serialize filter state for shareable URLs (index.js, credit.js)
- Card images stored alongside `data.json` in each bank directory; file names match `name` field (with fallback to `alt_image`)
- All text content is in Chinese

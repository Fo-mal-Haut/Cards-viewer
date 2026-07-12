(() => {
  const themeKey = "bankcard-theme";
  const GITHUB_REPOSITORY_URL = "https://github.com/wanglh03/cards-viewer";
  const EXTERNAL_URL_PATTERN = /^(https?:)?\/\//i;
  const GITHUB_ICON_MARKUP = `
    <svg class="icon-link-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M12 .5C5.65.5.5 5.66.5 12.03c0 5.09 3.29 9.4 7.86 10.92.58.11.79-.25.79-.56 0-.28-.01-1.19-.02-2.15-3.2.7-3.88-1.36-3.88-1.36-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.2 1.77 1.2 1.03 1.78 2.71 1.27 3.37.97.1-.75.4-1.27.73-1.56-2.56-.29-5.24-1.29-5.24-5.73 0-1.27.45-2.3 1.19-3.11-.12-.29-.52-1.47.11-3.05 0 0 .97-.31 3.17 1.19a10.94 10.94 0 0 1 5.77 0c2.19-1.5 3.16-1.19 3.16-1.19.64 1.58.24 2.76.12 3.05.74.81 1.18 1.84 1.18 3.11 0 4.45-2.68 5.44-5.24 5.73.41.36.78 1.08.78 2.18 0 1.58-.01 2.85-.01 3.24 0 .31.21.68.8.56A11.53 11.53 0 0 0 23.5 12.03C23.5 5.66 18.35.5 12 .5Z" />
    </svg>`;
  const page = document.body?.dataset.page || "home";
  const basePath = document.body?.dataset.basePath || "";
  const rootPath = document.body?.dataset.rootPath || `${basePath}index.html`;
  const isHome = page === "home";
  const isCredit = page === "credit";
  const isBin = page === "bin";
  const isWithdrawal = page === "withdrawal";
  const isAbout = page === "about";

  function withBasePath(path) {
    const text = String(path || "").trim();
    if (
      !text ||
      /^(https?:)?\/\//i.test(text) ||
      text.startsWith("/") ||
      text.startsWith("#") ||
      text.startsWith("./") ||
      text.startsWith("../")
    ) {
      return text;
    }
    return `${basePath}${text}`;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function sanitizeFilename(name) {
    return String(name || "")
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, " ");
  }

  function assetPath(...parts) {
    return withBasePath(
      parts.map((part) => encodeURIComponent(part)).join("/"),
    );
  }

  function resolveImageUrl(bankKey, value) {
    const text = String(value || "").trim();
    if (!text) return "";
    if (
      /^(https?:)?\/\//i.test(text) ||
      text.startsWith("/") ||
      text.startsWith("assets/")
    ) {
      return text;
    }
    const preloaded = getPreloadedSiteData();
    const category = preloaded?.bankToCategory?.[bankKey] || "";
    const parts = ["assets", "banks"];
    if (category) parts.push(category);
    parts.push(bankKey, text);
    return assetPath(...parts);
  }

  function toArray(value) {
    if (Array.isArray(value)) return value;
    if (value === undefined || value === null) return [];
    return [value];
  }

  function firstDefined(...values) {
    return values.find(
      (value) => value !== undefined && value !== null && value !== "",
    );
  }

  function compareText(a, b) {
    return String(a || "").localeCompare(String(b || ""), "zh-Hans-CN", {
      numeric: true,
      sensitivity: "base",
    });
  }

  function formatCell(value, fallback = "-") {
    const text = String(value || "").trim();
    return text || fallback;
  }

  function normalizeCardStatus(value) {
    return String(value || "")
      .trim()
      .toLowerCase();
  }

  function queueImageLoad(image, src) {
    if (!image || !src) return;
    image.dataset.src = src;
  }

  function activateDeferredImages(scope) {
    if (!scope || typeof scope.querySelectorAll !== "function") return;
    scope.querySelectorAll("img[data-src]").forEach((image) => {
      const src = image.dataset.src;
      if (!src || image.src) return;
      image.src = src;
      image.removeAttribute("data-src");
    });
  }

  function createOption(value, label) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    return option;
  }

  function appendBankNameContent(
    container,
    label,
    logoUrl,
    immediateLoad = false,
  ) {
    if (!container) return;

    const wrapper = document.createElement("span");
    wrapper.className = "bank-name-inline";

    if (logoUrl) {
      const image = document.createElement("img");
      image.className = "bank-logo-inline";
      image.alt = "";
      image.setAttribute("aria-hidden", "true");
      if (immediateLoad) {
        image.src = logoUrl;
      } else {
        queueImageLoad(image, logoUrl);
      }
      wrapper.append(image);
    }

    const text = document.createElement("span");
    text.textContent = label;
    wrapper.append(text);
    container.append(wrapper);
  }

  function getTierAccentClass(tier, fallback = "") {
    const value = String(tier || "")
      .trim()
      .toLowerCase();
    if (!value) return fallback;
    if (
      [
        "infinite",
        "world legend",
        "world elite",
        "centurion",
        "icon",
        "diamond",
        "ultimate",
      ].includes(value)
    ) {
      return "tier-accent-diamond";
    }
    if (["signature", "world"].includes(value)) {
      return "tier-accent-spectrum";
    }
    if (["gold", "select"].includes(value)) {
      return "tier-accent-gold";
    }
    if (value === "platinum") return "tier-accent-platinum";
    return fallback;
  }

  function isExternalUrl(url) {
    return EXTERNAL_URL_PATTERN.test(String(url || ""));
  }

  function renderLinkAttributes(href, className = "") {
    const classes = [className, isExternalUrl(href) ? "external-link" : ""]
      .filter(Boolean)
      .join(" ");
    const attributes = [
      classes ? `class="${classes}"` : "",
      `href="${escapeHtml(href)}"`,
      isExternalUrl(href) ? 'target="_blank" rel="noopener noreferrer"' : "",
    ].filter(Boolean);
    return attributes.join(" ");
  }

  function renderLink(label, url, className = "") {
    const href = withBasePath(url);
    return `<a ${renderLinkAttributes(href, className)}>${escapeHtml(label)}</a>`;
  }

  function createExternalLink(url, label = url) {
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "external-link";
    link.textContent = label;
    return link;
  }

  function renderGithubLink(className) {
    return `<a class="${className}" href="${GITHUB_REPOSITORY_URL}" target="_blank" rel="noopener noreferrer" aria-label="GitHub 仓库" title="GitHub 仓库">${GITHUB_ICON_MARKUP}</a>`;
  }

  function normalizeOrganizationKey(organization) {
    const text = String(organization || "").trim();
    if (!text) return "";
    if (text === "Mastercard") return "Mastercard.png";
    if (text === "VISA") return "VISA.png";
    if (text === "AMEX") return "AMEX.png";
    if (text === "UnionPay") return "UnionPay.png";
    if (text === "JCB") return "JCB.png";
    if (text === "China T-Union") return "China_T-union.svg";
    return text;
  }

  function organizationIconUrl(organization) {
    const key = normalizeOrganizationKey(organization);
    if (!key) return "";
    return assetPath("assets", "logo", key);
  }

  function resolveAssetFolderKey(item) {
    return typeof item === "string"
      ? item
      : item?.dir || item?.key || item?.id || item?.name || "";
  }

  function getPreloadedSiteData() {
    const data = window.__CARDS_VIEWER_DATA__;
    return data && typeof data === "object" ? data : null;
  }

  function getBinOverlayText(bin) {
    const key = String(bin || "").trim();
    if (!key) return "";
    const preloaded = getPreloadedSiteData();
    const overlays = preloaded?.binOverlays;
    if (!overlays || typeof overlays !== "object") return "";
    for (const [label, bins] of Object.entries(overlays)) {
      if (!Array.isArray(bins)) continue;
      if (bins.some((item) => String(item || "").trim() === key)) {
        return String(label || "").trim();
      }
    }
    return "";
  }

  async function fetchJsonSafe(url, options = {}) {
    try {
      const res = await fetch(withBasePath(url), { cache: "no-cache" });
      const text = await res.text();
      if (!res.ok) {
        if (options.warn) {
          console.warn(`JSON request failed: ${url}`, res.status);
        }
        return null;
      }
      try {
        return JSON.parse(text);
      } catch {
        if (options.warn) {
          console.warn(
            `JSON response was not valid JSON: ${url}`,
            text.slice(0, 80),
          );
        }
        return null;
      }
    } catch (error) {
      if (options.warn) {
        console.warn(`JSON request failed: ${url}`, error);
      }
      return null;
    }
  }

  async function discoverAssetFolders(options = {}) {
    const preloaded = getPreloadedSiteData();
    if (Array.isArray(preloaded?.manifest)) {
      return preloaded.manifest.slice();
    }
    if (preloaded?.manifestCategories && typeof preloaded.manifestCategories === "object") {
      return Object.values(preloaded.manifestCategories).flat();
    }

    const manifest = await fetchJsonSafe("assets/manifest.json", {
      warn: options.warn,
    });
    if (typeof manifest === "object" && manifest !== null && !Array.isArray(manifest)) {
      return Object.values(manifest).flat();
    }
    if (Array.isArray(manifest)) {
      return manifest.slice();
    }
    if (manifest && options.warn) {
      console.warn("assets/manifest.json has an unexpected format");
    }
    return [];
  }

  async function loadCardsFromAssets(mapEntry, options = {}) {
    if (typeof mapEntry !== "function") return [];

    const warn = Boolean(options.warn);
    const onBatch =
      typeof options.onBatch === "function" ? options.onBatch : null;
    const issuers = await discoverAssetFolders({ warn });
    const preloaded = getPreloadedSiteData();
    const loaded = [];

    for (const item of issuers) {
      const bankKey = resolveAssetFolderKey(item);
      if (!bankKey) continue;

      const category = preloaded?.bankToCategory?.[bankKey] || "";
      const parts = ["assets", "banks"];
      if (category) parts.push(category);
      parts.push(bankKey, "data.json");
      const url = assetPath(...parts);
      const data =
        preloaded?.banks?.[bankKey] || (await fetchJsonSafe(url, { warn }));
      if (!data || !data.bank || !Array.isArray(data.cards)) {
        if (warn) {
          console.warn(`Skipped issuer data: ${url}`);
        }
        continue;
      }

      const batch = [];
      for (const entry of data.cards) {
        const mapped = mapEntry(bankKey, data.bank, entry);
        if (mapped !== null && mapped !== undefined) {
          loaded.push(mapped);
          batch.push(mapped);
        }
      }

      if (batch.length && onBatch) {
        await onBatch(batch, {
          bankKey,
          bank: data.bank,
          loadedCount: loaded.length,
        });
      }
    }

    return loaded;
  }

  async function loadCardsFromAssetsProgressively(mapEntry, options = {}) {
    return loadCardsFromAssets(mapEntry, options);
  }

  async function loadReferralItems(options = {}) {
    const preloaded = getPreloadedSiteData();
    if (Array.isArray(preloaded?.referral?.items)) {
      return preloaded.referral.items.slice();
    }

    const data = await fetchJsonSafe("assets/referral.json", options);
    return Array.isArray(data?.items) ? data.items : [];
  }

  async function loadFooterLinks(options = {}) {
    const preloaded = getPreloadedSiteData();
    if (Array.isArray(preloaded?.footerLinks?.columns)) {
      return preloaded.footerLinks.columns.slice();
    }

    const data = await fetchJsonSafe("assets/footer-links.json", options);
    return Array.isArray(data?.columns) ? data.columns : [];
  }

  window.cardUtils = {
    sanitizeFilename,
    assetPath,
    resolveImageUrl,
    toArray,
    firstDefined,
    compareText,
    formatCell,
    normalizeCardStatus,
    queueImageLoad,
    activateDeferredImages,
    createOption,
    appendBankNameContent,
    getTierAccentClass,
    createExternalLink,
    normalizeOrganizationKey,
    organizationIconUrl,
    resolveAssetFolderKey,
    getBinOverlayText,
    fetchJsonSafe,
    discoverAssetFolders,
    loadCardsFromAssets,
    loadCardsFromAssetsProgressively,
    loadReferralItems,
    loadFooterLinks,
  };

  function getSavedTheme() {
    try {
      return localStorage.getItem(themeKey);
    } catch {
      return null;
    }
  }

  function setTheme(theme) {
    if (!theme) return;
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(themeKey, theme);
    } catch {
      // Ignore storage failures.
    }
  }

  function currentTheme() {
    return (
      document.documentElement.dataset.theme ||
      (window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light")
    );
  }

  const savedTheme = getSavedTheme();
  if (savedTheme) {
    document.documentElement.dataset.theme = savedTheme;
  }

  const primaryNavigationMarkup = [
    ["卡片收藏", "index.html", isHome],
    ["现持信用卡", "credit.html", isCredit],
    ["卡 BIN 一览", "bin.html", isBin],
    ["取款手续费", "withdrawal.html", isWithdrawal],
  ]
    .map(([label, href, active]) =>
      renderLink(label, href, `nav-link${active ? " is-active" : ""}`),
    )
    .join("");

  const navRoot = document.querySelector("#siteNav");
  if (navRoot) {
    navRoot.innerHTML = `
      <nav class="topbar" aria-label="页面导航">
        <a class="organization" href="${rootPath}" aria-label="卡片收藏首页">
          <span class="organization-mark" aria-hidden="true">卡</span>
          <span>卡片收藏</span>
        </a>
        <div class="toolbar">
          <button
            class="nav-toggle"
            id="navToggle"
            type="button"
            aria-expanded="false"
            aria-controls="navLinks"
            aria-label="展开页面导航"
          >
            <span class="nav-toggle-bar" aria-hidden="true"></span>
            <span class="nav-toggle-bar" aria-hidden="true"></span>
            <span class="nav-toggle-bar" aria-hidden="true"></span>
          </button>
          <div class="nav-links" id="navLinks" aria-label="页面切换" aria-hidden="false">
            <div class="nav-drawer-panel">
              <div class="nav-drawer-main">
                ${primaryNavigationMarkup}
                <div class="nav-menu-group nav-documents-group">
                  <button
                    class="nav-link nav-submenu-toggle"
                    id="navDocumentsToggle"
                    type="button"
                    aria-expanded="false"
                    aria-controls="navDocumentsSubmenu"
                  >
                    <span>文档</span>
                    <span class="nav-submenu-chevron" aria-hidden="true">⌄</span>
                  </button>
                  <div
                    class="nav-submenu"
                    id="navDocumentsSubmenu"
                    aria-label="文档子菜单"
                    aria-hidden="true"
                  ></div>
                </div>
                ${renderLink(
                  "关于",
                  "docs/about.html",
                  `nav-link${isAbout ? " is-active" : ""}`,
                )}
                ${renderGithubLink("nav-link nav-github-mobile")}
              </div>
            </div>
          </div>
          ${renderGithubLink("icon-link nav-github-desktop")}
          <button
            class="theme-toggle"
            id="themeToggle"
            type="button"
            aria-label="切换明暗主题"
          >
            <span class="theme-icon" aria-hidden="true"></span>
          </button>
        </div>
      </nav>
    `;
  }

  const footerRoot = document.querySelector("#siteFooter");
  if (footerRoot) {
    footerRoot.innerHTML = `
      <footer class="site-footer">
        <div class="footer-columns" id="footerColumns"></div>
        ${renderGithubLink("footer-repository-link")}
        <div class="copyright">© 2026 GTB. All rights reserved.</div>
      </footer>
    `;
  }

  function renderFooterLinks(columns) {
    const footerColumns = document.querySelector("#footerColumns");
    const navDocumentsSubmenu = document.querySelector("#navDocumentsSubmenu");
    if (!footerColumns && !navDocumentsSubmenu) return;

    const documentColumn = columns.find(
      (column) =>
        column?.title === "文档" ||
        column?.links?.some((link) =>
          String(link?.url || "").startsWith("/docs/"),
        ),
    );

    if (navDocumentsSubmenu) {
      navDocumentsSubmenu.innerHTML = (documentColumn?.links || [])
        .filter((link) => link?.label && link?.url)
        .map((link) => renderLink(link.label, link.url, "nav-submenu-link"))
        .join("");
    }

    const html = columns
      .filter((column) => column && Array.isArray(column.links))
      .map((column) => {
        const links = column.links
          .filter((link) => link?.label && link?.url)
          .map((link) => `<li>${renderLink(link.label, link.url)}</li>`)
          .join("");

        if (!links) return "";
        return `
          <section class="footer-column" aria-label="${escapeHtml(column.title || "底部链接")}">
            <h2 class="footer-column-title">${escapeHtml(column.title || "")}</h2>
            <ul class="footer-column-links">
              ${links}
            </ul>
          </section>
        `;
      })
      .join("");

    if (footerColumns) {
      footerColumns.innerHTML = html;
    }
  }

  if (!document.querySelector("#backToTop")) {
    const backToTop = document.createElement("button");
    backToTop.id = "backToTop";
    backToTop.className = "back-to-top";
    backToTop.type = "button";
    backToTop.setAttribute("aria-label", "回到顶部");
    backToTop.textContent = "↑";
    document.body.append(backToTop);
  }

  const themeToggle = document.querySelector("#themeToggle");
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const next = currentTheme() === "dark" ? "light" : "dark";
      setTheme(next);
    });
  }

  const navToggle = document.querySelector("#navToggle");
  const navLinks = document.querySelector("#navLinks");
  const navDocumentsGroup = document.querySelector(".nav-documents-group");
  const navDocumentsToggle = document.querySelector("#navDocumentsToggle");
  const navDocumentsSubmenu = document.querySelector("#navDocumentsSubmenu");
  if (navToggle && navLinks) {
    const documentsCloseDelay = 200;
    let documentsCloseTimer = null;

    const cancelDocumentsClose = () => {
      if (documentsCloseTimer === null) return;
      window.clearTimeout(documentsCloseTimer);
      documentsCloseTimer = null;
    };

    const closeDocumentsLater = () => {
      cancelDocumentsClose();
      if (window.innerWidth <= 820) return;
      documentsCloseTimer = window.setTimeout(() => {
        documentsCloseTimer = null;
        setDocumentsOpen(false);
      }, documentsCloseDelay);
    };

    const setDocumentsOpen = (open) => {
      if (!navDocumentsToggle || !navDocumentsSubmenu) return;
      cancelDocumentsClose();
      navDocumentsToggle.setAttribute("aria-expanded", String(open));
      navDocumentsSubmenu.classList.toggle("is-open", open);
      navDocumentsSubmenu.setAttribute("aria-hidden", String(!open));
    };

    const setNavOpen = (open) => {
      navToggle.setAttribute("aria-expanded", String(open));
      navLinks.classList.toggle("is-open", open);
      navLinks.setAttribute(
        "aria-hidden",
        String(!open && window.innerWidth <= 820),
      );
      document.body.classList.toggle("nav-open", open);
      if (!open) setDocumentsOpen(false);
    };
    const closeNav = () => setNavOpen(false);

    navToggle.addEventListener("click", () => {
      const isOpen = navToggle.getAttribute("aria-expanded") === "true";
      setNavOpen(!isOpen);
    });

    navLinks.querySelectorAll("a.nav-link").forEach((link) => {
      link.addEventListener("click", closeNav);
    });

    navDocumentsToggle?.addEventListener("click", () => {
      const isOpen =
        navDocumentsToggle.getAttribute("aria-expanded") === "true";
      setDocumentsOpen(!isOpen);
    });

    navDocumentsGroup?.addEventListener("mouseenter", () => {
      if (window.innerWidth > 820) {
        cancelDocumentsClose();
        setDocumentsOpen(true);
      }
    });

    navDocumentsGroup?.addEventListener("mouseleave", () => {
      closeDocumentsLater();
    });

    navLinks.addEventListener("click", (event) => {
      if (event.target === navLinks) {
        closeNav();
      }
    });

    document.addEventListener("click", (event) => {
      const isOpen = navToggle.getAttribute("aria-expanded") === "true";
      if (
        isOpen &&
        !navLinks.contains(event.target) &&
        !navToggle.contains(event.target)
      ) {
        closeNav();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeNav();
      }
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 820) {
        closeNav();
      }
    });

    setNavOpen(false);
  }

  const backToTopButton = document.querySelector("#backToTop");
  if (backToTopButton) {
    const updateBackToTopState = () => {
      backToTopButton.classList.toggle("is-visible", window.scrollY > 320);
    };

    backToTopButton.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    window.addEventListener("scroll", updateBackToTopState, { passive: true });
    updateBackToTopState();
  }

  loadFooterLinks().then(renderFooterLinks);
})();

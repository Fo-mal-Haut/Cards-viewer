let cards = [];
let pendingOrganizationFilterValue = "all";
let pendingIssuerFilterValue = "all";
let pendingRegionFilterValue = "all";
let creditOrgValue = "all";
let creditIssuerValue = "all";
let creditRegionValue = "all";
let initialDataLoaded = false;

const cardUtils = window.cardUtils || {};
const currencyUtils = window.currencyUtils || {};
const batchUtils = window.batchUtils || {};

const {
  sanitizeFilename,
  resolveImageUrl,
  toArray,
  firstDefined,
  organizationIconUrl,
  loadCardsFromAssetsProgressively,
  compareText,
  formatCell,
  queueImageLoad,
  activateDeferredImages,
  createOption,
  appendBankNameContent,
  normalizeCardStatus,
  createFilterTag,
} = cardUtils;

const { parseCurrencyAmount, formatCurrencyDisplay } = currencyUtils;
const { appendInBatches } = batchUtils;

const ORGANIZATION_ORDER = ["Mastercard", "VISA", "AMEX", "UnionPay", "JCB"];

const ORGANIZATION_DISPLAY = {
  mastercard: "Mastercard",
  visa: "VISA",
  amex: "AMEX",
  unionpay: "UnionPay",
  jcb: "JCB",
  "china t-union": "China T-Union",
};

const TIER_ORDER_MAP = {
  Mastercard: [
    "World Legend",
    "World Elite",
    "World",
    "Platinum",
    "Titanium",
    "Gold",
    "Standard",
  ],
  VISA: ["Infinite", "Signature", "Platinum", "Gold", "Classic"],
  AMEX: [
    "Centurion",
    "Icon",
    "Platinum",
    "Max",
    "Gold",
    "Select",
    "Green",
    "Member",
  ],
  UnionPay: ["Diamond", "Platinum", "Gold", "Standard"],
  JCB: ["Eternity", "Precious", "Platinum", "Gold"],
};

const tbody = document.querySelector("#creditTableBody");
const template = document.querySelector("#creditRowTemplate");
const searchInput = document.querySelector("#tableSearchInput");
const organizationFilter = document.querySelector("#creditOrganizationFilter");
const issuerFilter = document.querySelector("#creditIssuerFilter");
const regionFilter = document.querySelector("#creditRegionFilter");
const imageLightbox = document.querySelector("#imageLightbox");
const lightboxImage = document.querySelector("#lightboxImage");

function normalizeRegionQueryValue(value) {
  const text = String(value || "").trim();
  if (!text || text === "all") return "all";
  return /^[A-Za-z]{2}$/.test(text) ? text.toUpperCase() : "all";
}

function normalizeIssuerValue(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function getUrlState() {
  const params = new URLSearchParams(window.location.search);
  return {
    search: params.get("search") || "",
    organization: params.get("organization") || "all",
    issuer: params.get("issuer") || "all",
    region: normalizeRegionQueryValue(params.get("region") || "all"),
  };
}

function applyUrlState(state = getUrlState()) {
  if (searchInput) searchInput.value = state.search;
  pendingOrganizationFilterValue = state.organization || "all";
  pendingIssuerFilterValue = state.issuer || "all";
  pendingRegionFilterValue = state.region || "all";
  creditOrgValue = pendingOrganizationFilterValue;
  creditIssuerValue = pendingIssuerFilterValue;
  creditRegionValue = pendingRegionFilterValue;
}

function updateUrlState() {
  const params = new URLSearchParams();
  const search = String(searchInput?.value || "").trim();
  const organization = creditOrgValue;
  const issuer = creditIssuerValue;
  const region = creditRegionValue;

  if (search) params.set("search", search);
  if (issuer !== "all") params.set("issuer", issuer);
  if (organization !== "all") params.set("organization", organization);
  if (region !== "all") params.set("region", normalizeRegionQueryValue(region));

  const query = params.toString();
  const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
  window.history.replaceState(null, "", nextUrl);
}

function normalizeOrganizationName(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return ORGANIZATION_DISPLAY[text.toLowerCase()] || text;
}

function getOrganizationRank(organization) {
  const normalized = normalizeOrganizationName(organization).toLowerCase();
  const index = ORGANIZATION_ORDER.findIndex(
    (item) => item.toLowerCase() === normalized,
  );
  return index === -1 ? ORGANIZATION_ORDER.length : index;
}

function sortOrganizationOptions(list) {
  return list.slice().sort((a, b) => {
    const rankDiff = getOrganizationRank(a) - getOrganizationRank(b);
    if (rankDiff !== 0) return rankDiff;
    return compareText(a, b);
  });
}

function getTierRank(organization, tier) {
  const organizationKey =
    ORGANIZATION_ORDER.find(
      (item) =>
        item.toLowerCase() ===
        normalizeOrganizationName(organization).toLowerCase(),
    ) || "";
  const tiers = TIER_ORDER_MAP[organizationKey] || [];
  const normalizedTier = String(tier || "").trim().toLowerCase();
  const index = tiers.findIndex((item) => item.toLowerCase() === normalizedTier);
  return index === -1 ? tiers.length : index;
}

function sortCreditCards(list) {
  return list.slice().sort((a, b) => {
    const organizationDiff =
      getOrganizationRank(a.organization) - getOrganizationRank(b.organization);
    if (organizationDiff !== 0) return organizationDiff;

    const tierDiff =
      getTierRank(a.organization, a.tier) - getTierRank(b.organization, b.tier);
    if (tierDiff !== 0) return tierDiff;

    const issuerDiff = compareText(a.issuer, b.issuer);
    if (issuerDiff !== 0) return issuerDiff;

    return compareText(a.name, b.name);
  });
}

function isSupplementaryCard(cardMeta) {
  const explicitFlag = firstDefined(cardMeta.sub_card);

  if (typeof explicitFlag === "boolean") return explicitFlag;
  if (typeof explicitFlag === "number") return explicitFlag === 1;
  if (typeof explicitFlag === "string") {
    return explicitFlag.trim().toLowerCase() === "true";
  }

  const name = String(cardMeta.name || "");
  if (name.includes("附卡")) return true;

  const desc = String(cardMeta.desc || "");
  return desc.includes("附卡");
}

function normalizeLimitMap(limitValue, fallbackCurrency = []) {
  if (!limitValue || typeof limitValue === "string") {
    const text = String(limitValue || "").trim();
    if (!text) return {};
    const fallbackCurrencyCode = String(toArray(fallbackCurrency)[0] || "CNY")
      .trim()
      .toUpperCase();
    return { [fallbackCurrencyCode]: text };
  }

  if (typeof limitValue !== "object" || Array.isArray(limitValue)) return {};

  return Object.entries(limitValue).reduce((acc, [currency, amount]) => {
    const code = String(currency || "").trim().toUpperCase();
    const value = String(amount || "").trim();
    if (!code || !value) return acc;
    acc[code] = value;
    return acc;
  }, {});
}

function sumCreditLimits(list) {
  const totals = {};
  const sharedLimitBanks = new Set();

  list
    .filter((card) => !card.supplementary)
    .forEach((card) => {
      if (card.sharedLimit && card.bankKey) {
        if (sharedLimitBanks.has(card.bankKey)) return;
        sharedLimitBanks.add(card.bankKey);
      }

      Object.entries(card.limitMap || {}).forEach(([currency, amount]) => {
        const value = parseCurrencyAmount(amount);
        if (value <= 0) return;
        totals[currency] = (totals[currency] || 0) + value;
      });
    });

  return totals;
}

function renderCreditStats(list) {
  const statsRoot = document.querySelector("#stats");
  if (!statsRoot) return;

  const totals = sumCreditLimits(list);
  const entries = Object.entries(totals);
  const display = entries.length
    ? entries
        .map(([currency, amount]) => formatCurrencyDisplay(currency, amount))
        .join(" + ")
    : "-";

  statsRoot.innerHTML = `
    <div class="stat stat-credit-total" tabindex="0" role="button" aria-label="总授信 ${display}">
      <strong>${display}</strong>
      <span>总授信</span>
    </div>
  `;
}

function renderLimitCell(cell, limitMap, sharedLimit = false) {
  cell.innerHTML = "";
  const values = Object.entries(limitMap || {})
    .filter(([, amount]) => parseCurrencyAmount(amount) > 0)
    .map(([currency, amount]) => {
      const formatted = formatCurrencyDisplay(currency, amount);
      return sharedLimit ? `共享${formatted}` : formatted;
    });

  if (!values.length) {
    cell.textContent = "-";
    return;
  }

  const list = document.createElement("div");
  list.className = "limit-list";

  values.forEach((value) => {
    const item = document.createElement("div");
    item.className = "limit-item";
    item.textContent = value;
    list.append(item);
  });

  cell.append(list);
}

function buildCreditRow(card) {
  const row = template.content.firstElementChild.cloneNode(true);
  const image = row.querySelector("img");
  queueImageLoad(image, card.image);
  image.alt = card.name;
  image.title = "点击放大";
  image.addEventListener("click", (event) => {
    event.stopPropagation();
    openLightbox(card);
  });

  const organizationCell = row.querySelector(".card-organization-cell");
  if (card.organizationIcon) {
    const organizationIcon = document.createElement("img");
    organizationIcon.className = "organization-icon";
    organizationIcon.alt = card.organization;
    organizationIcon.title = card.organization;
    organizationIcon.loading = "lazy";
    queueImageLoad(organizationIcon, card.organizationIcon);
    organizationCell.append(organizationIcon);
  } else {
    organizationCell.textContent = formatCell(card.organization);
  }

  row.querySelector(".card-name-cell").textContent = formatCell(card.name);
  row.querySelector(".card-bin-cell").textContent = formatCell(card.bin);
  row.querySelector(".card-tier-cell").textContent = formatCell(card.tier);
  const issuerCell = row.querySelector(".card-issuer-cell");
  if (issuerCell) {
    issuerCell.innerHTML = "";
    appendBankNameContent(
      issuerCell,
      formatCell(card.issuer),
      card.bankLogoUrl,
      false,
    );
  }
  row.querySelector(".card-region-cell").textContent = formatCell(card.region);
  renderLimitCell(
    row.querySelector(".card-limit-cell"),
    card.limitMap,
    card.sharedLimit,
  );
  row.querySelector(".card-billing-day-cell").textContent = formatCell(
    card.billingDay,
  );
  row.querySelector(".card-due-day-cell").textContent = formatCell(card.dueDay);
  row.querySelector(".card-annual-fee-cell").textContent = formatCell(
    card.annualFee,
  );
  row.querySelector(".card-ftf-cell").textContent = formatCell(card.ftf);
  row.querySelector(".card-benefit-cell").textContent = formatCell(
    card.benefit,
  );
  return row;
}

function mapCreditCard(bankKey, bankInfo, entry) {
  const cardMeta = entry.card || entry;
  const typeRaw = String(cardMeta.type || "").trim().toLowerCase();
  if (typeRaw !== "credit") return null;

  const bankBillingDay = firstDefined(bankInfo.billing_day);
  const bankDueDay = firstDefined(bankInfo.due_day);
  const bankLimit = firstDefined(bankInfo.limit);
  const limitValue = bankLimit != null ? bankLimit : cardMeta.limit;
  const sharedLimit = bankLimit != null;

  const organization = normalizeOrganizationName(cardMeta.organization);
  const tier = String(cardMeta.tier || "").trim();
  const bin = String(toArray(cardMeta.bin)[0] || "").trim();
  const name = String(cardMeta.name || "").trim();
  const base = sanitizeFilename(name);
  const altImageUrl = resolveImageUrl(bankKey, cardMeta.alt_image || "");
  const image =
    altImageUrl || resolveImageUrl(bankKey, `${base}.${cardMeta.ext || ""}`);
  const supplementary = isSupplementaryCard(cardMeta);
  const cardName = supplementary ? `${name}（附卡）` : name;
  const issuer = String(
    bankInfo.native_name || bankInfo.english_name || bankKey || "",
  ).trim();
  const issuerValue = normalizeIssuerValue(
    bankInfo.english_name || bankKey || issuer,
  );
  const region = String(bankInfo.region || bankInfo.country || "").trim();

  return {
    bankKey,
    name: cardName,
    baseName: name,
    image,
    altImageUrl,
    bin,
    organization,
    organizationIcon: organizationIconUrl(organization),
    tier,
    issuer,
    issuerValue,
    bankLogoUrl: resolveImageUrl(bankKey, String(bankInfo.logo || "").trim()),
    region,
    limitMap: normalizeLimitMap(limitValue, cardMeta.currency),
    sharedLimit,
    supplementary,
    billingDay: String(
      bankBillingDay != null
        ? bankBillingDay
        : firstDefined(cardMeta.billing_day),
    ).trim(),
    dueDay: String(
      bankDueDay != null ? bankDueDay : firstDefined(cardMeta.due_day),
    ).trim(),
    status: normalizeCardStatus(cardMeta.status),
    annualFee: String(firstDefined(cardMeta.annual_fee) || "").trim(),
    ftf: String(firstDefined(cardMeta.ftf) || "").trim(),
    benefit: String(cardMeta.benefit || "").trim(),
    searchText: [
      cardName,
      bin,
      organization,
      tier,
      issuer,
      region,
      cardMeta.benefit,
    ]
      .join(" ")
      .toLowerCase(),
  };
}

function updateFilterOptions() {
  const currentOrganization =
    pendingOrganizationFilterValue || organizationFilter?.value || "all";
  const currentIssuer = pendingIssuerFilterValue || issuerFilter?.value || "all";
  const currentRegion = pendingRegionFilterValue || regionFilter?.value || "all";

  const organizations = sortOrganizationOptions(
    Array.from(new Set(cards.map((card) => card.organization).filter(Boolean))),
  );
  const issuers = Array.from(
    new Map(
      cards
        .filter((card) => card.issuerValue)
        .map((card) => [
          card.issuerValue,
          { value: card.issuerValue, label: card.issuer || card.issuerValue },
        ]),
    ).values(),
  ).sort((a, b) => compareText(a.label, b.label));
  const regions = Array.from(
    new Set(cards.map((card) => card.region).filter(Boolean)),
  ).sort((a, b) => compareText(a, b));

  if (organizationFilter) {
    organizationFilter.innerHTML = "";
    organizationFilter.append(createOption("all", "卡组织"));
    organizations.forEach((item) => {
      organizationFilter.append(createOption(item, item));
    });
    if (
      !initialDataLoaded &&
      currentOrganization !== "all" &&
      !organizations.includes(currentOrganization)
    ) {
      pendingOrganizationFilterValue = currentOrganization;
    } else {
      creditOrgValue = organizations.includes(currentOrganization)
        ? currentOrganization
        : "all";
      pendingOrganizationFilterValue = creditOrgValue;
      organizationFilter.selectedIndex = 0;
    }
  }

  if (issuerFilter) {
    issuerFilter.innerHTML = "";
    issuerFilter.append(createOption("all", "发行方"));
    issuers.forEach((item) => {
      issuerFilter.append(createOption(item.value, item.label));
    });
    if (
      !initialDataLoaded &&
      currentIssuer !== "all" &&
      !issuers.some((item) => item.value === currentIssuer)
    ) {
      pendingIssuerFilterValue = currentIssuer;
    } else {
      creditIssuerValue = issuers.some((item) => item.value === currentIssuer)
        ? currentIssuer
        : "all";
      pendingIssuerFilterValue = creditIssuerValue;
      issuerFilter.selectedIndex = 0;
    }
  }

  if (regionFilter) {
    regionFilter.innerHTML = "";
    regionFilter.append(createOption("all", "区域"));
    regions.forEach((item) => {
      regionFilter.append(createOption(item, item));
    });
    if (
      !initialDataLoaded &&
      currentRegion !== "all" &&
      !regions.includes(currentRegion)
    ) {
      pendingRegionFilterValue = currentRegion;
    } else {
      creditRegionValue = regions.includes(currentRegion) ? currentRegion : "all";
      pendingRegionFilterValue = creditRegionValue;
      regionFilter.selectedIndex = 0;
    }
  }
}

function openLightbox(card) {
  if (!card || !card.image || !imageLightbox || !lightboxImage) return;
  lightboxImage.src = card.image;
  lightboxImage.alt = `${card.name} 卡面`;
  imageLightbox.hidden = false;
}

function closeLightbox() {
  if (!imageLightbox || !lightboxImage) return;
  imageLightbox.hidden = true;
  lightboxImage.src = "";
  lightboxImage.alt = "";
}

function updateActiveFilters() {
  const container = document.querySelector("#activeFilters");
  if (!container) return;
  container.innerHTML = "";

  const org = creditOrgValue;
  if (org && org !== "all") {
    container.append(createFilterTag(org, () => {
      creditOrgValue = "all";
      pendingOrganizationFilterValue = "all";
      renderRows();
    }));
  }

  const issuer = creditIssuerValue;
  if (issuer && issuer !== "all") {
    const label = [...(issuerFilter?.options || [])].find(opt => opt.value === issuer)?.textContent || issuer;
    container.append(createFilterTag(label, () => {
      creditIssuerValue = "all";
      pendingIssuerFilterValue = "all";
      renderRows();
    }));
  }

  const region = creditRegionValue;
  if (region && region !== "all") {
    container.append(createFilterTag(region, () => {
      creditRegionValue = "all";
      pendingRegionFilterValue = "all";
      renderRows();
    }));
  }
}

function renderRows() {
  const search = String(searchInput?.value || "").trim().toLowerCase();
  const organizationValue = creditOrgValue;
  const issuerValue = creditIssuerValue;
  const regionValue = creditRegionValue;

  if (initialDataLoaded) {
    pendingOrganizationFilterValue = creditOrgValue;
    pendingIssuerFilterValue = creditIssuerValue;
    pendingRegionFilterValue = creditRegionValue;
  }
  updateUrlState();

  tbody.innerHTML = "";

  const filtered = sortCreditCards(
    cards.filter(
      (card) =>
        (organizationValue === "all" ||
          card.organization === organizationValue) &&
        (issuerValue === "all" || card.issuerValue === issuerValue) &&
        (regionValue === "all" || card.region === regionValue) &&
        (!search || card.searchText.includes(search)),
    ),
  );

  if (!filtered.length) {
    const emptyRow = document.createElement("tr");
    emptyRow.innerHTML =
      '<td class="empty-state" colspan="13">暂无符合条件的信用卡。</td>';
    tbody.append(emptyRow);
    return;
  }

  appendInBatches(filtered, buildCreditRow, tbody, {
    batchSize: 10,
    afterChunk(nodes) {
      window.requestAnimationFrame(() => {
        nodes.forEach((node) => activateDeferredImages(node));
      });
    },
  });

  updateActiveFilters();
}

async function init() {
  initialDataLoaded = false;
  applyUrlState();
  cards = [];
  renderCreditStats(cards);
  updateFilterOptions();
  renderRows();

  await loadCardsFromAssetsProgressively(mapCreditCard, {
    onBatch(batch) {
      const activeBatch = batch.filter((card) => card.status === "active");
      if (!activeBatch.length) return;
      cards = sortCreditCards(cards.concat(activeBatch));
      renderCreditStats(cards);
      updateFilterOptions();
      renderRows();
    },
  });

  initialDataLoaded = true;
  updateFilterOptions();
  renderRows();
}

searchInput?.addEventListener("input", renderRows);
[organizationFilter, issuerFilter, regionFilter].forEach((control) => {
  if (!control) return;
  control.addEventListener("change", () => {
    if (control === organizationFilter) creditOrgValue = control.value;
    else if (control === issuerFilter) creditIssuerValue = control.value;
    else creditRegionValue = control.value;
    control.selectedIndex = 0;
    renderRows();
  });
});

if (imageLightbox) {
  imageLightbox.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest("[data-close-lightbox]")) {
      closeLightbox();
    }
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && imageLightbox && !imageLightbox.hidden) {
    closeLightbox();
  }
});

window.addEventListener("popstate", () => {
  applyUrlState();
  updateFilterOptions();
  renderRows();
});

init();

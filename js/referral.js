const cardUtils = window.cardUtils || {};
const {
  compareText,
  createExternalLink,
  formatCell,
  loadReferralItems,
} = cardUtils;

const tbody = document.querySelector("#referralTableBody");
const template = document.querySelector("#referralRowTemplate");
const searchInput = document.querySelector("#referralSearchInput");

let referrals = [];

function normalizeReferral(entry) {
  const bank = String(entry?.bank || "").trim();
  const referral = String(entry?.referral || "").trim();
  const url = String(entry?.url || "").trim();
  const desc = String(entry?.desc || "").trim();

  return {
    bank,
    referral,
    url,
    desc,
    searchText: [bank, referral, url, desc].join(" ").toLowerCase(),
  };
}

function buildUrlCell(cell, url) {
  cell.replaceChildren();
  if (url) {
    cell.append(createExternalLink(url));
  } else {
    cell.textContent = "—";
  }
}

function buildRow(item) {
  const row = template.content.firstElementChild.cloneNode(true);
  row.querySelector(".referral-bank-cell").textContent = formatCell(item.bank, "—");
  row.querySelector(".referral-invitation-cell").textContent = formatCell(
    item.referral,
    "—",
  );
  buildUrlCell(row.querySelector(".referral-url-cell"), item.url);
  row.querySelector(".referral-desc-cell").textContent = formatCell(
    item.desc,
    "—",
  );
  return row;
}

function renderRows() {
  const search = String(searchInput?.value || "")
    .trim()
    .toLowerCase();

  const filtered = referrals
    .filter((item) => !search || item.searchText.includes(search))
    .sort((a, b) => compareText(a.bank, b.bank));

  tbody.replaceChildren();
  if (!filtered.length) {
    const emptyRow = document.createElement("tr");
    emptyRow.innerHTML =
      '<td class="empty-state" colspan="4">暂无符合条件的推荐信息。</td>';
    tbody.append(emptyRow);
    return;
  }

  const fragment = document.createDocumentFragment();
  filtered.forEach((item) => fragment.append(buildRow(item)));
  tbody.append(fragment);
}

async function init() {
  const items = await loadReferralItems({ warn: true });
  referrals = items.map(normalizeReferral);
  renderRows();
}

searchInput?.addEventListener("input", renderRows);
init();

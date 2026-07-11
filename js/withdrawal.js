(() => {
  const {
    appendBankNameContent,
    compareText,
    loadCardsFromAssets,
    resolveImageUrl,
    sanitizeFilename,
  } = window.cardUtils || {};
  const tbody = document.querySelector("#withdrawalTableBody");
  const template = document.querySelector("#withdrawalRowTemplate");
  const regionPicker = document.querySelector("#withdrawalRegionPicker");
  const regionTrigger = document.querySelector("#withdrawalRegionTrigger");
  const regionOptions = document.querySelector("#withdrawalRegionOptions");
  const summary = document.querySelector("#withdrawalSummary");

  let rows = [];
  let regions = [];
  let regionDropdownOpen = false;
  let selectedRegion = "CN";

  function getRegionLabel(code) {
    const value = String(code || "").trim();
    const region = regions.find((item) => item.code === value);
    return region ? `${region.name}（${region.code}）` : value || "未知地区";
  }

  function setRegionDropdownOpen(open) {
    regionDropdownOpen = open;
    regionOptions.hidden = !open;
    regionTrigger.setAttribute("aria-expanded", String(open));
  }

  function selectRegion(code) {
    selectedRegion = code;
    regionTrigger.textContent = getRegionLabel(code);
    regionOptions.querySelectorAll("[role=option]").forEach((option) => {
      const active = option.dataset.value === code;
      option.classList.toggle("is-active", active);
      option.setAttribute("aria-selected", String(active));
    });
    renderRows();
    renderSummary();
  }

  function formatFeeLines(fees) {
    if (Array.isArray(fees)) return fees;
    if (!fees || typeof fees !== "object") return [];
    return Object.entries(fees).map(([network, fee]) => {
      const values = Array.isArray(fee) ? fee : [fee];
      return `${network} ATM：${values
        .map((value) => String(value || "-").trim() || "-")
        .join("；")}`;
    });
  }

  function normalizeWithdrawal(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return {
        local:
          value.local && typeof value.local === "object" ? value.local : {},
        overseas:
          value.overseas && typeof value.overseas === "object"
            ? value.overseas
            : {},
      };
    }

    const text = String(value || "").trim();
    if (!text) return { local: [], overseas: [] };

    const overseasIndex = text.indexOf("海外");
    if (overseasIndex < 0) {
      return { local: [text], overseas: [] };
    }

    return {
      local: [text.slice(0, overseasIndex).replace(/[，,]\s*$/, "")],
      overseas: [text.slice(overseasIndex)],
    };
  }

  function appendLines(cell, lines) {
    cell.replaceChildren();
    if (!lines.length) {
      cell.textContent = "-";
      return;
    }

    lines.forEach((line) => {
      const item = document.createElement("span");
      item.className = "withdrawal-fee-line";
      item.textContent = line;
      cell.append(item);
    });
  }

  function sortRows(items) {
    return items.slice().sort((a, b) => {
      const issuerDiff = compareText(a.issuerEnglish, b.issuerEnglish);
      return issuerDiff || compareText(a.name, b.name);
    });
  }

  function buildRow(item) {
    const row = template.content.firstElementChild.cloneNode(true);
    const image = row.querySelector(".withdrawal-image-cell img");
    image.src = item.image;
    image.alt = `${item.name} 卡面`;
    row.querySelector(".withdrawal-name-cell").textContent = item.name || "-";
    const issuerCell = row.querySelector(".withdrawal-issuer-cell");
    appendBankNameContent(
      issuerCell,
      item.issuer || "-",
      item.issuerLogo,
      true,
    );
    row.querySelector(".withdrawal-ftf-cell").textContent = item.ftf || "-";
    appendLines(
      row.querySelector(".withdrawal-local-cell"),
      formatFeeLines(item.withdrawal.local),
    );
    appendLines(
      row.querySelector(".withdrawal-overseas-cell"),
      formatFeeLines(item.withdrawal.overseas),
    );
    return row;
  }

  function parseFeeValue(value) {
    const match = String(value || "").match(/\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : null;
  }

  function cleanFeeText(value) {
    return (
      String(value || "-")
        .trim()
        .replace(/[。；;]+$/, "") || "-"
    );
  }

  function getFeeOptions(regionCode) {
    return rows.flatMap((item) => {
      const fees =
        item.region === regionCode
          ? item.withdrawal.local
          : item.withdrawal.overseas;
      if (!fees || typeof fees !== "object" || Array.isArray(fees)) return [];
      return Object.entries(fees || {})
        .filter(
          ([network]) =>
            regionCode === "PH" || network.trim().toLowerCase() !== "bancnet",
        )
        .map(([network, fee]) => ({
          issuer: item.issuer,
          name: item.name,
          network,
          fee: (Array.isArray(fee) ? fee : [fee]).map(cleanFeeText).join("；"),
          value: parseFeeValue(Array.isArray(fee) ? fee[0] : fee),
        }))
        .filter((option) => option.value !== null);
    });
  }

  function renderSummary() {
    if (!summary) return;
    summary.replaceChildren();
    const options = getFeeOptions(selectedRegion).sort(
      (a, b) => a.value - b.value,
    );
    const regionLabel = getRegionLabel(selectedRegion);
    if (!options.length) {
      const message = document.createElement("p");
      message.textContent = `于${regionLabel}暂无可比较的取款手续费方案。`;
      summary.append(message);
      return;
    }

    const formatOption = (option) =>
      `使用${option.issuer}的【${option.name}】透过【${option.network}】网络取款，手续费为${option.fee}`;
    const intro = document.createElement("p");
    intro.className = "withdrawal-summary-intro";
    intro.textContent = `于${regionLabel}ATM取款的前三方案为：`;
    summary.append(intro);
    const list = document.createElement("ul");
    options.slice(0, 3).forEach((option, index, selectedOptions) => {
      const item = document.createElement("li");
      item.textContent = `${formatOption(option)}${
        index === selectedOptions.length - 1 ? "。" : "；"
      }`;
      list.append(item);
    });
    summary.append(list);
  }

  function renderRows() {
    tbody.replaceChildren();
    const visibleRows = rows;

    if (!visibleRows.length) {
      const emptyRow = document.createElement("tr");
      emptyRow.innerHTML =
        '<td class="empty-state" colspan="6">暂无符合条件的卡片。</td>';
      tbody.append(emptyRow);
      return;
    }

    const fragment = document.createDocumentFragment();
    visibleRows.forEach((item) => fragment.append(buildRow(item)));
    tbody.append(fragment);
  }

  function addRegionOptions() {
    regions.forEach((region) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "withdrawal-region-option";
      option.dataset.value = region.code;
      option.setAttribute("role", "option");
      option.textContent = `${region.name}（${region.code}）`;
      option.addEventListener("click", () => {
        selectRegion(region.code);
        setRegionDropdownOpen(false);
        regionTrigger.focus();
      });
      regionOptions.append(option);
    });
  }

  function handleRegionKeydown(event) {
    if (event.key === "Escape") {
      setRegionDropdownOpen(false);
      return;
    }
    if (["Enter", " ", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      setRegionDropdownOpen(true);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setRegionDropdownOpen(true);
      return;
    }
    if (event.key.length !== 1 || !/^[a-z]$/i.test(event.key)) return;
    if (!regionDropdownOpen) return;

    const prefix = event.key.toUpperCase();
    const matches = regions.filter((region) =>
      region.code.toUpperCase().startsWith(prefix),
    );
    if (!matches.length) return;

    const currentIndex = matches.findIndex(
      (region) => region.code === selectedRegion,
    );
    const next = matches[(currentIndex + 1) % matches.length];
    event.preventDefault();
    selectRegion(next.code);
  }

  async function init() {
    if (!tbody || !template || !regionPicker || !regionTrigger || !regionOptions)
      return;

    regions = (window.__CARDS_VIEWER_DATA__?.regions?.regions || []).filter(
      (item) => item?.code && item?.name,
    );
    if (!regions.length) {
      regions = [{ code: "HK", name: "中国香港" }];
    }

    rows = sortRows(
      await loadCardsFromAssets(
        (bankKey, bankInfo, entry) => {
          const card = entry?.card || entry;
          if (!card?.withdrawal || !card?.name) return null;

          const name = String(card.name).trim();
          return {
            name,
            issuerEnglish: String(
              bankInfo.english_name || bankKey || "",
            ).trim(),
            image: resolveImageUrl(
              bankKey,
              String(card.alt_image || "").trim() ||
                `${sanitizeFilename(name)}.${String(card.ext || "").trim()}`,
            ),
            issuer: String(
              bankInfo.native_name || bankInfo.english_name || bankKey || "",
            ).trim(),
            issuerLogo: resolveImageUrl(
              bankKey,
              String(bankInfo.logo || "").trim(),
            ),
            ftf: String(card.ftf || "").trim(),
            region: String(bankInfo.region || bankInfo.country || "").trim(),
            withdrawal: normalizeWithdrawal(card.withdrawal),
          };
        },
        { warn: true },
      ),
    );

    addRegionOptions();
    selectedRegion = regions.some((item) => item.code === "CN")
      ? "CN"
      : regions[0].code;
    selectRegion(selectedRegion);
    regionTrigger.addEventListener("click", () => {
      setRegionDropdownOpen(!regionDropdownOpen);
    });
    regionTrigger.addEventListener("keydown", handleRegionKeydown);
    document.addEventListener("click", (event) => {
      if (!regionPicker.contains(event.target)) setRegionDropdownOpen(false);
    });
    renderRows();
    renderSummary();
  }

  init();
})();

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
  const continentOptions = document.querySelector(
    "#withdrawalContinentOptions",
  );
  const countryOptions = document.querySelector("#withdrawalCountryOptions");
  const currencySelect = document.querySelector("#withdrawalCurrency");
  const amountInput = document.querySelector("#withdrawalAmount");
  const summary = document.querySelector("#withdrawalSummary");

  let rows = [];
  let continents = [];
  let regions = [];
  let regionDropdownOpen = false;
  let selectedContinent = "AS";
  let selectedRegion = "CN";
  let selectedCurrency = "CNY";
  let withdrawalAmount = 1000;
  const exchangeRateCache = new Map();
  let summaryRenderId = 0;

  function getRegionLabel(code) {
    const value = String(code || "").trim();
    const region = regions.find((item) => item.code === value);
    return region ? `${region.name_zh}（${region.code}）` : value || "未知地区";
  }

  function getContinentForRegion(code) {
    return continents.find((continent) =>
      continent.countries.some((region) => region.code === code),
    );
  }

  function getRegion(code) {
    return regions.find((item) => item.code === code);
  }

  function getAmount() {
    const value = Number(amountInput?.value);
    return Number.isFinite(value) && value >= 0
      ? Math.min(value, 100000000)
      : 0;
  }

  function formatCurrencyAmount(value, currency) {
    if (!Number.isFinite(value)) return "-";
    return `${new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)}${currency}`;
  }

  function getFeeCurrency(value, fallbackCurrency = selectedCurrency) {
    const match = String(value || "").match(/[A-Z]{3}(?=\b|$)/);
    return match ? match[0] : fallbackCurrency;
  }

  async function getExchangeRate(base, quote) {
    const source = String(base || "")
      .trim()
      .toUpperCase();
    const target = String(quote || "")
      .trim()
      .toUpperCase();
    if (!source || !target) return null;
    if (source === target) return 1;

    const key = `${source}:${target}`;
    if (exchangeRateCache.has(key)) return exchangeRateCache.get(key);

    try {
      const response = await fetch(
        `https://api.frankfurter.dev/v2/rates?base=${encodeURIComponent(
          source,
        )}&quotes=${encodeURIComponent(target)}`,
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const rateValue = Array.isArray(payload)
        ? payload.find((item) => item?.quote === target)?.rate
        : (payload?.rates?.[target] ?? payload?.rate);
      const rate = Number(rateValue);
      const result = Number.isFinite(rate) ? rate : null;
      exchangeRateCache.set(key, result);
      return result;
    } catch {
      exchangeRateCache.set(key, null);
      return null;
    }
  }

  async function convertAmount(value, base, quote, network = "") {
    const source = String(base || "")
      .trim()
      .toUpperCase();
    const target = String(quote || "")
      .trim()
      .toUpperCase();
    if (source === target) {
      return { value, converted: true };
    }
    if (
      network.toLowerCase() === "mastercard" &&
      source !== "USD" &&
      target !== "USD"
    ) {
      const toUsd = await getExchangeRate(source, "USD");
      const fromUsd = await getExchangeRate("USD", target);
      if (toUsd !== null && fromUsd !== null) {
        return { value: value * toUsd * fromUsd, converted: true };
      }
      return { value, converted: false };
    }
    const rate = await getExchangeRate(base, quote);
    return {
      value: rate === null ? value : value * rate,
      converted: rate !== null,
    };
  }

  function getExchangeFeePercent(item, network, regionCode) {
    const rule = item.withdrawalExchange;
    if (!rule || !item.cardCurrency || selectedCurrency === item.cardCurrency) {
      return 0;
    }

    let networkName = String(network || "").trim();
    if (
      networkName.toLowerCase() === "hsbc" &&
      !(rule.hsbc_atm_regions || []).includes(regionCode)
    ) {
      networkName = item.cardOrganization || networkName;
    }

    const matchedNetwork = Object.keys(rule.card_networks || {}).find(
      (name) => name.toLowerCase() === networkName.toLowerCase(),
    );
    if (matchedNetwork) return Number(rule.card_networks[matchedNetwork]) || 0;
    if (networkName.toLowerCase() === "hsbc") {
      return Number(rule.hsbc_atm_fee_percent) || 0;
    }
    return 0;
  }

  function setRegionDropdownOpen(open) {
    regionDropdownOpen = open;
    regionOptions.hidden = !open;
    regionTrigger.setAttribute("aria-expanded", String(open));
  }

  function openRegionDropdown() {
    const continent = getContinentForRegion(selectedRegion);
    if (continent) selectedContinent = continent.code;
    renderContinentOptions();
    renderCountryOptions();
    setRegionDropdownOpen(true);
    window.requestAnimationFrame(() => {
      countryOptions
        .querySelector(".withdrawal-region-option.is-active")
        ?.scrollIntoView({ block: "nearest" });
    });
  }

  function selectRegion(code) {
    selectedRegion = code;
    selectedCurrency = getRegion(code)?.currency || selectedCurrency;
    const continent = getContinentForRegion(code);
    if (continent) selectedContinent = continent.code;
    regionTrigger.textContent = getRegionLabel(code);
    if (currencySelect) currencySelect.value = selectedCurrency;
    renderContinentOptions();
    renderCountryOptions();
    countryOptions.querySelectorAll("[role=option]").forEach((option) => {
      const active = option.dataset.value === code;
      option.classList.toggle("is-active", active);
      option.setAttribute("aria-selected", String(active));
    });
    renderRows();
    renderSummary();
  }

  function renderContinentOptions() {
    continentOptions.replaceChildren();
    continents.forEach((continent) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "withdrawal-continent-option";
      option.dataset.value = continent.code;
      option.setAttribute("role", "option");
      option.textContent = continent.name_zh;
      option.setAttribute(
        "aria-selected",
        String(continent.code === selectedContinent),
      );
      option.classList.toggle(
        "is-active",
        continent.code === selectedContinent,
      );
      const activateContinent = () => {
        selectedContinent = continent.code;
        updateContinentState();
        renderCountryOptions();
      };
      option.addEventListener("mouseenter", activateContinent);
      option.addEventListener("focus", activateContinent);
      option.addEventListener("click", (event) => {
        event.stopPropagation();
        activateContinent();
      });
      continentOptions.append(option);
    });
  }

  function updateContinentState() {
    continentOptions
      .querySelectorAll(".withdrawal-continent-option")
      .forEach((option) => {
        const active = option.dataset.value === selectedContinent;
        option.classList.toggle("is-active", active);
        option.setAttribute("aria-selected", String(active));
      });
  }

  function renderCountryOptions() {
    countryOptions.replaceChildren();
    const continent = continents.find(
      (item) => item.code === selectedContinent,
    );
    const countries = (continent?.countries || []).slice().sort((a, b) => {
      const nameDiff = compareText(a.name_zh, b.name_zh);
      return nameDiff || compareText(a.name, b.name);
    });
    countries.forEach((region) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "withdrawal-region-option";
      option.dataset.value = region.code;
      option.setAttribute("role", "option");
      option.setAttribute(
        "aria-selected",
        String(region.code === selectedRegion),
      );
      option.textContent = `${region.name_zh}（${region.code}） ${region.name}`;
      option.classList.toggle("is-active", region.code === selectedRegion);
      option.addEventListener("click", () => {
        selectRegion(region.code);
        setRegionDropdownOpen(false);
        regionTrigger.focus();
      });
      countryOptions.append(option);
    });
  }

  function formatFeeLines(fees) {
    if (Array.isArray(fees)) return fees;
    if (!fees || typeof fees !== "object") return [];
    return Object.entries(fees).map(([network, fee]) => {
      const values = Array.isArray(fee) ? fee : [fee];
      return `${network}：${values
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

  function getFeeValues(fee) {
    if (fee && typeof fee === "object" && !Array.isArray(fee)) {
      return [fee.fixed, fee.percent].filter(Boolean);
    }
    return Array.isArray(fee) ? fee : [fee];
  }

  function formatFeeText(fee) {
    return getFeeValues(fee).map(cleanFeeText).join("；");
  }

  function getFeeEntries(item, fees, regionCode) {
    const side = item.region === regionCode ? "local" : "overseas";
    const currencyRules = item.withdrawalCurrencyRules?.[side];
    if (currencyRules) {
      const rule =
        currencyRules[selectedCurrency === "HKD" ? "HKD" : "foreign"];
      if (!rule || rule === "unsupported") return [];
      return [[item.cardOrganization || "VISA", rule]];
    }
    return Object.entries(fees || {}).map(([network, fee]) => [network, fee]);
  }

  async function calculateFeeValue(
    fee,
    targetCurrency = selectedCurrency,
    amount = withdrawalAmount,
    network = "",
    mode = "max",
  ) {
    const values = getFeeValues(fee);
    const comparableValues = await Promise.all(
      values.map(async (value) => {
        const numericValue = parseFeeValue(value);
        if (numericValue === null) return null;
        if (String(value).includes("%")) {
          return { value: (amount * numericValue) / 100, converted: true };
        }
        return convertAmount(
          numericValue,
          getFeeCurrency(value, targetCurrency),
          targetCurrency,
          network,
        );
      }),
    );
    const validValues = comparableValues.filter(Boolean);
    if (!validValues.length) return null;
    return {
      value:
        mode === "add"
          ? validValues.reduce((total, item) => total + item.value, 0)
          : Math.max(...validValues.map((item) => item.value)),
      converted: validValues.every((item) => item.converted),
    };
  }

  function cleanFeeText(value) {
    return (
      String(value || "-")
        .trim()
        .replace(/[。；;]+$/, "") || "-"
    );
  }

  async function getFeeOptions(regionCode) {
    const optionGroups = await Promise.all(
      rows.map(async (item) => {
        const fees =
          item.region === regionCode
            ? item.withdrawal.local
            : item.withdrawal.overseas;
        if (!fees || typeof fees !== "object" || Array.isArray(fees)) return [];
        const options = await Promise.all(
          getFeeEntries(item, fees, regionCode)
            .filter(
              ([network]) =>
                regionCode === "PH" ||
                network.trim().toLowerCase() !== "bancnet",
            )
            .map(async ([network, fee]) => {
              const feeMode = fee?.mode || "max";
              const cardAmount = await convertAmount(
                withdrawalAmount,
                selectedCurrency,
                item.cardCurrency,
                network,
              );
              const calculation = await calculateFeeValue(
                fee,
                item.cardCurrency,
                cardAmount.value,
                network,
                feeMode,
              );
              const exchangeFeePercent = getExchangeFeePercent(
                item,
                network,
                regionCode,
              );
              const cardFee = calculation
                ? calculation.value +
                  (cardAmount.value * exchangeFeePercent) / 100
                : null;
              const selectedFee =
                cardFee === null
                  ? null
                  : await convertAmount(
                      cardFee,
                      item.cardCurrency,
                      selectedCurrency,
                    );
              return {
                issuer: item.issuer,
                name: item.name,
                network,
                fee: formatFeeText(fee),
                value: selectedFee?.value ?? null,
                feeConverted:
                  Boolean(selectedFee?.converted) &&
                  Boolean(calculation?.converted) &&
                  (exchangeFeePercent === 0 || cardAmount.converted),
                cardCurrency: item.cardCurrency,
                cardAmount: cardAmount.value,
                cardAmountConverted: cardAmount.converted,
                cardFee,
                cardFeeConverted:
                  Boolean(calculation?.converted) &&
                  (exchangeFeePercent === 0 || cardAmount.converted),
                cardTotal:
                  cardFee !== null && cardAmount.converted
                    ? cardAmount.value + cardFee
                    : null,
              };
            }),
        );
        return options.filter((option) => option.value !== null);
      }),
    );
    return optionGroups.flat();
  }

  async function renderSummary() {
    if (!summary) return;
    const renderId = ++summaryRenderId;
    summary.replaceChildren();
    const options = (await getFeeOptions(selectedRegion)).sort(
      (a, b) => a.value - b.value,
    );
    if (renderId !== summaryRenderId) return;
    const regionLabel = getRegionLabel(selectedRegion);
    const amountLabel = formatCurrencyAmount(
      withdrawalAmount,
      selectedCurrency,
    );
    if (!options.length) {
      const message = document.createElement("p");
      message.textContent = `于${regionLabel}取出${amountLabel}暂无可比较的取款手续费方案。`;
      summary.append(message);
      return;
    }

    const formatFeeSummary = (option) => {
      const fee = option.cardFeeConverted
        ? formatCurrencyAmount(option.cardFee, option.cardCurrency)
        : option.fee;
      const cardAmount = option.cardAmountConverted
        ? formatCurrencyAmount(option.cardAmount, option.cardCurrency)
        : "无法换算";
      const total =
        option.cardAmountConverted && option.cardFeeConverted
          ? formatCurrencyAmount(option.cardTotal, option.cardCurrency)
          : "无法换算";
      return `${amountLabel}=${cardAmount}，手续费${fee}，预估总额${total}`;
    };
    const formatOption = (option) =>
      `${option.issuer}【${option.name}】透过【${option.network}】网络取款`;
    const groups = [];
    const groupMap = new Map();
    options.forEach((option) => {
      const key = [
        option.cardCurrency,
        option.cardAmount?.toFixed(2),
        option.cardFee?.toFixed(2),
        option.cardTotal?.toFixed(2),
        option.fee,
      ].join("|");
      let group = groupMap.get(key);
      if (!group) {
        group = { options: [] };
        groupMap.set(key, group);
        groups.push(group);
      }
      group.options.push(option);
    });

    const appendGroup = (group) => {
      const item = document.createElement("li");
      item.append(
        document.createTextNode(`${formatFeeSummary(group.options[0])}：`),
      );
      const nestedList = document.createElement("ul");
      group.options.forEach((option) => {
        const nestedItem = document.createElement("li");
        nestedItem.textContent = formatOption(option);
        nestedList.append(nestedItem);
      });
      item.append(nestedList);
      return item;
    };
    const intro = document.createElement("p");
    intro.className = "withdrawal-summary-intro";
    intro.textContent = `于${regionLabel}取出${amountLabel}的前三方案为：`;
    summary.append(intro);
    const list = document.createElement("ul");
    groups.slice(0, 3).forEach((group) => list.append(appendGroup(group)));
    summary.append(list);
  }

  function renderRows() {
    tbody.replaceChildren();
    const visibleRows = rows;

    if (!visibleRows.length) {
      const emptyRow = document.createElement("tr");
      emptyRow.innerHTML =
        '<td class="empty-state" colspan="5">暂无符合条件的卡片。</td>';
      tbody.append(emptyRow);
      return;
    }

    const fragment = document.createDocumentFragment();
    visibleRows.forEach((item) => fragment.append(buildRow(item)));
    tbody.append(fragment);
  }

  function addRegionOptions() {
    renderContinentOptions();
    renderCountryOptions();
  }

  function handleRegionKeydown(event) {
    if (event.key === "Escape") {
      setRegionDropdownOpen(false);
      return;
    }
    if (["Enter", " ", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      openRegionDropdown();
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      openRegionDropdown();
      return;
    }
    if (event.key.length !== 1 || !/^[a-z]$/i.test(event.key)) return;
    if (!regionDropdownOpen) return;

    const prefix = event.key.toUpperCase();
    const matches = regions
      .filter((region) => region.code.toUpperCase().startsWith(prefix))
      .sort((a, b) => a.code.localeCompare(b.code));
    if (!matches.length) return;

    const currentIndex = matches.findIndex(
      (region) => region.code === selectedRegion,
    );
    const next = matches[(currentIndex + 1) % matches.length];
    event.preventDefault();
    selectRegion(next.code);
  }

  async function init() {
    if (
      !tbody ||
      !template ||
      !regionPicker ||
      !regionTrigger ||
      !regionOptions ||
      !continentOptions ||
      !countryOptions
    )
      return;

    continents = (window.__CARDS_VIEWER_DATA__?.regions?.continents || [])
      .filter((item) => item?.code && item?.name)
      .map((continent) => ({
        ...continent,
        countries: (continent.countries || []).filter(
          (country) => country?.code && country?.name_zh && country?.name,
        ),
      }));
    regions = continents.flatMap((continent) => continent.countries);
    if (!regions.length) {
      continents = [
        {
          code: "AS",
          name_zh: "东亚",
          name: "East Asia",
          countries: [
            {
              code: "HK",
              name_zh: "中国香港",
              name: "Hong Kong",
              currency: "HKD",
              currency_zh: "港元",
            },
          ],
        },
      ];
      regions = continents[0].countries;
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
            cardCurrency: Array.isArray(card.currency)
              ? String(card.currency[0] || "")
                  .trim()
                  .toUpperCase()
              : String(card.currency || "")
                  .trim()
                  .toUpperCase(),
            cardOrganization: String(card.organization || "").trim(),
            withdrawalExchange: card.withdrawal_exchange || null,
            withdrawalCurrencyRules: card.withdrawal_currency_rules || null,
            region: String(bankInfo.region || bankInfo.country || "").trim(),
            withdrawal: normalizeWithdrawal(card.withdrawal),
          };
        },
        { warn: true },
      ),
    );

    selectedContinent = getContinentForRegion("CN")?.code || continents[0].code;
    addRegionOptions();
    selectedRegion = regions.some((item) => item.code === "CN")
      ? "CN"
      : regions[0].code;
    selectedCurrency = getRegion(selectedRegion)?.currency || "CNY";
    if (currencySelect) {
      const currencyMap = new Map();
      regions.forEach((region) => {
        if (region.currency && !currencyMap.has(region.currency)) {
          currencyMap.set(
            region.currency,
            region.currency_zh || region.currency,
          );
        }
      });
      [...currencyMap.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .forEach(([code, name]) => {
          const option = document.createElement("option");
          option.value = code;
          option.textContent = `${name}（${code}）`;
          currencySelect.append(option);
        });
      currencySelect.addEventListener("change", () => {
        selectedCurrency = currencySelect.value;
        renderSummary();
      });
    }
    if (amountInput) {
      amountInput.addEventListener("input", () => {
        withdrawalAmount = getAmount();
        if (Number(amountInput.value) > 100000000) {
          amountInput.value = "100000000";
        }
        renderSummary();
      });
    }
    selectRegion(selectedRegion);
    regionTrigger.addEventListener("click", () => {
      if (regionDropdownOpen) {
        setRegionDropdownOpen(false);
      } else {
        openRegionDropdown();
      }
    });
    regionTrigger.addEventListener("keydown", handleRegionKeydown);
    regionOptions.addEventListener("keydown", handleRegionKeydown);
    document.addEventListener("click", (event) => {
      if (!regionPicker.contains(event.target)) setRegionDropdownOpen(false);
    });
    renderRows();
    renderSummary();
  }

  init();
})();

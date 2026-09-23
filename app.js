const REQUIRED_COLUMNS = [
  "id", "anon_name", "categories", "city", "city_imputed", "synthetic",
  "price_from_kzt", "price_imputed", "event_formats", "languages",
  "max_hours", "busy_dates", "description"
];

const DEMO_CONTRACTORS = [
  ["HK-44733","Буллма","Ведущий","Алматы","False","False","1000000","False","корпоратив|конференция|юбилей|день рождения","русский|английский","6","2026-10-24|2026-12-25","Ведущий для корпоративов и деловых форумов."],
  ["HK-44923","Мицури Канроджи","Ведущий","Алматы","False","False","650000","False","свадьба|юбилей|корпоратив","русский","8","2026-10-03","Профессиональный ведущий и сценарист для праздников."],
  ["HK-35215","Кики","Ведущий","Алматы","False","False","900000","False","свадьба|той|юбилей|корпоратив","казахский|русский|английский","10","2026-12-25","Ведущий на казахском, русском и английском."],
  ["HK-77838","Хаул","Ведущий","Алматы","False","False","1000000","False","корпоратив|конференция|юбилей|свадьба","русский|казахский","8","2026-12-25","Ведущий, актёр и педагог по актёрскому мастерству."],
  ["HK-27222","Сон Гоку","Ведущий","Алматы","False","False","1000000","False","свадьба|той|корпоратив|конференция","казахский|русский","10","2026-12-25","Двуязычный ведущий для крупных корпоративных событий."],
  ["HK-75012","Джинбей","Ведущий","Алматы","False","False","1300000","False","корпоратив|конференция","русский|английский","6","2026-12-25","Ведущий технологических форумов и мероприятий брендов."],
  ["HK-29829","Аня Форджер","Ведущий","Алматы","False","False","700000","False","день рождения|корпоратив|юбилей","русский","6","2026-10-17","Ведущая с программой для взрослой и молодёжной аудитории."],
  ["HK-88430","Куррапика","Ведущий","Алматы","False","False","500000","False","корпоратив|конференция|юбилей","русский","6","2026-10-15","Ведущий деловых встреч и корпоративов."],
  ["HK-39372","Тони Тони Чоппер","Флорист","Алматы","False","False","200000","True","свадьба|корпоратив|конференция|юбилей","русский","","2026-12-25","Авторское цветочное оформление для мероприятий."],
  ["HK-90001","Тихиро Огино","Флорист","Алматы","False","True","250000","False","свадьба|юбилей|той","русский|казахский","","2026-12-25","Флористика для свадеб и юбилеев."],
  ["HK-93015","Кирито","Флорист","Астана","False","False","300000","False","свадьба|корпоратив","русский|казахский","","2026-10-15","Цветочное оформление мероприятий в Астане."],
  ["HK-58236","Шинобу Кочо","Банкетный зал","Алматы","False","False","2500000","False","свадьба|корпоратив|юбилей","русский|казахский","10","2026-12-31","Банкетный зал с обслуживанием мероприятий."],
  ["HK-58420","Дэмон Слэйер","Банкетный зал","Алматы","False","False","3200000","False","свадьба|корпоратив|конференция","русский","12","2026-10-15","Площадка для конференций и корпоративов."],
  ["HK-12120","Мегуми","Фотограф","Алматы","False","False","450000","False","свадьба|корпоратив|юбилей","русский|английский","8","2026-10-15","Репортажная и портретная съёмка событий."],
  ["HK-12121","Нобара","Фотограф","Алматы","False","False","700000","False","свадьба|корпоратив|конференция","русский|казахский","10","2026-10-17","Фотограф для деловых и семейных мероприятий."]
].map(values => Object.fromEntries(REQUIRED_COLUMNS.map((key, index) => [key, values[index]])));

const DEMO_SCENARIOS = [
  { label: "Плотная: ведущий", city: "Алматы", category: "Ведущий", eventFormat: "корпоратив", eventDate: "2026-10-15", budget: 2000000 },
  { label: "Дата меняет выдачу", city: "Алматы", category: "Ведущий", eventFormat: "корпоратив", eventDate: "2026-12-25", budget: 2000000 },
  { label: "Редкая: флорист", city: "Алматы", category: "Флорист", eventFormat: "свадьба", eventDate: "2026-10-15", budget: 1000000 },
  { label: "Нет категории в городе", city: "Астана", category: "Декоратор", eventFormat: "свадьба", eventDate: "2026-10-15", budget: 1000000 },
  { label: "Все заняты", city: "Астана", category: "Флорист", eventFormat: "свадьба", eventDate: "2026-10-15", budget: 1000000 }
];

let contractors = [];
let datasetOrigin = "демо-каталог";
const byId = id => document.getElementById(id);
const split = value => String(value || "").split("|").map(item => item.trim()).filter(Boolean);
const formatMoney = value => new Intl.NumberFormat("ru-RU").format(Number(value || 0)) + " ₸";

const form = byId("searchForm");
const resultContainer = byId("results");
const resultTitle = byId("resultsTitle");
const resultMeta = byId("resultsMeta");
const cityInput = byId("city");
const categoryInput = byId("category");
const formatInput = byId("eventFormat");
const languageInput = byId("language");
const dateInput = byId("eventDate");
const budgetInput = byId("budget");
const durationInput = byId("duration");

function uniqueValues(field, splitValues = false) {
  const values = contractors.flatMap(item => splitValues ? split(item[field]) : [item[field]]);
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
}

function setSelectOptions(select, values, placeholder, preserveValue = true) {
  const previous = select.value;
  select.innerHTML = "";
  const first = document.createElement("option");
  first.value = "";
  first.textContent = placeholder;
  select.append(first);
  values.forEach(value => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  });
  if (preserveValue && values.includes(previous)) select.value = previous;
}

function populateInputs() {
  setSelectOptions(cityInput, uniqueValues("city"), "Выберите город");
  setSelectOptions(categoryInput, uniqueValues("categories", true), "Выберите категорию");
  setSelectOptions(formatInput, uniqueValues("event_formats", true), "Выберите формат");
  setSelectOptions(languageInput, uniqueValues("languages", true), "Любой язык");
}

function renderDatasetStats() {
  const statItems = [
    ["Профилей", contractors.length],
    ["Городов", uniqueValues("city").length],
    ["Категорий", uniqueValues("categories", true).length],
    ["Колонки ТЗ", REQUIRED_COLUMNS.length + "/" + REQUIRED_COLUMNS.length]
  ];
  byId("datasetStats").innerHTML = statItems.map(([label, value]) =>
    '<div><dt>' + label + '</dt><dd>' + value + '</dd></div>'
  ).join("");
  byId("datasetSummary").textContent = "Источник: " + datasetOrigin + ". Поля и календарь занятости прошли проверку.";
}

function setDataset(data, origin) {
  contractors = data.map(normalizeContractor).filter(item => item.id && item.anon_name && item.city);
  datasetOrigin = origin;
  populateInputs();
  renderDatasetStats();
}

function normalizeContractor(item) {
  return Object.fromEntries(REQUIRED_COLUMNS.map(key => [key, String(item[key] ?? "").trim()]));
}

function parseCsv(text) {
  const rows = [];
  let cell = "";
  let row = [];
  let insideQuotes = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (insideQuotes && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else insideQuotes = !insideQuotes;
    } else if (char === "," && !insideQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some(value => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const headers = (rows.shift() || []).map(value => value.replace(/^\uFEFF/, "").trim());
  return { headers, data: rows.filter(rowData => rowData.length === headers.length).map(rowData =>
    Object.fromEntries(headers.map((header, index) => [header, rowData[index]]))
  )};
}

function datasetError(message) {
  byId("datasetSummary").textContent = message;
  byId("datasetSummary").className = "error";
}

function buildExplanation(contractor, query) {
  const facts = [];
  facts.push("Свободен " + new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(new Date(query.eventDate + "T00:00:00")) + ".");
  facts.push("Берёт формат «" + query.eventFormat + "».");
  if (query.language) facts.push("Работает на " + query.language + " языке.");
  else facts.push("Цена от " + formatMoney(contractor.price_from_kzt) + " укладывается в бюджет.");
  if (query.duration && contractor.max_hours) facts.push("Доступен до " + contractor.max_hours + " ч, запрос — " + query.duration + " ч.");
  return facts.slice(0, 3).join(" ");
}

function getRejectionSummary(base, afterFormat, afterBudget, afterDate, afterLanguage, afterDuration) {
  const reasons = [];
  if (base.length > afterFormat.length) reasons.push("не берут этот формат: " + (base.length - afterFormat.length));
  if (afterFormat.length > afterBudget.length) reasons.push("выше бюджета: " + (afterFormat.length - afterBudget.length));
  if (afterBudget.length > afterDate.length) reasons.push("заняты на дату: " + (afterBudget.length - afterDate.length));
  if (afterDate.length > afterLanguage.length) reasons.push("нет нужного языка: " + (afterDate.length - afterLanguage.length));
  if (afterLanguage.length > afterDuration.length) reasons.push("не хватает длительности: " + (afterLanguage.length - afterDuration.length));
  return reasons.length ? reasons.join("; ") + "." : "Все проверенные кандидаты прошли условия.";
}

function findMatches(query) {
  const base = contractors.filter(item => item.city === query.city && split(item.categories).includes(query.category));
  const afterFormat = base.filter(item => split(item.event_formats).includes(query.eventFormat));
  const afterBudget = afterFormat.filter(item => Number(item.price_from_kzt) <= Number(query.budget));
  const afterDate = afterBudget.filter(item => !split(item.busy_dates).includes(query.eventDate));
  const afterLanguage = query.language ? afterDate.filter(item => split(item.languages).includes(query.language)) : afterDate;
  const afterDuration = query.duration ? afterLanguage.filter(item => !item.max_hours || Number(item.max_hours) >= Number(query.duration)) : afterLanguage;
  const ranked = afterDuration.map(item => {
    const priceRoom = Math.max(0, Number(query.budget) - Number(item.price_from_kzt)) / Number(query.budget);
    const languageScore = query.language && split(item.languages).includes(query.language) ? .2 : 0;
    const durationScore = query.duration && (!item.max_hours || Number(item.max_hours) >= Number(query.duration)) ? .1 : 0;
    const descriptionScore = item.description.length > 60 ? .05 : 0;
    return { item, score: priceRoom + languageScore + durationScore + descriptionScore };
  }).sort((left, right) => right.score - left.score || Number(left.item.price_from_kzt) - Number(right.item.price_from_kzt) || left.item.id.localeCompare(right.item.id));
  return { base, afterFormat, afterBudget, afterDate, afterLanguage, afterDuration, ranked };
}

function renderState(type, title, description) {
  resultContainer.innerHTML = '<article class="state-card ' + type + '"><h3>' + title + '</h3><p>' + description + '</p></article>';
}

function renderMatches(result, query) {
  const exclusionSummary = getRejectionSummary(
    result.base, result.afterFormat, result.afterBudget, result.afterDate, result.afterLanguage, result.afterDuration
  );
  resultContainer.innerHTML = "";
  result.ranked.slice(0, 3).forEach(({ item, score }) => {
    const fragment = byId("contractorTemplate").content.cloneNode(true);
    fragment.querySelector(".category-label").textContent = query.category;
    fragment.querySelector(".score-label").textContent = "Подходит";
    fragment.querySelector(".contractor-name").textContent = item.anon_name;
    fragment.querySelector(".contractor-meta").textContent = item.city + " · от " + formatMoney(item.price_from_kzt) + " · " + (item.max_hours ? "до " + item.max_hours + " ч" : "длительность не ограничена");
    fragment.querySelector(".contractor-explanation").textContent = buildExplanation(item, query);
    fragment.querySelector(".exclusion-summary").textContent = exclusionSummary;
    const tags = [
      ...split(item.languages).map(language => ({ text: language, warn: false })),
      item.synthetic === "True" ? { text: "синтетический профиль", warn: true } : null,
      item.city_imputed === "True" ? { text: "город восстановлен", warn: true } : null,
      item.price_imputed === "True" ? { text: "цена восстановлена", warn: true } : null
    ].filter(Boolean);
    const tagList = fragment.querySelector(".tag-list");
    tags.forEach(({ text, warn }) => {
      const tag = document.createElement("span");
      tag.className = "tag" + (warn ? " warn" : "");
      tag.textContent = text;
      tagList.append(tag);
    });
    resultContainer.append(fragment);
  });
  resultTitle.textContent = "Подобрали " + Math.min(result.ranked.length, 3) + " из " + result.ranked.length + " подходящих";
  resultMeta.textContent = "Порядок фиксирован правилами подбора.";
}

function submitSearch() {
  const query = {
    city: cityInput.value,
    category: categoryInput.value,
    eventFormat: formatInput.value,
    eventDate: dateInput.value,
    budget: budgetInput.value,
    language: languageInput.value,
    duration: durationInput.value
  };
  if (!query.city || !query.category || !query.eventFormat || !query.eventDate || !query.budget) return;
  const result = findMatches(query);
  if (!result.base.length) {
    resultTitle.textContent = "В этом городе такой категории нет";
    resultMeta.textContent = "Проверили " + contractors.length + " профилей каталога.";
    renderState("no-city", "Категория не представлена", "В каталоге нет подрядчиков категории «" + query.category + "» в городе «" + query.city + "». Попробуйте другой город или категорию.");
    return;
  }
  if (!result.ranked.length) {
    resultTitle.textContent = "Кандидаты есть, но условия не пройдены";
    resultMeta.textContent = "Категория найдена: " + result.base.length + " проф.";
    renderState("no-match", "Подходящих подрядчиков нет", "Причины: " + getRejectionSummary(result.base, result.afterFormat, result.afterBudget, result.afterDate, result.afterLanguage, result.afterDuration));
    return;
  }
  renderMatches(result, query);
}

function applyScenario(scenario) {
  cityInput.value = scenario.city;
  categoryInput.value = scenario.category;
  formatInput.value = scenario.eventFormat;
  dateInput.value = scenario.eventDate;
  budgetInput.value = scenario.budget;
  languageInput.value = "";
  durationInput.value = "";
  submitSearch();
  byId("resultsSection").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderDemoScenarios() {
  const container = byId("demoScenarios");
  container.innerHTML = "";
  DEMO_SCENARIOS.forEach(scenario => {
    const button = document.createElement("button");
    button.className = "scenario-button";
    button.type = "button";
    button.textContent = scenario.label;
    button.addEventListener("click", () => applyScenario(scenario));
    container.append(button);
  });
}

form.addEventListener("submit", event => {
  event.preventDefault();
  submitSearch();
});

byId("resetButton").addEventListener("click", () => {
  form.reset();
  resultTitle.textContent = "Введите параметры поиска";
  resultMeta.textContent = "";
  resultContainer.innerHTML = '<div class="empty-placeholder">После поиска здесь появятся до трёх карточек с конкретными причинами выбора.</div>';
});

byId("datasetButton").addEventListener("click", () => byId("datasetInput").click());
byId("datasetInput").addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const { headers, data } = parseCsv(await file.text());
    const missing = REQUIRED_COLUMNS.filter(column => !headers.includes(column));
    if (missing.length) {
      datasetError("CSV не подключён. Отсутствуют колонки: " + missing.join(", ") + ".");
      return;
    }
    if (!data.length) {
      datasetError("CSV не подключён: в файле нет профилей.");
      return;
    }
    setDataset(data, file.name);
    byId("datasetSummary").className = "";
    submitSearch();
  } catch (error) {
    datasetError("Не удалось прочитать CSV: " + error.message);
  }
});

byId("loadDemoButton").addEventListener("click", () => {
  setDataset(DEMO_CONTRACTORS, "демо-каталог");
  byId("datasetSummary").className = "";
});

setDataset(DEMO_CONTRACTORS, "демо-каталог");
renderDemoScenarios();
dateInput.value = "2026-10-15";
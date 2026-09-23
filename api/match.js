import { readFile } from "node:fs/promises";
import { join } from "node:path";

const REQUIRED_FIELDS = ["id", "anon_name", "categories", "city", "price_from_kzt", "event_formats", "languages", "max_hours", "busy_dates", "description"];
let catalogPromise;

const split = (value) => String(value || "").split("|").map((item) => item.trim()).filter(Boolean);

function parseCsv(text) {
  const rows = [];
  let cell = "";
  let row = [];
  let insideQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (insideQuotes && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (character === "," && !insideQuotes) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !insideQuotes) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  const headers = (rows.shift() || []).map((value) => value.replace(/^\uFEFF/, "").trim());
  const missingFields = REQUIRED_FIELDS.filter((field) => !headers.includes(field));
  if (missingFields.length) throw new Error("В каталоге отсутствуют поля: " + missingFields.join(", "));

  return rows
    .filter((values) => values.length === headers.length)
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, String(values[index] ?? "").trim()])));
}

async function getCatalog() {
  if (!catalogPromise) {
    catalogPromise = readFile(join(process.cwd(), "data", "contractors.csv"), "utf8").then(parseCsv);
  }
  return catalogPromise;
}

function explanation(contractor, query) {
  const facts = [
    "Свободен " + query.eventDate + ".",
    "Берёт формат «" + query.eventFormat + "».",
    "Цена от " + Number(contractor.price_from_kzt).toLocaleString("ru-RU") + " ₸ укладывается в бюджет."
  ];

  if (query.language) facts[2] = "Работает на " + query.language + " языке.";
  if (query.duration && contractor.max_hours) {
    facts.push("Максимальная длительность — " + contractor.max_hours + " ч при запросе " + query.duration + " ч.");
  }

  return facts.slice(0, 3).join(" ");
}

function excludedSummary(stages) {
  const reasons = [];
  if (stages.base.length > stages.afterFormat.length) reasons.push({ reason: "не берут этот формат", count: stages.base.length - stages.afterFormat.length });
  if (stages.afterFormat.length > stages.afterBudget.length) reasons.push({ reason: "выше бюджета", count: stages.afterFormat.length - stages.afterBudget.length });
  if (stages.afterBudget.length > stages.afterDate.length) reasons.push({ reason: "заняты на дату", count: stages.afterBudget.length - stages.afterDate.length });
  if (stages.afterDate.length > stages.afterLanguage.length) reasons.push({ reason: "не говорят на нужном языке", count: stages.afterDate.length - stages.afterLanguage.length });
  if (stages.afterLanguage.length > stages.afterDuration.length) reasons.push({ reason: "не подходят по длительности", count: stages.afterLanguage.length - stages.afterDuration.length });
  return reasons;
}

function matchCatalog(catalog, query) {
  const base = catalog.filter((item) => item.city === query.city && split(item.categories).includes(query.category));
  const afterFormat = base.filter((item) => split(item.event_formats).includes(query.eventFormat));
  const afterBudget = afterFormat.filter((item) => Number(item.price_from_kzt) <= query.budget);
  const afterDate = afterBudget.filter((item) => !split(item.busy_dates).includes(query.eventDate));
  const afterLanguage = query.language
    ? afterDate.filter((item) => split(item.languages).includes(query.language))
    : afterDate;
  const afterDuration = query.duration
    ? afterLanguage.filter((item) => !item.max_hours || Number(item.max_hours) >= query.duration)
    : afterLanguage;

  const stages = { base, afterFormat, afterBudget, afterDate, afterLanguage, afterDuration };

  if (!base.length) {
    return {
      status: "category_not_found",
      total_matches: 0,
      results: [],
      message: "В каталоге нет категории «" + query.category + "» в городе «" + query.city + "».",
      excluded: []
    };
  }

  const ranked = afterDuration
    .map((item) => {
      const budgetRoom = Math.max(0, query.budget - Number(item.price_from_kzt)) / query.budget;
      const languageMatch = query.language && split(item.languages).includes(query.language) ? 0.2 : 0;
      const durationMatch = query.duration && (!item.max_hours || Number(item.max_hours) >= query.duration) ? 0.1 : 0;
      const descriptionQuality = item.description.length >= 60 ? 0.05 : 0;
      return { item, score: budgetRoom + languageMatch + durationMatch + descriptionQuality };
    })
    .sort((left, right) =>
      right.score - left.score ||
      Number(left.item.price_from_kzt) - Number(right.item.price_from_kzt) ||
      left.item.id.localeCompare(right.item.id)
    );

  if (!ranked.length) {
    return {
      status: "no_match",
      total_matches: 0,
      results: [],
      message: "Подрядчики такой категории есть, но никто не проходит условия запроса.",
      excluded: excludedSummary(stages)
    };
  }

  return {
    status: "matched",
    total_matches: ranked.length,
    results: ranked.slice(0, 3).map(({ item }) => ({
      id: item.id,
      name: item.anon_name,
      category: query.category,
      city: item.city,
      price_from_kzt: Number(item.price_from_kzt),
      max_hours: item.max_hours ? Number(item.max_hours) : null,
      languages: split(item.languages),
      explanation: explanation(item, query),
      data_quality: {
        synthetic: item.synthetic === "True",
        city_imputed: item.city_imputed === "True",
        price_imputed: item.price_imputed === "True"
      }
    })),
    excluded: excludedSummary(stages)
  };
}

function getQuery(query) {
  const city = String(query.city || "").trim();
  const category = String(query.category || "").trim();
  const eventFormat = String(query.eventFormat || "").trim();
  const eventDate = String(query.eventDate || "").trim();
  const budget = Number(query.budget);
  const language = String(query.language || "").trim();
  const duration = query.duration ? Number(query.duration) : null;

  if (!city || !category || !eventFormat || !eventDate || !Number.isFinite(budget) || budget <= 0) {
    return { error: "Нужны город, категория, формат, дата и положительный бюджет." };
  }
  if (!/^2026-(09|10|11|12)-\d{2}$/.test(eventDate)) {
    return { error: "Дата должна быть в окне каталога: 2026-09-23 — 2026-12-31." };
  }
  if (duration !== null && (!Number.isFinite(duration) || duration <= 0 || duration > 24)) {
    return { error: "Длительность должна быть числом от 1 до 24." };
  }

  return { city, category, eventFormat, eventDate, budget, language, duration };
}

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ error: "Используйте GET-запрос." });
    return;
  }

  const query = getQuery(request.query);
  if (query.error) {
    response.status(400).json({ error: query.error });
    return;
  }

  try {
    const catalog = await getCatalog();
    const result = matchCatalog(catalog, query);
    response.setHeader("Cache-Control", "no-store");
    response.status(200).json({
      version: "rules-v1",
      query,
      catalog_profiles: catalog.length,
      ...result
    });
  } catch (error) {
    response.status(500).json({ error: "Не удалось обработать каталог.", detail: error.message });
  }
}
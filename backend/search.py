from collections import Counter

from .models import Contractor, SearchQuery


def same(left, right):
    return left.strip().casefold() == right.strip().casefold()


def contains(values, value):
    return any(same(item, value) for item in values)


def money(value):
    return f"{value:,.2f}".rstrip("0").rstrip(".").replace(",", " ")


def facts_for(c: Contractor, q: SearchQuery):
    # All text is constructed from validated source values; no model-authored claims.
    facts = {
        "languages": "языки работы: " + ", ".join(c.languages),
        "duration": (f"присутствие до {c.max_hours:g} ч" if c.max_hours is not None
                     else "услуга не привязана к часам присутствия"),
        "formats": "заявленные форматы: " + ", ".join(c.event_formats),
    }
    if q.language:
        facts["language_match"] = f"заявлен нужный язык: {q.language}"
    if q.duration:
        facts["duration_match"] = (f"запрошено {q.duration:g} ч при лимите {c.max_hours:g} ч"
                                   if c.max_hours is not None else "длительность услуги не привязана к присутствию")
    return facts


def explanation(c, q, fact_ids=None):
    facts = facts_for(c, q)
    chosen = fact_ids or ["language_match" if q.language else "languages",
                          "duration_match" if q.duration else "duration"]
    return (f"{c.anon_name} ({c.id}), {c.city}: по календарю свободен {q.event_date.isoformat()}, "
            f"берёт формат «{q.event_format}», цена от {money(c.price_from_kzt)} ₸ "
            f"при бюджете {money(q.budget)} ₸. " + "; ".join(facts[key] for key in chosen) + ".")


def search(profiles: list[Contractor], query: SearchQuery):
    base = [c for c in profiles if same(c.city, query.city) and contains(c.categories, query.category)]
    counts = Counter({key: 0 for key in ("busy_date", "format", "budget", "language", "duration")})
    valid = []
    for c in base:
        # Count every unmet condition (one person may contribute to multiple counts).
        failures = []
        if query.event_date in c.busy_dates:
            failures.append("busy_date")
        if not contains(c.event_formats, query.event_format):
            failures.append("format")
        if c.price_from_kzt > query.budget:
            failures.append("budget")
        if query.language and not contains(c.languages, query.language):
            failures.append("language")
        if query.duration and c.max_hours is not None and c.max_hours < query.duration:
            failures.append("duration")
        counts.update(failures)
        if not failures:
            valid.append(c)
    # All mandatory and selected optional conditions already passed.
    # Prefer lower starting cost, resolve ties by stable unique ID.
    valid.sort(key=lambda c: (c.price_from_kzt, c.id))
    status = "no_category" if not base else "no_match" if not valid else "matched"
    labels = {"busy_date": "заняты на выбранную дату", "format": "не берут формат",
              "budget": "выше бюджета", "language": "нет нужного языка", "duration": "недостаточно часов"}
    excluded = "; ".join(f"{labels[k]}: {v}" for k, v in counts.items() if v)
    if status == "no_category":
        message = "В этом городе такой категории нет в подключённом каталоге."
    elif status == "no_match":
        message = "Кандидаты есть, но ни один не проходит условия: " + excluded + "."
    elif len(valid) < 3:
        message = f"Подобрали {len(valid)}: в городе и категории всего {len(base)} кандидатов. "
        message += ("Исключения: " + excluded + ".") if excluded else "Все кандидаты проходят условия; других в каталоге нет."
    else:
        message = f"Показываем 3 из {len(valid)} подходящих, сначала с меньшей ценой «от»."
        if excluded:
            message += " Исключения: " + excluded + "."
    return {"status": status, "message": message, "total_candidates": len(base),
            "total_matched": len(valid), "excluded_count": len(base) - len(valid),
            "exclusions": dict(counts), "exclusions_overlap": True,
            "ranking": "price_from_kzt ASC, id ASC; no automatic booking",
            "results": [{"contractor": c.model_dump(mode="json"),
                         "score": round(1 - c.price_from_kzt / query.budget, 6),
                         "explanation": explanation(c, query)} for c in valid[:3]],
            "explanation_mode": "template", "warning": None}

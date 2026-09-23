import json
from copy import deepcopy

import pytest
from fastapi.testclient import TestClient

from backend import ai
from backend.catalog import ROOT, load_catalog
from backend.main import create_app
from backend.models import SearchQuery
from backend.search import search

QUERY = dict(city="Алматы", category="Ведущий", event_format="корпоратив",
             event_date="2026-10-15", budget=2000000)


@pytest.fixture
def client(monkeypatch):
    monkeypatch.delenv("AI_API_URL", raising=False)
    with TestClient(create_app(ROOT / "data/demo-contractors.json")) as c:
        yield c


def lookup(client, **changes):
    response = client.post("/api/search", json={**QUERY, **changes})
    assert response.status_code == 200, response.text
    return response.json()


def test_deterministic_shortlist(client):
    a = lookup(client)
    b = lookup(client)
    assert a == b and a["status"] == "matched" and len(a["results"]) == 3
    assert a["exclusions"]["busy_date"] == 1
    prices = [r["contractor"]["price_from_kzt"] for r in a["results"]]
    assert prices == sorted(prices)
    assert len({r["explanation"] for r in a["results"]}) == 3
    for r in a["results"]:
        assert "2026-10-15" not in r["contractor"]["busy_dates"]
        assert r["contractor"]["synthetic"] is True
        assert "от " in r["explanation"]


def test_dates_change_results(client):
    fall = lookup(client)
    winter = lookup(client, event_date="2026-12-25")
    assert [r["contractor"]["id"] for r in fall["results"]] != [r["contractor"]["id"] for r in winter["results"]]
    assert winter["exclusions"]["busy_date"] == 5
    assert "заняты" in winter["message"]
    assert all("2026-12-25" in r["explanation"] for r in winter["results"])


def test_rare_category_and_null_duration(client):
    result = lookup(client, category="Флорист", event_format="свадьба", duration=24)
    assert result["status"] == "matched" and len(result["results"]) == 2
    assert "всего 2" in result["message"]
    assert all(r["contractor"]["max_hours"] is None for r in result["results"])


def test_empty_states(client):
    absent = lookup(client, city="Астана", category="Декоратор")
    blocked = lookup(client, city="Астана", category="Флорист", event_format="свадьба")
    assert absent["status"] == "no_category" and absent["total_candidates"] == 0
    assert blocked["status"] == "no_match" and blocked["exclusions"]["busy_date"] == 1
    assert blocked["message"] and not blocked["results"]


def test_language_budget_hours_and_venues(client):
    result = lookup(client, language="казахский", duration=9, budget=950000)
    assert len(result["results"]) == 1
    contractor = result["results"][0]["contractor"]
    assert "казахский" in contractor["languages"] and contractor["max_hours"] >= 9
    assert lookup(client, category="Банкетный зал", budget=4000000)["exclusions"]["busy_date"] == 1
    assert lookup(client, budget=1)["status"] == "no_match"


@pytest.mark.parametrize("change", [{"budget": -1}, {"budget": 0}, {"duration": 0},
                                     {"event_date": "2026-09-22"}, {"event_date": "2027-01-01"},
                                     {"event_date": "2026-02-30"}, {"city": " "}])
def test_invalid_query(client, change):
    assert client.post("/api/search", json={**QUERY, **change}).status_code == 422


def test_uploaded_catalog_validation_and_isolation(client):
    original = client.get("/api/catalog").json()["items"]
    profiles = deepcopy(original[:1])
    profiles[0]["price_from_kzt"] = 1
    assert lookup(client, contractors=profiles)["total_candidates"] == 1
    assert client.get("/api/catalog").json()["items"] == original
    for invalid in [[], profiles + profiles, [{**profiles[0], "price_from_kzt": "NaN"}],
                    [{**profiles[0], "busy_dates": ["2026-13-01"]}], [{**profiles[0], "synthetic": "perhaps"}]]:
        assert client.post("/api/search", json={**QUERY, "contractors": invalid}).status_code == 422


def test_csv_jsonl_and_failure(tmp_path, client):
    import csv
    profiles = client.get("/api/catalog").json()["items"][:1]
    row = {k: "|".join(v) if isinstance(v, list) else v for k, v in profiles[0].items()}
    path = tmp_path / "test.csv"
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(row))
        writer.writeheader()
        writer.writerow(row)
    assert load_catalog(path)[0].id == profiles[0]["id"]
    path = tmp_path / "test.jsonl"
    path.write_text(json.dumps(profiles[0]), encoding="utf-8")
    assert len(load_catalog(path)) == 1
    path.write_text(json.dumps(profiles[0]) + "\n" + json.dumps(profiles[0]), encoding="utf-8")
    with pytest.raises(ValueError):
        load_catalog(path)


def test_ranking_ties_ignore_file_order(client):
    profiles = load_catalog(ROOT / "data/demo-contractors.json")[:2]
    profiles[0].price_from_kzt = profiles[1].price_from_kzt
    q = SearchQuery.model_validate(QUERY)
    assert search(profiles, q) == search(list(reversed(profiles)), q)


def test_ai_missing_and_invalid(client, monkeypatch):
    assert lookup(client, use_ai=True)["explanation_mode"] == "template"
    monkeypatch.setenv("AI_API_URL", "https://example.invalid/facts")
    class Response:
        content = b'{}'
        def raise_for_status(self): pass
        def json(self): return {"selections": {"fake": ["invented", "price"]}}
    monkeypatch.setattr(ai.httpx, "post", lambda *args, **kwargs: Response())
    result = lookup(client, use_ai=True)
    assert result["warning"] and result["explanation_mode"] == "template"


def test_ai_valid_fact_selection_and_order(client, monkeypatch):
    monkeypatch.setenv("AI_API_URL", "https://example.invalid/facts")
    class Response:
        content = b'{}'
        def __init__(self, facts): self.facts = facts
        def raise_for_status(self): pass
        def json(self): return {"selections": {cid: ["formats", "languages"] for cid in self.facts}}
    monkeypatch.setattr(ai.httpx, "post", lambda *args, **kw: Response(kw["json"]["facts"]))
    template = lookup(client)
    enhanced = lookup(client, use_ai=True)
    assert enhanced["explanation_mode"] == "ai_fact_selection"
    assert [r["contractor"] for r in template["results"]] == [r["contractor"] for r in enhanced["results"]]


def test_ui_and_no_private_files(client):
    for path in ("/", "/app.js", "/api-client.js", "/styles.css", "/docs", "/openapi.json"):
        assert client.get(path).status_code == 200
    for path in ("/.env", "/.git/config", "/backend/main.py"):
        assert client.get(path).status_code == 404

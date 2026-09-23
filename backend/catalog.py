import csv
import json
from pathlib import Path

from .models import Contractor

ROOT = Path(__file__).resolve().parents[1]


def load_catalog(path: Path) -> list[Contractor]:
    with path.open(encoding="utf-8-sig", newline="") as file:
        if path.suffix.lower() == ".csv":
            rows = list(csv.DictReader(file))
        elif path.suffix.lower() == ".jsonl":
            rows = [json.loads(line) for line in file if line.strip()]
        elif path.suffix.lower() == ".json":
            rows = json.load(file)
        else:
            raise ValueError("Поддерживаются CSV, JSONL или JSON")
    if not isinstance(rows, list) or not rows or len(rows) > 2000:
        raise ValueError("Каталог должен содержать от 1 до 2000 профилей")
    profiles = [Contractor.model_validate(row) for row in rows]
    if len({c.id for c in profiles}) != len(profiles):
        raise ValueError("Повторяющиеся ID подрядчиков")
    return profiles

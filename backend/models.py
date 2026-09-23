import json
from datetime import date
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator

WINDOW_START = date(2026, 9, 23)
WINDOW_END = date(2026, 12, 31)
Text = Annotated[str, Field(min_length=1, max_length=200)]


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, allow_inf_nan=False)


class Contractor(Model):
    id: Text
    anon_name: Text
    categories: list[Text] = Field(min_length=1, max_length=50)
    city: Text
    price_from_kzt: float = Field(ge=0, le=1e12)
    event_formats: list[Text] = Field(min_length=1, max_length=50)
    languages: list[Text] = Field(min_length=1, max_length=30)
    max_hours: float | None = Field(ge=0, le=1000)
    busy_dates: list[date] = Field(max_length=1000)
    description: str = Field(max_length=10000)
    synthetic: bool
    city_imputed: bool
    price_imputed: bool

    @field_validator("categories", "event_formats", "languages", "busy_dates", mode="before")
    @classmethod
    def parse_list(cls, value):
        if isinstance(value, str):
            if value.strip().startswith("["):
                return json.loads(value)
            return [s.strip() for s in value.split("|") if s.strip()]
        return value

    @field_validator("max_hours", mode="before")
    @classmethod
    def nullable_hours(cls, value):
        return None if value is None or value == "" else value

    @field_validator("busy_dates")
    @classmethod
    def valid_dates(cls, value):
        if any(d < WINDOW_START or d > WINDOW_END for d in value):
            raise ValueError("Дата занятости вне окна 23.09.2026–31.12.2026")
        return sorted(set(value))


class SearchQuery(Model):
    city: Text
    category: Text
    event_format: Text
    event_date: date
    budget: float = Field(gt=0, le=1e12)
    language: Text | None = None
    duration: float | None = Field(default=None, gt=0, le=1000)

    @field_validator("event_date")
    @classmethod
    def in_window(cls, value):
        if not WINDOW_START <= value <= WINDOW_END:
            raise ValueError("Календарь доступен только с 23.09.2026 по 31.12.2026")
        return value


class SearchRequest(SearchQuery):
    # Optional browser-local CSV, sent for this request only; never saved globally.
    contractors: list[Contractor] | None = Field(default=None, min_length=1, max_length=2000)
    use_ai: bool = False

    @field_validator("contractors")
    @classmethod
    def unique_ids(cls, value):
        if value is not None and len({c.id for c in value}) != len(value):
            raise ValueError("ID подрядчиков должны быть уникальными")
        return value

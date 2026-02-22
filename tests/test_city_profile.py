from __future__ import annotations

import json
from pathlib import Path

from core.city_profile import validate_city_profile_payload


ROOT = Path(__file__).resolve().parents[1]


def _load_city_payload(city_id: str) -> dict:
    path = ROOT / "config" / "cities" / f"{city_id}.json"
    return json.loads(path.read_text(encoding="utf-8"))


def test_validate_city_profile_preserves_valid_meta_advisors() -> None:
    payload = _load_city_payload("new_delhi")
    normalized = validate_city_profile_payload(payload, expected_city_id="new_delhi")
    advisors = normalized["meta"].get("advisors", [])
    assert isinstance(advisors, list)
    assert advisors
    first = advisors[0]
    assert first["advisor_id"]
    assert first["name"]
    assert first["portfolios"]
    assert first["style"]
    assert first["aliases"]
    assert first["tone"]
    assert first["voice_traits"]
    assert first["conversational_habits"]
    assert first["taboo_patterns"]


def test_validate_city_profile_soft_fails_invalid_meta_advisors() -> None:
    payload = _load_city_payload("new_delhi")
    payload["meta"]["advisors"] = [{"advisor_id": "", "name": "", "portfolios": [], "style": "", "aliases": []}]
    normalized = validate_city_profile_payload(payload, expected_city_id="new_delhi")
    assert normalized["meta"].get("advisors", []) == []
    assert "advisors_validation_error" in normalized["meta"]


def test_validate_city_profile_synthesizes_personality_defaults() -> None:
    payload = _load_city_payload("new_delhi")
    payload["meta"]["advisors"][0].pop("tone", None)
    payload["meta"]["advisors"][0].pop("voice_traits", None)
    payload["meta"]["advisors"][0].pop("conversational_habits", None)
    payload["meta"]["advisors"][0].pop("taboo_patterns", None)
    normalized = validate_city_profile_payload(payload, expected_city_id="new_delhi")
    first = normalized["meta"]["advisors"][0]
    assert first["tone"]
    assert first["voice_traits"]
    assert first["conversational_habits"]
    assert first["taboo_patterns"]

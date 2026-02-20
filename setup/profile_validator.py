from __future__ import annotations

from typing import Any

from core.city_profile import CityProfileError, validate_city_profile_payload


def validate_generated_profile(raw_payload: dict[str, Any], city_id: str) -> dict[str, Any]:
    if not isinstance(raw_payload, dict):
        raise CityProfileError("Generated profile must be a JSON object")

    payload = raw_payload.get("profile") if "profile" in raw_payload else raw_payload
    if not isinstance(payload, dict):
        raise CityProfileError("Generated profile payload is not an object")

    return validate_city_profile_payload(payload, expected_city_id=city_id)

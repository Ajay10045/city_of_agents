from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def _to_float(value: Any, default: float | None = None) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


VALID_STATS = {
    "economy", "employment", "law_and_order", "infrastructure",
    "environment", "corruption", "social_tension", "media_freedom", "public_trust",
}

VALID_MEDIA = {"bias", "sensationalism", "trust"}

VALID_GROUP_FIELDS = {"happiness", "alignment", "radicalization", "trust_in_government"}

VALID_MATCH_KEYS = {"religion", "caste", "language"}


@dataclass
class DynamicPolicy:
    id: str
    name: str
    description: str
    effects: dict[str, float]
    group_effects: list[dict[str, Any]]
    campaign_strength: float
    media_effects: dict[str, float]
    rationale: str
    actor: str = "mayor"

    @classmethod
    def from_llm(cls, data: dict, actor: str = "mayor") -> "DynamicPolicy":
        """Parse and validate LLM-returned dict into a DynamicPolicy."""
        effects: dict[str, float] = {}
        raw_effects = data.get("effects", {})
        if isinstance(raw_effects, dict):
            for k, v in raw_effects.items():
                if k not in VALID_STATS:
                    continue
                numeric = _to_float(v)
                if numeric is None:
                    continue
                effects[k] = _clamp(numeric, -10.0, 10.0)

        raw_ge = data.get("group_effects", [])
        group_effects: list[dict[str, Any]] = []
        for ge in raw_ge if isinstance(raw_ge, list) else []:
            if not isinstance(ge, dict):
                continue
            raw_match = ge.get("match", {})
            if not isinstance(raw_match, dict):
                raw_match = {}
            match = {k: str(v) for k, v in raw_match.items() if k in VALID_MATCH_KEYS}
            clean: dict[str, Any] = {"match": match}
            for field_name in VALID_GROUP_FIELDS:
                if field_name in ge:
                    numeric = _to_float(ge[field_name])
                    if numeric is not None:
                        clean[field_name] = _clamp(numeric, -8.0, 8.0)
            group_effects.append(clean)

        media_effects: dict[str, float] = {}
        raw_media = data.get("media_effects", {})
        if isinstance(raw_media, dict):
            for k, v in raw_media.items():
                if k not in VALID_MEDIA:
                    continue
                numeric = _to_float(v)
                if numeric is None:
                    continue
                media_effects[k] = _clamp(numeric, -10.0, 10.0)

        campaign_strength = _clamp(_to_float(data.get("campaign_strength"), 1.0) or 1.0, 0.8, 1.5)

        return cls(
            id=str(uuid.uuid4()),
            name=str(data.get("name", "Unknown Policy"))[:80],
            description=str(data.get("description", ""))[:300],
            rationale=str(data.get("rationale", ""))[:400],
            effects=effects,
            group_effects=group_effects,
            campaign_strength=campaign_strength,
            media_effects=media_effects,
            actor=actor,
        )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "rationale": self.rationale,
            "effects": self.effects,
            "group_effects": self.group_effects,
            "campaign_strength": self.campaign_strength,
            "media_effects": self.media_effects,
            "actor": self.actor,
        }

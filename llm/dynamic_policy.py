from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


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
        effects = {
            k: _clamp(float(v), -10.0, 10.0)
            for k, v in data.get("effects", {}).items()
            if k in VALID_STATS
        }

        raw_ge = data.get("group_effects", [])
        group_effects: list[dict[str, Any]] = []
        for ge in raw_ge if isinstance(raw_ge, list) else []:
            match = {k: str(v) for k, v in ge.get("match", {}).items() if k in VALID_MATCH_KEYS}
            clean: dict[str, Any] = {"match": match}
            for field_name in VALID_GROUP_FIELDS:
                if field_name in ge:
                    clean[field_name] = _clamp(float(ge[field_name]), -8.0, 8.0)
            group_effects.append(clean)

        media_effects = {
            k: _clamp(float(v), -10.0, 10.0)
            for k, v in data.get("media_effects", {}).items()
            if k in VALID_MEDIA
        }

        campaign_strength = _clamp(float(data.get("campaign_strength", 1.0)), 0.8, 1.5)

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

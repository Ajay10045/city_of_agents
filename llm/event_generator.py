from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from llm.llm_client import LLMClient
from llm.context_builder import build_city_context
from llm.dynamic_policy import _clamp, VALID_STATS, VALID_MEDIA, VALID_GROUP_FIELDS, VALID_MATCH_KEYS

if TYPE_CHECKING:
    from core.game_state import GameState

_SYSTEM = """You are a city event oracle for a political simulation. Your job is to decide whether a crisis or notable event emerges this turn based on the current city state, and if so, to describe it.

Events emerge organically from systemic pressures — they are NOT random. A corruption scandal should follow high corruption + low trust. Worker strikes follow low employment + high social tension. A flood can happen anytime but worsens with poor infrastructure.

Rules:
- Generate an event ONLY if city conditions logically support it
- Do NOT generate an event if there are already 2+ active crises or if city is generally stable
- Probability should feel like ~25% per turn in a stressed city, ~5% in a stable one
- Events must be causally linked to current city stats and group sentiment

Return a JSON object with:
- "generate": true or false
- "event": (only if generate=true) object with:
  - "name": short crisis name (max 6 words)
  - "description": 2-3 sentence vivid narrative of what is happening in the city. Specific and dramatic.
  - "type": one of "political", "social", "economic", "disaster", "media"
  - "severity": one of "minor", "moderate", "major"
  - "duration": integer 1, 2, or 3 (turns this crisis lasts)
  - "city_effects": object with city stat changes (keys from: economy, employment, law_and_order, infrastructure, environment, corruption, social_tension, media_freedom, public_trust). Values -10 to +10. Must be causally consistent with event type.
  - "group_effects": list of group impact objects. Each has "match" (one key: "religion"/"caste"/"language"), and some of: "happiness" (-8 to 8), "alignment" (-8 to 8), "radicalization" (-8 to 8). Only groups logically affected.
  - "media_effects": object with some of: "bias" (-5 to 5), "sensationalism" (1 to 8 for events), "trust" (-5 to 0 typically)"""


@dataclass
class GeneratedEvent:
    name: str
    description: str
    type: str
    severity: str
    duration: int
    city_effects: dict[str, float]
    group_effects: list[dict[str, Any]]
    media_effects: dict[str, float]

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "description": self.description,
            "type": self.type,
            "severity": self.severity,
            "duration": self.duration,
            "city_effects": self.city_effects,
            "group_effects": self.group_effects,
            "media_effects": self.media_effects,
        }


class EventGenerator:
    def __init__(self) -> None:
        model = os.environ.get("LLM_DEBATE_MODEL", "gpt-4o-mini")
        self._client = LLMClient(model=model)

    def maybe_generate_event(self, game_state: "GameState") -> GeneratedEvent | None:
        context = build_city_context(game_state)
        user = f"City state:\n{context}\n\nShould a crisis event emerge this turn? If yes, describe it."
        data = self._client.chat(_SYSTEM, user)

        if not data.get("generate", False):
            return None

        raw = data.get("event", {})
        if not raw:
            return None

        city_effects = {
            k: _clamp(float(v), -10.0, 10.0)
            for k, v in raw.get("city_effects", {}).items()
            if k in VALID_STATS
        }

        raw_ge = raw.get("group_effects", [])
        group_effects = []
        for ge in raw_ge if isinstance(raw_ge, list) else []:
            raw_match = ge.get("match", {})
            if not isinstance(raw_match, dict):
                raw_match = {}
            match = {k: str(v) for k, v in raw_match.items() if k in VALID_MATCH_KEYS}
            clean: dict[str, Any] = {"match": match}
            for f in VALID_GROUP_FIELDS:
                if f in ge:
                    clean[f] = _clamp(float(ge[f]), -8.0, 8.0)
            group_effects.append(clean)

        media_effects = {
            k: _clamp(float(v), -10.0, 10.0)
            for k, v in raw.get("media_effects", {}).items()
            if k in VALID_MEDIA
        }

        duration = max(1, min(3, int(raw.get("duration", 2))))
        severity = raw.get("severity", "moderate")
        if severity not in ("minor", "moderate", "major"):
            severity = "moderate"

        return GeneratedEvent(
            name=str(raw.get("name", "Unknown Crisis"))[:80],
            description=str(raw.get("description", ""))[:600],
            type=str(raw.get("type", "social")),
            severity=severity,
            duration=duration,
            city_effects=city_effects,
            group_effects=group_effects,
            media_effects=media_effects,
        )

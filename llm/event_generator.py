from __future__ import annotations

import os
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from llm.llm_client import LLMClient
from llm.context_builder import build_city_context
from llm.dynamic_policy import (
    _clamp,
    _to_float,
    VALID_STATS,
    VALID_MEDIA,
    VALID_GROUP_FIELDS,
    VALID_MATCH_KEYS,
)

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
        key = (
            os.environ.get("LLM_API_KEY")
            or os.environ.get("OPENAI_API_KEY")
            or os.environ.get("ANTHROPIC_API_KEY")
            or ""
        )
        self._disable_live = key.startswith("test-")
        self._client: LLMClient | None
        try:
            self._client = LLMClient(model=model)
        except Exception:
            self._client = None

    def maybe_generate_event(self, game_state: "GameState") -> GeneratedEvent | None:
        context = build_city_context(game_state)
        user = f"City state:\n{context}\n\nShould a crisis event emerge this turn? If yes, describe it."
        data: dict[str, Any]
        if self._client is not None and not self._disable_live:
            try:
                data = self._client.chat(_SYSTEM, user)
            except Exception:
                data = {"generate": False}
        else:
            data = {"generate": False}

        if not data.get("generate", False):
            # deterministic fallback trigger for stressed conditions
            stress = (
                float(game_state.city_stats.social_tension) * 0.30
                + float(game_state.city_stats.corruption) * 0.22
                - float(game_state.city_stats.public_trust) * 0.18
            ) / 100.0
            chance = max(0.02, min(0.30, 0.03 + max(0.0, stress) * 0.72))
            # Cadence guardrail: avoid event spam when crises are already active.
            active_pressure = len(game_state.active_events)
            if active_pressure > 0:
                chance *= max(0.35, 1.0 - active_pressure * 0.28)
            if game_state.turn_number <= 2:
                chance *= 0.7
            if game_state.rng.random() > chance:
                return None
            return GeneratedEvent(
                name="Public Discontent Wave",
                description=(
                    "Localized protests intensify around service access and governance credibility, "
                    "forcing an emergency narrative battle."
                ),
                type="social",
                severity="moderate",
                duration=2,
                city_effects={"public_trust": -1.4, "social_tension": 1.7, "law_and_order": -0.6},
                group_effects=[],
                media_effects={"sensationalism": 1.3, "trust": -0.4},
            )

        raw = data.get("event", {})
        if not raw:
            return None

        city_effects: dict[str, float] = {}
        raw_city_effects = raw.get("city_effects", {})
        if isinstance(raw_city_effects, dict):
            for k, v in raw_city_effects.items():
                if k not in VALID_STATS:
                    continue
                numeric = _to_float(v)
                if numeric is not None:
                    city_effects[k] = _clamp(numeric, -10.0, 10.0)

        raw_ge = raw.get("group_effects", [])
        group_effects = []
        for ge in raw_ge if isinstance(raw_ge, list) else []:
            if not isinstance(ge, dict):
                continue
            raw_match = ge.get("match", {})
            if not isinstance(raw_match, dict):
                raw_match = {}
            match = {k: str(v) for k, v in raw_match.items() if k in VALID_MATCH_KEYS}
            clean: dict[str, Any] = {"match": match}
            for f in VALID_GROUP_FIELDS:
                if f in ge:
                    numeric = _to_float(ge[f])
                    if numeric is not None:
                        clean[f] = _clamp(numeric, -8.0, 8.0)
            group_effects.append(clean)

        media_effects: dict[str, float] = {}
        raw_media_effects = raw.get("media_effects", {})
        if isinstance(raw_media_effects, dict):
            for k, v in raw_media_effects.items():
                if k not in VALID_MEDIA:
                    continue
                numeric = _to_float(v)
                if numeric is not None:
                    media_effects[k] = _clamp(numeric, -10.0, 10.0)

        duration_value = _to_float(raw.get("duration"), 2.0) or 2.0
        duration = max(1, min(3, int(duration_value)))
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

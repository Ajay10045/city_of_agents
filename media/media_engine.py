from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from llm.dynamic_policy import DynamicPolicy


def _clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


@dataclass
class MediaState:
    bias: float = 0.0
    sensationalism: float = 46.0
    trust: float = 54.0
    network_density: float = 0.65

    def clamp_state(self) -> None:
        self.bias = _clamp(self.bias, -50.0, 50.0)
        self.sensationalism = _clamp(self.sensationalism, 0.0, 100.0)
        self.trust = _clamp(self.trust, 0.0, 100.0)
        self.network_density = _clamp(self.network_density, 0.0, 1.0)


class MediaEngine:
    def update_narrative(
        self,
        media_state: MediaState,
        mayor_media_effects: dict[str, float],
        opposition_media_effects: dict[str, float],
        event_media_effects: dict[str, float],
    ) -> None:
        media_state.bias += float(mayor_media_effects.get("bias", 0.0))
        media_state.bias += float(opposition_media_effects.get("bias", 0.0))
        media_state.bias += float(event_media_effects.get("bias", 0.0))

        media_state.sensationalism += float(mayor_media_effects.get("sensationalism", 0.0))
        media_state.sensationalism += float(opposition_media_effects.get("sensationalism", 0.0))
        media_state.sensationalism += float(event_media_effects.get("sensationalism", 0.0))

        media_state.trust += float(mayor_media_effects.get("trust", 0.0))
        media_state.trust += float(opposition_media_effects.get("trust", 0.0))
        media_state.trust += float(event_media_effects.get("trust", 0.0))

        # Gentle drift toward neutral framing to avoid runaway extremes.
        media_state.bias *= 0.97
        media_state.sensationalism = (media_state.sensationalism * 0.97) + 1.2
        media_state.trust = (media_state.trust * 0.985) + 0.6

        media_state.clamp_state()

    @staticmethod
    def rumor_spread_chance(media_state: MediaState, average_radicalization: float) -> float:
        spread = (
            media_state.network_density
            * (media_state.sensationalism / 100.0)
            * (average_radicalization / 100.0)
            - (media_state.trust / 100.0)
        )
        return _clamp(spread, 0.0, 1.0)

    @staticmethod
    def popularity_modifiers(media_state: MediaState) -> tuple[float, float]:
        bias_component = media_state.bias / 50.0
        sensationalism_component = media_state.sensationalism / 100.0
        trust_component = media_state.trust / 100.0

        mayor_modifier = 1.0 + bias_component * 0.16 + trust_component * 0.10 - sensationalism_component * 0.07
        opposition_modifier = (
            1.0 - bias_component * 0.16 + sensationalism_component * 0.09 + (1.0 - trust_component) * 0.06
        )

        return _clamp(mayor_modifier, 0.7, 1.35), _clamp(opposition_modifier, 0.7, 1.35)

    @staticmethod
    def _front_from_effects(effects: dict[str, float]) -> str:
        if not effects:
            return "governance"
        stat = max(effects, key=lambda key: abs(float(effects.get(key, 0.0))))
        mapping = {
            "economy": "economy",
            "employment": "economy",
            "infrastructure": "services",
            "environment": "services",
            "corruption": "corruption",
            "law_and_order": "safety",
            "social_tension": "social_cohesion",
            "media_freedom": "media",
            "public_trust": "public_trust",
        }
        return mapping.get(stat, "governance")

    def build_narrative_cards(
        self,
        mayor_action: "DynamicPolicy",
        opposition_action: "DynamicPolicy",
        triggered_events: list[str],
        dominant_fronts: list[str],
        media_state: MediaState,
    ) -> list[dict[str, Any]]:
        virality_base = int(round((media_state.sensationalism * 0.55) + 25.0))
        trust_swing = (media_state.trust - 50.0) / 10.0
        mayor_front = self._front_from_effects(mayor_action.effects)
        opp_front = self._front_from_effects(opposition_action.effects)
        top_front = dominant_fronts[0] if dominant_fronts else mayor_front

        cards: list[dict[str, Any]] = [
            {
                "headline": f"Mayor pushes {mayor_action.name}",
                "source": "CivicWire",
                "lean": "mayor",
                "virality": int(_clamp(virality_base + max(0, media_state.bias), 0, 100)),
                "trust_impact": round(_clamp(1.2 + trust_swing, -10.0, 10.0), 2),
                "front": mayor_front,
            },
            {
                "headline": f"Opposition frames {opposition_action.name}",
                "source": "People's Pulse",
                "lean": "opposition",
                "virality": int(_clamp(virality_base + max(0, -media_state.bias) + 1.5, 0, 100)),
                "trust_impact": round(_clamp(-0.5 - trust_swing * 0.45, -10.0, 10.0), 2),
                "front": opp_front,
            },
        ]

        if triggered_events:
            cards.append(
                {
                    "headline": f"Crisis watch: {triggered_events[0]}",
                    "source": "Metro Live",
                    "lean": "neutral",
                    "virality": int(_clamp(virality_base + 12.0, 0, 100)),
                    "trust_impact": round(
                        _clamp(-1.5 + ((media_state.trust - 50.0) / 18.0), -10.0, 10.0), 2
                    ),
                    "front": top_front,
                }
            )

        return cards

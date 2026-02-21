from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from llm.dynamic_policy import DynamicPolicy


def _clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


@dataclass
class MediaOutletState:
    outlet_id: str
    name: str
    lean: str
    bias: float = 0.0
    sensationalism: float = 46.0
    trust: float = 54.0

    def clamp_state(self) -> None:
        self.bias = _clamp(self.bias, -50.0, 50.0)
        self.sensationalism = _clamp(self.sensationalism, 0.0, 100.0)
        self.trust = _clamp(self.trust, 0.0, 100.0)


@dataclass
class MediaState:
    bias: float = 0.0
    sensationalism: float = 46.0
    trust: float = 54.0
    network_density: float = 0.65
    outlets: list[MediaOutletState] = field(default_factory=list)

    def clamp_state(self) -> None:
        self.bias = _clamp(self.bias, -50.0, 50.0)
        self.sensationalism = _clamp(self.sensationalism, 0.0, 100.0)
        self.trust = _clamp(self.trust, 0.0, 100.0)
        self.network_density = _clamp(self.network_density, 0.0, 1.0)
        for outlet in self.outlets:
            outlet.clamp_state()


class MediaEngine:
    @staticmethod
    def _normalize_lean(lean: str) -> str:
        raw = str(lean).strip().lower()
        if raw in {"mayor", "pro_mayor", "pro-mayor"}:
            return "mayor"
        if raw in {"opposition", "opposition_lean", "pro_opp", "pro-opposition"}:
            return "opposition"
        return "neutral"

    @classmethod
    def outlets_from_config(
        cls,
        raw_outlets: list[dict[str, Any]] | None,
        fallback_bias: float = 0.0,
        fallback_sensationalism: float = 46.0,
        fallback_trust: float = 54.0,
    ) -> list[MediaOutletState]:
        parsed: list[MediaOutletState] = []
        for idx, raw in enumerate(raw_outlets or []):
            if not isinstance(raw, dict):
                continue
            outlet_id = str(raw.get("id", f"outlet_{idx + 1}")).strip() or f"outlet_{idx + 1}"
            name = str(raw.get("name", "")).strip() or f"City Desk {idx + 1}"
            lean = cls._normalize_lean(str(raw.get("lean", "neutral")))
            parsed.append(
                MediaOutletState(
                    outlet_id=outlet_id,
                    name=name,
                    lean=lean,
                    bias=float(raw.get("bias", fallback_bias)),
                    sensationalism=float(raw.get("sensationalism", fallback_sensationalism)),
                    trust=float(raw.get("trust", fallback_trust)),
                )
            )

        if parsed:
            for outlet in parsed:
                outlet.clamp_state()
            return parsed

        return [
            MediaOutletState(
                outlet_id="civic_wire",
                name="CivicWire",
                lean="mayor",
                bias=fallback_bias + 4.5,
                sensationalism=fallback_sensationalism - 1.0,
                trust=fallback_trust + 2.0,
            ),
            MediaOutletState(
                outlet_id="peoples_pulse",
                name="People's Pulse",
                lean="opposition",
                bias=fallback_bias - 4.5,
                sensationalism=fallback_sensationalism + 3.0,
                trust=fallback_trust - 3.0,
            ),
            MediaOutletState(
                outlet_id="metro_live",
                name="Metro Live",
                lean="neutral",
                bias=fallback_bias,
                sensationalism=fallback_sensationalism + 1.5,
                trust=fallback_trust,
            ),
        ]

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

        for outlet in media_state.outlets:
            if outlet.lean == "mayor":
                outlet.bias += float(mayor_media_effects.get("bias", 0.0)) * 0.7
                outlet.bias += float(opposition_media_effects.get("bias", 0.0)) * 0.35
                outlet.bias += float(event_media_effects.get("bias", 0.0)) * 0.35
                outlet.trust += float(mayor_media_effects.get("trust", 0.0)) * 0.5
                outlet.trust += float(opposition_media_effects.get("trust", 0.0)) * 0.22
                outlet.sensationalism += float(opposition_media_effects.get("sensationalism", 0.0)) * 0.5
            elif outlet.lean == "opposition":
                outlet.bias += float(opposition_media_effects.get("bias", 0.0)) * 0.7
                outlet.bias += float(mayor_media_effects.get("bias", 0.0)) * 0.35
                outlet.bias += float(event_media_effects.get("bias", 0.0)) * 0.35
                outlet.trust += float(opposition_media_effects.get("trust", 0.0)) * 0.5
                outlet.trust += float(mayor_media_effects.get("trust", 0.0)) * 0.22
                outlet.sensationalism += float(mayor_media_effects.get("sensationalism", 0.0)) * 0.5
            else:
                outlet.bias += (
                    float(mayor_media_effects.get("bias", 0.0))
                    + float(opposition_media_effects.get("bias", 0.0))
                    + float(event_media_effects.get("bias", 0.0))
                ) * 0.2
                outlet.trust += (
                    float(mayor_media_effects.get("trust", 0.0))
                    + float(opposition_media_effects.get("trust", 0.0))
                    + float(event_media_effects.get("trust", 0.0))
                ) * 0.35
                outlet.sensationalism += (
                    float(mayor_media_effects.get("sensationalism", 0.0))
                    + float(opposition_media_effects.get("sensationalism", 0.0))
                    + float(event_media_effects.get("sensationalism", 0.0))
                ) * 0.45

            outlet.sensationalism = outlet.sensationalism * 0.96 + media_state.sensationalism * 0.04
            outlet.trust = outlet.trust * 0.97 + media_state.trust * 0.03
            outlet.clamp_state()

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
        city_id: str | None = None,
    ) -> list[dict[str, Any]]:
        virality_base = int(round((media_state.sensationalism * 0.55) + 25.0))
        trust_swing = (media_state.trust - 50.0) / 10.0
        mayor_front = self._front_from_effects(mayor_action.effects)
        opp_front = self._front_from_effects(opposition_action.effects)
        top_front = dominant_fronts[0] if dominant_fronts else mayor_front
        outlets = list(media_state.outlets[:3])
        if len(outlets) < 3:
            outlets = self.outlets_from_config([])

        mayor_outlet, opp_outlet, neutral_outlet = outlets[0], outlets[1], outlets[2]

        cards: list[dict[str, Any]] = [
            {
                "headline": f"Mayor pushes {mayor_action.name}",
                "source": mayor_outlet.name,
                "outlet_id": mayor_outlet.outlet_id,
                "city_id": city_id or "",
                "lean": "mayor",
                "virality": int(_clamp(virality_base + max(0, mayor_outlet.bias), 0, 100)),
                "trust_impact": round(_clamp(1.2 + trust_swing, -10.0, 10.0), 2),
                "front": mayor_front,
            },
            {
                "headline": f"Opposition frames {opposition_action.name}",
                "source": opp_outlet.name,
                "outlet_id": opp_outlet.outlet_id,
                "city_id": city_id or "",
                "lean": "opposition",
                "virality": int(_clamp(virality_base + max(0, -opp_outlet.bias) + 1.5, 0, 100)),
                "trust_impact": round(_clamp(-0.5 - trust_swing * 0.45, -10.0, 10.0), 2),
                "front": opp_front,
            },
        ]

        if triggered_events:
            cards.append(
                {
                    "headline": f"Crisis watch: {triggered_events[0]}",
                    "source": neutral_outlet.name,
                    "outlet_id": neutral_outlet.outlet_id,
                    "city_id": city_id or "",
                    "lean": "neutral",
                    "virality": int(_clamp(virality_base + 12.0, 0, 100)),
                    "trust_impact": round(
                        _clamp(-1.5 + ((media_state.trust - 50.0) / 18.0), -10.0, 10.0), 2
                    ),
                    "front": top_front,
                }
            )

        return cards

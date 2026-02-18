from __future__ import annotations

from dataclasses import dataclass


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

        mayor_modifier = 1.0 + bias_component * 0.18 + trust_component * 0.12 - sensationalism_component * 0.08
        opposition_modifier = (
            1.0 - bias_component * 0.18 + sensationalism_component * 0.12 + (1.0 - trust_component) * 0.08
        )

        return _clamp(mayor_modifier, 0.7, 1.35), _clamp(opposition_modifier, 0.7, 1.35)

from __future__ import annotations

from dataclasses import asdict, dataclass


STAT_KEYS: tuple[str, ...] = (
    "economy",
    "employment",
    "law_and_order",
    "infrastructure",
    "environment",
    "corruption",
    "social_tension",
    "media_freedom",
    "public_trust",
)


def clamp(value: float, lower: float = 0.0, upper: float = 100.0) -> float:
    return max(lower, min(upper, value))


@dataclass
class CityStats:
    economy: float = 54.0
    employment: float = 50.0
    law_and_order: float = 52.0
    infrastructure: float = 50.0
    environment: float = 50.0
    corruption: float = 42.0
    social_tension: float = 44.0
    media_freedom: float = 58.0
    public_trust: float = 50.0

    def as_dict(self) -> dict[str, float]:
        return asdict(self)

    def normalized(self) -> dict[str, float]:
        return {key: getattr(self, key) / 100.0 for key in STAT_KEYS}

    def apply_delta(self, deltas: dict[str, float]) -> dict[str, float]:
        applied: dict[str, float] = {}
        for key, delta in deltas.items():
            if key not in STAT_KEYS:
                continue
            before = getattr(self, key)
            after = clamp(before + delta)
            setattr(self, key, after)
            applied[key] = after - before
        return applied

    def stability_index(self) -> float:
        stability = (
            self.law_and_order * 0.3
            + self.public_trust * 0.3
            + self.economy * 0.2
            - self.social_tension * 0.1
            - self.corruption * 0.1
        )
        return clamp(stability)

from __future__ import annotations

from dataclasses import asdict, dataclass


PILLAR_KEYS: tuple[str, ...] = ("wealth", "health", "safety", "social")

SUB_METRICS: dict[str, tuple[str, ...]] = {
    "wealth": ("treasury_balance", "employment_rate", "avg_wage"),
    "health": ("hospital_capacity", "pollution_levels", "food_supply"),
    "safety": ("police_coverage", "recidivism_rate", "lighting_level"),
    "social": ("park_density", "connectivity", "media_access"),
}

STAT_KEYS: tuple[str, ...] = tuple(key for subs in SUB_METRICS.values() for key in subs)

# +1 = higher is better, -1 = lower is better
STAT_DIRECTION: dict[str, int] = {
    "treasury_balance": 1,
    "employment_rate": 1,
    "avg_wage": 1,
    "hospital_capacity": 1,
    "pollution_levels": -1,
    "food_supply": 1,
    "police_coverage": 1,
    "recidivism_rate": -1,
    "lighting_level": 1,
    "park_density": 1,
    "connectivity": 1,
    "media_access": 1,
}

PILLAR_FOR_STAT: dict[str, str] = {
    stat: pillar for pillar, stats in SUB_METRICS.items() for stat in stats
}


def clamp(value: float, lower: float = 0.0, upper: float = 100.0) -> float:
    return max(lower, min(upper, value))


@dataclass
class CityStats:
    # Wealth pillar
    treasury_balance: float = 52.0
    employment_rate: float = 50.0
    avg_wage: float = 48.0
    # Health pillar
    hospital_capacity: float = 50.0
    pollution_levels: float = 55.0  # lower is better
    food_supply: float = 52.0
    # Safety pillar
    police_coverage: float = 50.0
    recidivism_rate: float = 45.0  # lower is better
    lighting_level: float = 48.0
    # Social pillar
    park_density: float = 45.0
    connectivity: float = 50.0
    media_access: float = 55.0

    def as_dict(self) -> dict[str, float]:
        return asdict(self)

    def normalized(self) -> dict[str, float]:
        return {key: getattr(self, key) / 100.0 for key in STAT_KEYS}

    def pillar_scores(self) -> dict[str, float]:
        """Compute aggregate pillar scores (0-100). Bad-high stats are inverted."""
        scores: dict[str, float] = {}
        for pillar, subs in SUB_METRICS.items():
            total = 0.0
            for stat in subs:
                value = getattr(self, stat)
                if STAT_DIRECTION[stat] == -1:
                    value = 100.0 - value  # invert bad-high
                total += value
            scores[pillar] = clamp(total / len(subs))
        return scores

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

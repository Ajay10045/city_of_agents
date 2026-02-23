from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping


def clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


@dataclass(frozen=True)
class AgentIdentity:
    religion: str
    caste: str
    language: str

    def matches(self, criteria: Mapping[str, str]) -> bool:
        for key, expected in criteria.items():
            if expected is None:
                continue
            if getattr(self, key, None) != expected:
                return False
        return True


@dataclass
class Agent:
    id: int
    role: str
    wealth: float
    health: float
    safety: float
    social: float
    identity: AgentIdentity
    group_id: str
    population_weight: float

    def clamp_state(self) -> None:
        self.wealth = clamp(self.wealth, 0.0, 100.0)
        self.health = clamp(self.health, 0.0, 100.0)
        self.safety = clamp(self.safety, 0.0, 100.0)
        self.social = clamp(self.social, 0.0, 100.0)

    def overall_satisfaction(self) -> float:
        """Average of all 4 pillar scores. Used for popularity derivation."""
        return (self.wealth + self.health + self.safety + self.social) / 4.0

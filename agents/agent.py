from __future__ import annotations

from dataclasses import dataclass, field
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
    influence: float
    radicalization: float
    alignment: float
    happiness: float
    trust_in_government: float
    identity: AgentIdentity
    group_id: str
    population_weight: float
    traits: list[str] = field(default_factory=list)

    def clamp_state(self) -> None:
        self.wealth = clamp(self.wealth, 0.0, 100.0)
        self.influence = clamp(self.influence, 0.0, 100.0)
        self.radicalization = clamp(self.radicalization, 0.0, 100.0)
        self.alignment = clamp(self.alignment, -100.0, 100.0)
        self.happiness = clamp(self.happiness, 0.0, 100.0)
        self.trust_in_government = clamp(self.trust_in_government, 0.0, 100.0)

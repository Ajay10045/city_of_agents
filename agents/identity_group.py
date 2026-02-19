from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping


@dataclass
class IdentityGroup:
    id: str
    name: str
    religion: str
    caste: str
    language: str
    population_percent: float
    economic_modifier: float
    education_modifier: float
    grievance_score: float
    radicalization_base_rate: float
    issue_sensitivity: dict[str, float] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "IdentityGroup":
        population = float(payload["population_percent"])
        if population > 1.0:
            population /= 100.0

        return cls(
            id=str(payload["id"]),
            name=str(payload["name"]),
            religion=str(payload["religion"]),
            caste=str(payload["caste"]),
            language=str(payload["language"]),
            population_percent=population,
            economic_modifier=float(payload["economic_modifier"]),
            education_modifier=float(payload["education_modifier"]),
            grievance_score=float(payload["grievance_score"]),
            radicalization_base_rate=float(payload["radicalization_base_rate"]),
            issue_sensitivity={
                str(k): float(v) for k, v in payload.get("issue_sensitivity", {}).items()
            },
        )

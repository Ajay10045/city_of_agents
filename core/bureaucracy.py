from __future__ import annotations

from dataclasses import dataclass


def _clamp(value: float, lower: float = 0.2, upper: float = 0.95) -> float:
    return max(lower, min(upper, value))


@dataclass
class BureaucracyTraits:
    """Aggregate traits of the advisory council / bureaucracy."""

    competency: float = 0.60
    integrity: float = 0.55
    skill: float = 0.58

    def execution_factor(self) -> float:
        """Combined score used in delivery simulation."""
        return self.competency * 0.45 + self.integrity * 0.30 + self.skill * 0.25

    def apply_delta(self, deltas: dict[str, float]) -> dict[str, float]:
        applied: dict[str, float] = {}
        for key in ("competency", "integrity", "skill"):
            delta = deltas.get(key, 0.0)
            if delta == 0.0:
                continue
            before = getattr(self, key)
            after = _clamp(before + delta)
            setattr(self, key, after)
            applied[key] = after - before
        return applied

    def as_dict(self) -> dict[str, float]:
        return {
            "competency": self.competency,
            "integrity": self.integrity,
            "skill": self.skill,
        }

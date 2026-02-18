from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Relationship:
    agent_id: int
    target_agent_id: int
    strength: float

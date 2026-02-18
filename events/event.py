from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping


@dataclass
class EventDefinition:
    id: str
    name: str
    type: str
    base_risk: float
    weight: float
    min_turn: int
    cooldown: int
    duration: int
    escalation_chance: float
    max_escalation: int
    conditions: dict[str, float] = field(default_factory=dict)
    city_effects: dict[str, float] = field(default_factory=dict)
    group_effects: list[dict[str, Any]] = field(default_factory=list)
    media_effects: dict[str, float] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "EventDefinition":
        return cls(
            id=str(payload["id"]),
            name=str(payload["name"]),
            type=str(payload["type"]),
            base_risk=float(payload.get("base_risk", 0.02)),
            weight=float(payload.get("weight", 1.0)),
            min_turn=int(payload.get("min_turn", 1)),
            cooldown=int(payload.get("cooldown", 4)),
            duration=int(payload.get("duration", 2)),
            escalation_chance=float(payload.get("escalation_chance", 0.15)),
            max_escalation=int(payload.get("max_escalation", 3)),
            conditions={
                str(k): float(v) for k, v in payload.get("conditions", {}).items()
            },
            city_effects={
                str(k): float(v) for k, v in payload.get("city_effects", {}).items()
            },
            group_effects=[dict(effect) for effect in payload.get("group_effects", [])],
            media_effects={
                str(k): float(v) for k, v in payload.get("media_effects", {}).items()
            },
        )


@dataclass
class ActiveEvent:
    definition_id: str
    name: str
    type: str
    escalation_level: int
    remaining_turns: int
    escalation_chance: float
    max_escalation: int
    city_effects: dict[str, float] = field(default_factory=dict)
    group_effects: list[dict[str, Any]] = field(default_factory=list)
    media_effects: dict[str, float] = field(default_factory=dict)

    @classmethod
    def from_definition(cls, definition: EventDefinition) -> "ActiveEvent":
        return cls(
            definition_id=definition.id,
            name=definition.name,
            type=definition.type,
            escalation_level=1,
            remaining_turns=definition.duration,
            escalation_chance=definition.escalation_chance,
            max_escalation=definition.max_escalation,
            city_effects=dict(definition.city_effects),
            group_effects=[dict(effect) for effect in definition.group_effects],
            media_effects=dict(definition.media_effects),
        )

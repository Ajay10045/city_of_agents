from __future__ import annotations

import json
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any

from events.event import ActiveEvent, EventDefinition

if TYPE_CHECKING:
    from core.game_state import GameState


def _clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


@dataclass
class EventStepResult:
    triggered_events: list[str] = field(default_factory=list)
    escalated_events: list[str] = field(default_factory=list)
    city_changes: dict[str, float] = field(default_factory=dict)
    group_effects: list[dict[str, Any]] = field(default_factory=list)
    media_effects: dict[str, float] = field(default_factory=dict)
    event_chances: dict[str, float] = field(default_factory=dict)


class EventEngine:
    def __init__(self, config_path: str | Path) -> None:
        payload = json.loads(Path(config_path).read_text(encoding="utf-8"))
        self._definitions = [EventDefinition.from_dict(item) for item in payload.get("events", [])]
        if not self._definitions:
            raise ValueError("Events config must include at least one event")

    @staticmethod
    def event_chance(
        base_risk: float,
        social_tension: float,
        corruption: float,
        avg_radicalization: float,
        law_and_order: float,
        public_trust: float,
    ) -> float:
        chance = (
            base_risk
            + social_tension * 0.3
            + corruption * 0.2
            + avg_radicalization * 0.2
            - law_and_order * 0.25
            - public_trust * 0.15
        )
        return _clamp(chance, 0.0, 1.0)

    @staticmethod
    def _conditions_match(definition: EventDefinition, game_state: "GameState", avg_rad: float) -> bool:
        stats = game_state.city_stats
        lookup = {
            "economy": stats.economy,
            "employment": stats.employment,
            "law_and_order": stats.law_and_order,
            "infrastructure": stats.infrastructure,
            "environment": stats.environment,
            "corruption": stats.corruption,
            "social_tension": stats.social_tension,
            "media_freedom": stats.media_freedom,
            "public_trust": stats.public_trust,
            "avg_radicalization": avg_rad,
        }

        for key, threshold in definition.conditions.items():
            if key.endswith("_min"):
                base = key[:-4]
                if lookup.get(base, 0.0) < threshold:
                    return False
            elif key.endswith("_max"):
                base = key[:-4]
                if lookup.get(base, 0.0) > threshold:
                    return False

        return True

    @staticmethod
    def _scale_group_effect(effect: dict[str, Any], scale: float) -> dict[str, Any]:
        scaled = dict(effect)
        for key in ("happiness", "alignment", "radicalization", "trust_in_government"):
            if key in scaled:
                scaled[key] = float(scaled[key]) * scale
        return scaled

    def step(self, game_state: "GameState") -> EventStepResult:
        game_state.tick_cooldowns()

        avg_radicalization = game_state.average_agent_field("radicalization")
        stats_norm = game_state.city_stats.normalized()

        result = EventStepResult()

        active_ids = {event.definition_id for event in game_state.active_events}
        newly_triggered: set[str] = set()

        for definition in self._definitions:
            if game_state.turn_number < definition.min_turn:
                continue
            if definition.id in game_state.event_cooldowns:
                continue
            if definition.id in active_ids:
                continue
            if not self._conditions_match(definition, game_state, avg_radicalization):
                continue

            chance = self.event_chance(
                base_risk=definition.base_risk,
                social_tension=stats_norm["social_tension"],
                corruption=stats_norm["corruption"],
                avg_radicalization=avg_radicalization / 100.0,
                law_and_order=stats_norm["law_and_order"],
                public_trust=stats_norm["public_trust"],
            )
            previous_turn = game_state.turn_number - 1
            recent_triggers = 0
            if previous_turn >= 1:
                prefix = f"Turn {previous_turn}: Triggered "
                recent_triggers = sum(
                    1 for item in game_state.event_history[-10:] if isinstance(item, str) and item.startswith(prefix)
                )
            active_pressure = len(game_state.active_events)
            cadence_damp = 1.0 / (1.0 + active_pressure * 0.45 + recent_triggers * 0.35)
            if game_state.turn_number <= 3:
                cadence_damp *= 0.85
            chance = _clamp(chance * cadence_damp, 0.0, 1.0)
            result.event_chances[definition.name] = chance

            if game_state.rng.random() <= chance:
                game_state.active_events.append(ActiveEvent.from_definition(definition))
                game_state.event_cooldowns[definition.id] = definition.cooldown
                result.triggered_events.append(definition.name)
                game_state.event_history.append(
                    f"Turn {game_state.turn_number}: Triggered {definition.name}"
                )
                newly_triggered.add(definition.id)

        merged_city_changes: dict[str, float] = defaultdict(float)
        merged_group_effects: list[dict[str, Any]] = []
        merged_media_effects: dict[str, float] = defaultdict(float)

        remaining_active: list[ActiveEvent] = []
        for active in game_state.active_events:
            if active.definition_id not in newly_triggered:
                escalation_boost = game_state.city_stats.social_tension / 450.0
                escalation_roll = active.escalation_chance + escalation_boost
                if (
                    active.escalation_level < active.max_escalation
                    and game_state.rng.random() <= escalation_roll
                ):
                    active.escalation_level += 1
                    result.escalated_events.append(active.name)

            scale = 0.82 + (active.escalation_level - 1) * 0.22
            scaled_city_effects = {
                key: float(value) * scale for key, value in active.city_effects.items()
            }
            city_changes = game_state.city_stats.apply_delta(scaled_city_effects)
            for key, value in city_changes.items():
                merged_city_changes[key] += value

            for effect in active.group_effects:
                merged_group_effects.append(self._scale_group_effect(effect, scale))

            for key, value in active.media_effects.items():
                merged_media_effects[key] += float(value) * scale

            active.remaining_turns -= 1
            if active.remaining_turns > 0:
                remaining_active.append(active)

        game_state.active_events = remaining_active

        result.city_changes = dict(merged_city_changes)
        result.group_effects = merged_group_effects
        result.media_effects = dict(merged_media_effects)
        return result

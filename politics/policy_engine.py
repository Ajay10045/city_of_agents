from __future__ import annotations

import json
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any, Mapping

from core.game_state import TimedEffect

if TYPE_CHECKING:
    import random

    from core.game_state import GameState


def _clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


@dataclass
class PolicyDefinition:
    id: str
    actor: str
    name: str
    weight: float
    effects: dict[str, float]
    long_term_effects: list[dict[str, Any]] = field(default_factory=list)
    group_effects: list[dict[str, Any]] = field(default_factory=list)
    campaign_strength: float = 1.0
    media_effects: dict[str, float] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "PolicyDefinition":
        return cls(
            id=str(payload["id"]),
            actor=str(payload["actor"]),
            name=str(payload["name"]),
            weight=float(payload.get("weight", 1.0)),
            effects={str(k): float(v) for k, v in payload.get("effects", {}).items()},
            long_term_effects=[dict(item) for item in payload.get("long_term_effects", [])],
            group_effects=[dict(item) for item in payload.get("group_effects", [])],
            campaign_strength=float(payload.get("campaign_strength", 1.0)),
            media_effects={
                str(k): float(v) for k, v in payload.get("media_effects", {}).items()
            },
        )


@dataclass
class ActionResolution:
    policy: PolicyDefinition
    immediate_changes: dict[str, float]
    group_effects: list[dict[str, Any]]
    campaign_strength: float
    media_effects: dict[str, float]


@dataclass
class LongTermResolution:
    city_changes: dict[str, float]
    group_effects: list[dict[str, Any]]


class PolicyEngine:
    def __init__(self, config_path: str | Path) -> None:
        payload = json.loads(Path(config_path).read_text(encoding="utf-8"))
        policies = [PolicyDefinition.from_dict(item) for item in payload.get("policies", [])]

        self._policies_by_actor: dict[str, list[PolicyDefinition]] = {"mayor": [], "opposition": []}
        for policy in policies:
            self._policies_by_actor.setdefault(policy.actor, []).append(policy)

        if not self._policies_by_actor.get("mayor") or not self._policies_by_actor.get("opposition"):
            raise ValueError("Policies config must include both mayor and opposition actions")

    @staticmethod
    def _weighted_choice(
        rng: "random.Random",
        options: list[PolicyDefinition],
        weights: list[float],
    ) -> PolicyDefinition:
        total = sum(max(0.0, weight) for weight in weights)
        if total <= 0:
            return rng.choice(options)

        pick = rng.uniform(0.0, total)
        cumulative = 0.0
        for option, weight in zip(options, weights):
            cumulative += max(0.0, weight)
            if pick <= cumulative:
                return option
        return options[-1]

    @staticmethod
    def _policy_utility(actor: str, policy: PolicyDefinition, game_state: "GameState") -> float:
        effects = policy.effects
        tension = game_state.city_stats.social_tension
        trust = game_state.city_stats.public_trust

        if actor == "mayor":
            utility = (
                effects.get("economy", 0.0) * 0.05
                + effects.get("employment", 0.0) * 0.04
                + effects.get("public_trust", 0.0) * 0.07
                + effects.get("law_and_order", 0.0) * 0.04
                - effects.get("corruption", 0.0) * 0.06
                - effects.get("social_tension", 0.0) * 0.06
            )
            if tension > 60.0:
                utility -= max(0.0, effects.get("social_tension", 0.0)) * 0.05
                utility += max(0.0, effects.get("law_and_order", 0.0)) * 0.03
            if trust < 45.0:
                utility += effects.get("public_trust", 0.0) * 0.05
        else:
            utility = (
                -effects.get("public_trust", 0.0) * 0.07
                -effects.get("law_and_order", 0.0) * 0.03
                + effects.get("media_freedom", 0.0) * 0.05
                + effects.get("social_tension", 0.0) * 0.03
                + effects.get("corruption", 0.0) * 0.04
            )
            if tension > 65.0:
                utility -= max(0.0, effects.get("social_tension", 0.0)) * 0.08
                utility += max(0.0, -effects.get("social_tension", 0.0)) * 0.04
            if trust < 35.0:
                utility -= max(0.0, -effects.get("public_trust", 0.0)) * 0.06
                utility += max(0.0, effects.get("public_trust", 0.0)) * 0.05

        return _clamp(utility, -0.7, 0.7)

    def get_mayor_policies(self) -> list[PolicyDefinition]:
        return list(self._policies_by_actor.get("mayor", []))

    def get_policy_by_id(self, policy_id: str) -> PolicyDefinition:
        for policies in self._policies_by_actor.values():
            for policy in policies:
                if policy.id == policy_id:
                    return policy
        raise ValueError(f"No policy found with id: {policy_id!r}")

    def choose_action(
        self,
        actor: str,
        rng: "random.Random",
        game_state: "GameState" | None = None,
    ) -> PolicyDefinition:
        options = self._policies_by_actor.get(actor, [])
        if not options:
            raise ValueError(f"No policies configured for actor: {actor}")

        if game_state is None:
            return self._weighted_choice(rng, options, [option.weight for option in options])

        dynamic_weights: list[float] = []
        for option in options:
            utility = self._policy_utility(actor, option, game_state)
            dynamic_weights.append(max(0.05, option.weight * (1.0 + utility)))

        return self._weighted_choice(rng, options, dynamic_weights)

    def apply_dynamic_action(
        self,
        game_state: "GameState",
        policy: "Any",
        *,
        apply_city_effects: bool = True,
    ) -> ActionResolution:
        """Apply a DynamicPolicy (LLM-generated) to the game state."""
        immediate_changes = (
            game_state.city_stats.apply_delta(policy.effects)
            if apply_city_effects
            else {}
        )

        current = game_state.campaign_strength.get(policy.actor, 1.0)
        game_state.campaign_strength[policy.actor] = _clamp(
            current * 0.9 + policy.campaign_strength * 0.1,
            0.6,
            1.8,
        )

        game_state.policy_history.append(f"Turn {game_state.turn_number}: {policy.actor} -> {policy.name}")

        # Build a stub PolicyDefinition-like object for ActionResolution
        stub = PolicyDefinition(
            id=policy.id,
            actor=policy.actor,
            name=policy.name,
            weight=1.0,
            effects=policy.effects,
            group_effects=policy.group_effects,
            campaign_strength=policy.campaign_strength,
            media_effects=policy.media_effects,
        )
        return ActionResolution(
            policy=stub,
            immediate_changes=immediate_changes,
            group_effects=list(policy.group_effects),
            campaign_strength=policy.campaign_strength,
            media_effects=dict(policy.media_effects),
        )

    def apply_action(self, game_state: "GameState", policy: PolicyDefinition) -> ActionResolution:
        immediate_changes = game_state.city_stats.apply_delta(policy.effects)

        for effect in policy.long_term_effects:
            game_state.long_term_effects.append(
                TimedEffect(
                    source_id=policy.id,
                    actor=policy.actor,
                    remaining_turns=int(effect.get("duration", 1)),
                    city_effects={
                        str(k): float(v) for k, v in effect.get("city_effects", {}).items()
                    },
                    group_effects=[dict(item) for item in effect.get("group_effects", [])],
                )
            )

        current = game_state.campaign_strength.get(policy.actor, 1.0)
        game_state.campaign_strength[policy.actor] = _clamp(
            current * 0.9 + policy.campaign_strength * 0.1,
            0.6,
            1.8,
        )

        game_state.policy_history.append(f"Turn {game_state.turn_number}: {policy.actor} -> {policy.name}")

        return ActionResolution(
            policy=policy,
            immediate_changes=immediate_changes,
            group_effects=[dict(item) for item in policy.group_effects],
            campaign_strength=policy.campaign_strength,
            media_effects=dict(policy.media_effects),
        )

    def apply_long_term_effects(self, game_state: "GameState") -> LongTermResolution:
        merged_city_changes: dict[str, float] = defaultdict(float)
        merged_group_effects: list[dict[str, Any]] = []
        remaining_effects: list[TimedEffect] = []

        for timed in game_state.long_term_effects:
            city_changes = game_state.city_stats.apply_delta(timed.city_effects)
            for key, value in city_changes.items():
                merged_city_changes[key] += value
            merged_group_effects.extend([dict(item) for item in timed.group_effects])

            timed.remaining_turns -= 1
            if timed.remaining_turns > 0:
                remaining_effects.append(timed)

        game_state.long_term_effects = remaining_effects
        return LongTermResolution(city_changes=dict(merged_city_changes), group_effects=merged_group_effects)

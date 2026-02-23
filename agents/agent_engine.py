from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Mapping

from agents.agent import Agent, AgentIdentity
from agents.identity_group import IdentityGroup
from agents.relationship import Relationship
from core.city_stats import STAT_DIRECTION, SUB_METRICS, PILLAR_FOR_STAT

if TYPE_CHECKING:
    import random
    from core.game_state import GameState


@dataclass(frozen=True)
class RoleProfile:
    base_wealth: float
    base_health: float
    base_safety: float
    base_social: float
    sentiment_weight: float


ROLE_PROFILES: dict[str, RoleProfile] = {
    "Worker": RoleProfile(base_wealth=38.0, base_health=45.0, base_safety=42.0, base_social=40.0, sentiment_weight=1.15),
    "BusinessOwner": RoleProfile(base_wealth=72.0, base_health=55.0, base_safety=50.0, base_social=48.0, sentiment_weight=0.95),
    "Politician": RoleProfile(base_wealth=58.0, base_health=50.0, base_safety=55.0, base_social=60.0, sentiment_weight=0.9),
    "Journalist": RoleProfile(base_wealth=48.0, base_health=48.0, base_safety=45.0, base_social=62.0, sentiment_weight=1.05),
    "Student": RoleProfile(base_wealth=30.0, base_health=52.0, base_safety=48.0, base_social=58.0, sentiment_weight=1.2),
}

DEFAULT_ROLE_DISTRIBUTION: dict[str, float] = {
    "Worker": 0.34,
    "BusinessOwner": 0.15,
    "Politician": 0.08,
    "Journalist": 0.12,
    "Student": 0.31,
}

DEFAULT_ROLE_ISSUE_WEIGHTS: dict[str, float] = {
    "treasury_balance": 1.0,
    "employment_rate": 1.0,
    "avg_wage": 1.0,
    "hospital_capacity": 0.8,
    "pollution_levels": 0.7,
    "food_supply": 0.8,
    "police_coverage": 0.9,
    "recidivism_rate": 0.8,
    "lighting_level": 0.7,
    "park_density": 0.6,
    "connectivity": 0.7,
    "media_access": 0.6,
}

ROLE_ISSUE_WEIGHTS: dict[str, dict[str, float]] = {
    "Worker": {
        "treasury_balance": 1.1,
        "employment_rate": 1.4,
        "avg_wage": 1.35,
        "hospital_capacity": 0.9,
        "pollution_levels": 0.85,
        "food_supply": 0.95,
        "police_coverage": 0.9,
        "recidivism_rate": 0.8,
        "lighting_level": 0.85,
        "park_density": 0.6,
        "connectivity": 0.65,
        "media_access": 0.55,
    },
    "BusinessOwner": {
        "treasury_balance": 1.35,
        "employment_rate": 1.1,
        "avg_wage": 1.0,
        "hospital_capacity": 0.75,
        "pollution_levels": 0.6,
        "food_supply": 0.7,
        "police_coverage": 1.1,
        "recidivism_rate": 1.0,
        "lighting_level": 1.0,
        "park_density": 0.5,
        "connectivity": 0.8,
        "media_access": 0.7,
    },
    "Politician": {
        "treasury_balance": 1.2,
        "employment_rate": 1.0,
        "avg_wage": 0.9,
        "hospital_capacity": 0.9,
        "pollution_levels": 0.7,
        "food_supply": 0.85,
        "police_coverage": 1.15,
        "recidivism_rate": 1.1,
        "lighting_level": 1.0,
        "park_density": 0.75,
        "connectivity": 0.85,
        "media_access": 0.9,
    },
    "Journalist": {
        "treasury_balance": 0.8,
        "employment_rate": 0.75,
        "avg_wage": 0.8,
        "hospital_capacity": 0.9,
        "pollution_levels": 1.0,
        "food_supply": 0.85,
        "police_coverage": 0.9,
        "recidivism_rate": 0.95,
        "lighting_level": 0.8,
        "park_density": 0.85,
        "connectivity": 1.1,
        "media_access": 1.4,
    },
    "Student": {
        "treasury_balance": 0.8,
        "employment_rate": 0.9,
        "avg_wage": 0.85,
        "hospital_capacity": 1.0,
        "pollution_levels": 1.05,
        "food_supply": 1.0,
        "police_coverage": 0.9,
        "recidivism_rate": 0.85,
        "lighting_level": 0.95,
        "park_density": 1.1,
        "connectivity": 1.15,
        "media_access": 1.0,
    },
}

FRONT_BY_STAT: dict[str, str] = {
    "treasury_balance": "economy",
    "employment_rate": "economy",
    "avg_wage": "economy",
    "hospital_capacity": "health",
    "pollution_levels": "health",
    "food_supply": "health",
    "police_coverage": "safety",
    "recidivism_rate": "safety",
    "lighting_level": "safety",
    "park_density": "social_cohesion",
    "connectivity": "social_cohesion",
    "media_access": "social_cohesion",
}


def _normalize_distribution(dist: Mapping[str, float], keys: list[str]) -> dict[str, float]:
    base = {key: max(0.0, float(dist.get(key, 0.0))) for key in keys}
    total = sum(base.values())
    if total <= 0.0:
        fallback = 1.0 / len(keys)
        return {key: fallback for key in keys}
    return {key: value / total for key, value in base.items()}


def _clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


class AgentEngine:
    def __init__(self) -> None:
        self._adjacency: dict[int, list[tuple[int, float]]] = {}

    def initialize_population(
        self,
        identity_groups: list[IdentityGroup],
        rng: "random.Random",
        role_distribution: Mapping[str, float] | None = None,
        representatives_per_cell: int = 5,
        target_agent_count: int | None = None,
    ) -> tuple[list[Agent], list[Relationship]]:
        roles = list(ROLE_PROFILES)
        role_dist = _normalize_distribution(role_distribution or DEFAULT_ROLE_DISTRIBUTION, roles)

        agents: list[Agent] = []
        next_id = 1
        total_cells = len(identity_groups) * len(roles)
        per_cell: list[int] = []
        if target_agent_count is not None and target_agent_count > 0 and total_cells > 0:
            base = target_agent_count // total_cells
            remainder = target_agent_count % total_cells
            for idx in range(total_cells):
                per_cell.append(base + (1 if idx < remainder else 0))
        else:
            per_cell = [representatives_per_cell for _ in range(total_cells)]

        cell_index = 0
        for group in identity_groups:
            for role in roles:
                role_share = role_dist[role]
                profile = ROLE_PROFILES[role]
                reps = per_cell[cell_index]
                cell_index += 1
                if reps <= 0:
                    continue
                for _ in range(reps):
                    wealth = _clamp(
                        profile.base_wealth * group.economic_modifier + rng.uniform(-8.0, 8.0),
                        0.0,
                        100.0,
                    )
                    health = _clamp(
                        profile.base_health - group.grievance_score * 12.0 + rng.uniform(-6.0, 6.0),
                        0.0,
                        100.0,
                    )
                    safety = _clamp(
                        profile.base_safety - group.grievance_score * 10.0 + rng.uniform(-7.0, 7.0),
                        0.0,
                        100.0,
                    )
                    social = _clamp(
                        profile.base_social * group.education_modifier + rng.uniform(-6.0, 6.0),
                        0.0,
                        100.0,
                    )
                    population_weight = group.population_percent * role_share / reps

                    agents.append(
                        Agent(
                            id=next_id,
                            role=role,
                            wealth=wealth,
                            health=health,
                            safety=safety,
                            social=social,
                            identity=AgentIdentity(
                                religion=group.religion,
                                caste=group.caste,
                                language=group.language,
                            ),
                            group_id=group.id,
                            population_weight=population_weight,
                        )
                    )
                    next_id += 1

        total_weight = sum(agent.population_weight for agent in agents)
        if total_weight > 0:
            for agent in agents:
                agent.population_weight /= total_weight

        relationships = self._generate_relationships(agents, rng)
        self._adjacency = self._build_adjacency(relationships)
        return agents, relationships

    def _generate_relationships(
        self,
        agents: list[Agent],
        rng: "random.Random",
        local_degree: int = 3,
        cross_degree: int = 1,
    ) -> list[Relationship]:
        by_group: dict[str, list[int]] = {}
        for agent in agents:
            by_group.setdefault(agent.group_id, []).append(agent.id)

        group_ids = list(by_group)
        cross_group_lookup = {
            gid: [other_gid for other_gid in group_ids if other_gid != gid] for gid in group_ids
        }

        relationships: list[Relationship] = []
        for agent in agents:
            same_group = by_group[agent.group_id]
            local_targets: set[int] = set()
            attempts = 0
            max_attempts = max(4, local_degree * 4)
            while len(local_targets) < local_degree and attempts < max_attempts and len(same_group) > 1:
                attempts += 1
                target_id = rng.choice(same_group)
                if target_id == agent.id or target_id in local_targets:
                    continue
                local_targets.add(target_id)

            for target_id in local_targets:
                relationships.append(
                    Relationship(
                        agent_id=agent.id,
                        target_agent_id=target_id,
                        strength=rng.uniform(30.0, 95.0),
                    )
                )

            cross_groups = cross_group_lookup.get(agent.group_id, [])
            cross_targets: set[int] = set()
            attempts = 0
            max_attempts = max(4, cross_degree * 5)
            while len(cross_targets) < cross_degree and attempts < max_attempts and cross_groups:
                attempts += 1
                target_group = rng.choice(cross_groups)
                members = by_group.get(target_group, [])
                if not members:
                    continue
                target_id = rng.choice(members)
                if target_id in cross_targets:
                    continue
                cross_targets.add(target_id)

            for target_id in cross_targets:
                relationships.append(
                    Relationship(
                        agent_id=agent.id,
                        target_agent_id=target_id,
                        strength=rng.uniform(10.0, 60.0),
                    )
                )

        return relationships

    @staticmethod
    def _build_adjacency(relationships: list[Relationship]) -> dict[int, list[tuple[int, float]]]:
        adjacency: dict[int, list[tuple[int, float]]] = {}
        for rel in relationships:
            adjacency.setdefault(rel.agent_id, []).append((rel.target_agent_id, rel.strength))
        return adjacency

    def apply_group_effects(self, agents: list[Agent], effects: list[dict[str, Any]]) -> None:
        if not effects:
            return

        for effect in effects:
            match = effect.get("match", {})
            wealth_delta = float(effect.get("wealth", 0.0))
            health_delta = float(effect.get("health", 0.0))
            safety_delta = float(effect.get("safety", 0.0))
            social_delta = float(effect.get("social", 0.0))

            for agent in agents:
                if match and not agent.identity.matches(match):
                    continue
                agent.wealth += wealth_delta
                agent.health += health_delta
                agent.safety += safety_delta
                agent.social += social_delta
                agent.clamp_state()

    @staticmethod
    def _group_sensitivity(group: IdentityGroup, stat: str) -> float:
        if stat in group.issue_sensitivity:
            return group.issue_sensitivity[stat]
        # Fall back to pillar-level sensitivity if sub-metric not found
        pillar = PILLAR_FOR_STAT.get(stat)
        if pillar and pillar in group.issue_sensitivity:
            return group.issue_sensitivity[pillar]
        return 1.0

    @staticmethod
    def _identity_match_signal(agent: Agent, effects: list[dict[str, Any]]) -> float:
        signal = 0.0
        for effect in effects:
            match = effect.get("match", {})
            if match and not agent.identity.matches(match):
                continue
            signal += float(effect.get("wealth", 0.0)) * 0.4
            signal += float(effect.get("health", 0.0)) * 0.3
            signal += float(effect.get("safety", 0.0)) * 0.35
            signal += float(effect.get("social", 0.0)) * 0.25
        return signal

    def apply_policy_impact_pass(
        self,
        game_state: "GameState",
        mayor_effects: Mapping[str, float],
        opposition_effects: Mapping[str, float],
        mayor_group_effects: list[dict[str, Any]],
        opposition_group_effects: list[dict[str, Any]],
        rumor_pressure: float,
    ) -> dict[str, Any]:
        if not game_state.agents:
            game_state.cohort_metrics = {}
            game_state.last_agent_impact = {}
            return {"agent_count_evaluated": 0, "llm_panel_count": 0, "dominant_fronts": []}

        if not self._adjacency:
            self._adjacency = self._build_adjacency(game_state.relationships)

        profile = game_state.simulation_profile
        randomness_scale = _clamp(float(profile.get("randomness_scale", 0.1)), 0.0, 1.0)
        llm_panel_count = int(max(0, profile.get("llm_panel_size", 0)))

        net_effects: dict[str, float] = {}
        for stat in STAT_DIRECTION:
            net_effects[stat] = float(mayor_effects.get(stat, 0.0)) + float(opposition_effects.get(stat, 0.0))

        front_scores: dict[str, float] = {}
        for stat, value in net_effects.items():
            front = FRONT_BY_STAT.get(stat, stat)
            front_scores[front] = front_scores.get(front, 0.0) + value * STAT_DIRECTION.get(stat, 1)
        dominant_fronts = [
            key for key, _ in sorted(front_scores.items(), key=lambda item: abs(item[1]), reverse=True)[:3]
        ]

        cohort_noise: dict[str, float] = {}
        turn_shock = game_state.rng.uniform(-1.0, 1.0) * randomness_scale * 0.6
        satisfaction_snapshot = {agent.id: agent.overall_satisfaction() for agent in game_state.agents}

        total_wealth_delta = 0.0
        total_health_delta = 0.0
        total_safety_delta = 0.0
        total_social_delta = 0.0
        total_weight = 0.0

        cohort_rollup: dict[str, dict[str, float]] = {}
        stats = game_state.city_stats
        media = game_state.media_state
        pillar_scores = stats.pillar_scores()

        combined_group_effects = list(mayor_group_effects) + list(opposition_group_effects)

        for agent in game_state.agents:
            group = game_state.identity_groups[agent.group_id]
            role_weights = ROLE_ISSUE_WEIGHTS.get(agent.role, DEFAULT_ROLE_ISSUE_WEIGHTS)

            stat_signal = 0.0
            relevance = 0.0
            for stat, net in net_effects.items():
                role_weight = role_weights.get(stat, DEFAULT_ROLE_ISSUE_WEIGHTS.get(stat, 1.0))
                sensitivity = self._group_sensitivity(group, stat)
                direction = STAT_DIRECTION.get(stat, 1)
                stat_signal += net * direction * role_weight * sensitivity
                relevance += abs(net) * role_weight

            identity_signal = self._identity_match_signal(agent, combined_group_effects)
            need_match = max(0.0, (50.0 - agent.overall_satisfaction()) / 100.0)
            local_context = (
                (pillar_scores.get("safety", 50) - 50.0) / 100.0 * 0.4
                + (pillar_scores.get("social", 50) - 50.0) / 100.0 * 0.3
                - group.grievance_score * 0.35
            )

            media_signal = (
                (media.bias / 50.0) * 0.45
                - (media.sensationalism / 100.0) * 0.3
                + (media.trust / 100.0) * 0.2
                - rumor_pressure * 0.55
            )

            neighbor_signal = 0.0
            neighbors = self._adjacency.get(agent.id, [])
            if neighbors:
                total_strength = sum(strength for _, strength in neighbors)
                if total_strength > 0:
                    neighbor_satisfaction = sum(
                        satisfaction_snapshot[target] * strength for target, strength in neighbors
                    ) / total_strength
                    neighbor_signal = ((neighbor_satisfaction - satisfaction_snapshot[agent.id]) / 100.0) * 0.55

            cohort_key = f"{agent.group_id}:{agent.role}"
            if cohort_key not in cohort_noise:
                cohort_noise[cohort_key] = game_state.rng.uniform(-1.0, 1.0) * randomness_scale * 0.8
            agent_noise = game_state.rng.uniform(-1.0, 1.0) * randomness_scale

            relevance_scale = _clamp(0.55 + relevance * 0.12, 0.55, 1.45)
            combined = (
                stat_signal * 0.085
                + identity_signal * 0.03
                + need_match * 0.85
                + local_context * 0.9
                + media_signal * 0.7
                + neighbor_signal
                + cohort_noise[cohort_key]
                + agent_noise
                + turn_shock
            ) * relevance_scale

            wealth_delta = _clamp(combined * 1.5 + stat_signal * 0.04, -4.5, 4.5)
            health_delta = _clamp(combined * 1.2, -3.5, 3.5)
            safety_delta = _clamp(combined * 1.3 + local_context * 0.6, -3.5, 3.5)
            social_delta = _clamp(combined * 1.4 + media_signal * 0.3, -4.0, 4.0)

            agent.wealth += wealth_delta
            agent.health += health_delta
            agent.safety += safety_delta
            agent.social += social_delta
            agent.clamp_state()

            weight = agent.population_weight
            total_weight += weight
            total_wealth_delta += wealth_delta * weight
            total_health_delta += health_delta * weight
            total_safety_delta += safety_delta * weight
            total_social_delta += social_delta * weight

            cohort_entry = cohort_rollup.setdefault(
                cohort_key,
                {
                    "group_id": agent.group_id,
                    "role": agent.role,
                    "population": 0.0,
                    "wealth_delta": 0.0,
                    "health_delta": 0.0,
                    "safety_delta": 0.0,
                    "social_delta": 0.0,
                    "narrative_shift_delta": 0.0,
                },
            )
            cohort_entry["population"] += weight
            cohort_entry["wealth_delta"] += wealth_delta * weight
            cohort_entry["health_delta"] += health_delta * weight
            cohort_entry["safety_delta"] += safety_delta * weight
            cohort_entry["social_delta"] += social_delta * weight
            cohort_entry["narrative_shift_delta"] += (media_signal + identity_signal * 0.05) * weight

        for cohort in cohort_rollup.values():
            pop = cohort["population"]
            if pop <= 0:
                continue
            cohort["wealth_delta"] /= pop
            cohort["health_delta"] /= pop
            cohort["safety_delta"] /= pop
            cohort["social_delta"] /= pop
            cohort["narrative_shift_delta"] /= pop

        game_state.cohort_metrics = {
            key: {
                "group_id": value["group_id"],
                "role": value["role"],
                "population": round(value["population"], 6),
                "wealth_delta": round(value["wealth_delta"], 4),
                "health_delta": round(value["health_delta"], 4),
                "safety_delta": round(value["safety_delta"], 4),
                "social_delta": round(value["social_delta"], 4),
                "narrative_shift_delta": round(value["narrative_shift_delta"], 4),
            }
            for key, value in cohort_rollup.items()
        }

        top_cohorts = sorted(
            game_state.cohort_metrics.items(),
            key=lambda item: abs(item[1]["narrative_shift_delta"]),
            reverse=True,
        )[:5]

        summary = {
            "agent_count_evaluated": len(game_state.agents),
            "llm_panel_count": min(len(game_state.agents), llm_panel_count),
            "llm_panel_coverage_ratio": round(
                min(len(game_state.agents), llm_panel_count) / max(1, len(game_state.agents)), 4
            ),
            "avg_wealth_delta": round(total_wealth_delta / max(total_weight, 1e-9), 4),
            "avg_health_delta": round(total_health_delta / max(total_weight, 1e-9), 4),
            "avg_safety_delta": round(total_safety_delta / max(total_weight, 1e-9), 4),
            "avg_social_delta": round(total_social_delta / max(total_weight, 1e-9), 4),
            "dominant_fronts": dominant_fronts,
            "top_cohorts": [
                {"cohort_id": key, **value}
                for key, value in top_cohorts
            ],
        }
        game_state.last_agent_impact = summary
        return summary

    @staticmethod
    def weighted_average(agents: list[Agent], attr: str) -> float:
        total_weight = sum(agent.population_weight for agent in agents)
        if total_weight <= 0:
            return 0.0
        return sum(getattr(agent, attr) * agent.population_weight for agent in agents) / total_weight

    @staticmethod
    def group_metrics(agents: list[Agent]) -> dict[str, dict[str, float]]:
        metrics: dict[str, dict[str, float]] = {}
        for agent in agents:
            group = metrics.setdefault(
                agent.group_id,
                {
                    "population": 0.0,
                    "wealth": 0.0,
                    "health": 0.0,
                    "safety": 0.0,
                    "social": 0.0,
                },
            )
            weight = agent.population_weight
            group["population"] += weight
            group["wealth"] += agent.wealth * weight
            group["health"] += agent.health * weight
            group["safety"] += agent.safety * weight
            group["social"] += agent.social * weight

        for group in metrics.values():
            population = group["population"]
            if population <= 0:
                continue
            group["wealth"] /= population
            group["health"] /= population
            group["safety"] /= population
            group["social"] /= population

        return metrics

    def recalculate_popularity(
        self,
        game_state: "GameState",
        media_modifiers: tuple[float, float],
    ) -> tuple[float, float]:
        mayor_media_mod, opposition_media_mod = media_modifiers
        mayor_score = 0.0
        opposition_score = 0.0

        pillar_scores = game_state.city_stats.pillar_scores()
        safety_preference = _clamp(
            (pillar_scores.get("safety", 50) - 50.0) / 100.0,
            -0.25,
            0.25,
        )
        social_balance = _clamp(
            (pillar_scores.get("social", 50) - 50.0) / 100.0,
            -0.25,
            0.25,
        )

        for agent in game_state.agents:
            weight = agent.population_weight
            satisfaction = agent.overall_satisfaction() / 100.0  # 0-1
            mayor_pref = satisfaction * 0.6 + 0.2  # Higher satisfaction -> more mayor support
            opposition_pref = 1.0 - mayor_pref

            engagement = 0.6 + satisfaction * 0.4

            mayor_score += weight * mayor_pref * engagement * mayor_media_mod
            opposition_score += (
                weight
                * opposition_pref
                * engagement
                * opposition_media_mod
            )

        average_satisfaction = self.weighted_average(game_state.agents, "wealth")
        # Use average satisfaction as a proxy for overall citizen contentment
        avg_overall = sum(a.overall_satisfaction() * a.population_weight for a in game_state.agents)
        total_w = sum(a.population_weight for a in game_state.agents)
        if total_w > 0:
            avg_overall /= total_w
        opposition_grievance_boost = _clamp((50.0 - avg_overall) / 100.0, 0.0, 0.2)

        mayor_score *= (
            1.0
            + max(0.0, safety_preference) * 0.18
            + max(0.0, social_balance) * 0.14
        )
        opposition_score *= (
            1.0
            + max(0.0, -safety_preference) * 0.12
            + max(0.0, -social_balance) * 0.16
            + opposition_grievance_boost
        )

        total = mayor_score + opposition_score
        if total <= 0:
            return 50.0, 50.0

        mayor_popularity = (mayor_score / total) * 100.0
        opposition_popularity = (opposition_score / total) * 100.0
        return mayor_popularity, opposition_popularity

    def recalculate_citizen_pillars(self, game_state: "GameState") -> None:
        """Blend each citizen's pillar values toward the city's pillar scores.

        Group economic_modifier amplifies/dampens the city's pull on that group.
        """
        pillar_scores = game_state.city_stats.pillar_scores()
        city_wealth = pillar_scores.get("wealth", 50.0)
        city_health = pillar_scores.get("health", 50.0)
        city_safety = pillar_scores.get("safety", 50.0)
        city_social = pillar_scores.get("social", 50.0)

        for agent in game_state.agents:
            group = game_state.identity_groups[agent.group_id]
            econ_mod = group.economic_modifier

            agent.wealth = _clamp(agent.wealth * 0.7 + city_wealth * 0.3 * econ_mod, 0.0, 100.0)
            agent.health = _clamp(agent.health * 0.7 + city_health * 0.3, 0.0, 100.0)
            agent.safety = _clamp(agent.safety * 0.7 + city_safety * 0.3, 0.0, 100.0)
            agent.social = _clamp(
                agent.social * 0.7 + city_social * 0.3 * group.education_modifier,
                0.0,
                100.0,
            )

    @staticmethod
    def apply_citizen_feedback(game_state: "GameState") -> dict[str, float]:
        """Small city stat drift based on average citizen pillar scores.

        Returns the deltas applied. All deltas capped at +/-0.5 per turn.
        """
        agents = game_state.agents
        if not agents:
            return {}

        total_weight = sum(a.population_weight for a in agents)
        if total_weight <= 0:
            return {}

        avg_wealth = sum(a.wealth * a.population_weight for a in agents) / total_weight
        avg_health = sum(a.health * a.population_weight for a in agents) / total_weight
        avg_safety = sum(a.safety * a.population_weight for a in agents) / total_weight
        avg_social = sum(a.social * a.population_weight for a in agents) / total_weight

        deltas: dict[str, float] = {}

        # Low citizen wealth → employment and wages drift down
        if avg_wealth < 45.0:
            deltas["employment_rate"] = _clamp((avg_wealth - 45.0) / 100.0, -0.5, 0.0)
            deltas["avg_wage"] = _clamp((avg_wealth - 45.0) / 120.0, -0.4, 0.0)
        elif avg_wealth > 60.0:
            deltas["employment_rate"] = _clamp((avg_wealth - 60.0) / 150.0, 0.0, 0.3)

        # Low citizen health → hospital_capacity drifts down (demand pressure)
        if avg_health < 45.0:
            deltas["hospital_capacity"] = _clamp((avg_health - 45.0) / 120.0, -0.4, 0.0)

        # Low citizen safety → recidivism drifts up
        if avg_safety < 45.0:
            deltas["recidivism_rate"] = _clamp((45.0 - avg_safety) / 100.0, 0.0, 0.5)
        elif avg_safety > 60.0:
            deltas["recidivism_rate"] = _clamp((60.0 - avg_safety) / 150.0, -0.3, 0.0)

        # High citizen social → connectivity drifts up
        if avg_social > 55.0:
            deltas["connectivity"] = _clamp((avg_social - 55.0) / 150.0, 0.0, 0.3)
            deltas["park_density"] = _clamp((avg_social - 55.0) / 200.0, 0.0, 0.2)
        elif avg_social < 40.0:
            deltas["media_access"] = _clamp((avg_social - 40.0) / 120.0, -0.4, 0.0)

        if deltas:
            game_state.city_stats.apply_delta(deltas)
        return deltas

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Mapping

from agents.agent import Agent, AgentIdentity
from agents.identity_group import IdentityGroup
from agents.relationship import Relationship

if TYPE_CHECKING:
    import random
    from core.game_state import GameState


@dataclass(frozen=True)
class RoleProfile:
    base_wealth: float
    base_influence: float
    sentiment_weight: float


ROLE_PROFILES: dict[str, RoleProfile] = {
    "Worker": RoleProfile(base_wealth=38.0, base_influence=28.0, sentiment_weight=1.15),
    "BusinessOwner": RoleProfile(base_wealth=72.0, base_influence=63.0, sentiment_weight=0.95),
    "Politician": RoleProfile(base_wealth=58.0, base_influence=82.0, sentiment_weight=0.9),
    "Journalist": RoleProfile(base_wealth=48.0, base_influence=68.0, sentiment_weight=1.05),
    "Student": RoleProfile(base_wealth=30.0, base_influence=40.0, sentiment_weight=1.2),
}

DEFAULT_ROLE_DISTRIBUTION: dict[str, float] = {
    "Worker": 0.34,
    "BusinessOwner": 0.15,
    "Politician": 0.08,
    "Journalist": 0.12,
    "Student": 0.31,
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
    ) -> tuple[list[Agent], list[Relationship]]:
        roles = list(ROLE_PROFILES)
        role_dist = _normalize_distribution(role_distribution or DEFAULT_ROLE_DISTRIBUTION, roles)

        agents: list[Agent] = []
        next_id = 1

        for group in identity_groups:
            for role in roles:
                role_share = role_dist[role]
                profile = ROLE_PROFILES[role]
                for _ in range(representatives_per_cell):
                    wealth = _clamp(
                        profile.base_wealth * group.economic_modifier + rng.uniform(-8.0, 8.0),
                        0.0,
                        100.0,
                    )
                    influence = _clamp(
                        profile.base_influence * (0.7 + 0.6 * group.education_modifier)
                        + rng.uniform(-6.0, 6.0),
                        0.0,
                        100.0,
                    )
                    happiness = _clamp(
                        52.0
                        + (group.economic_modifier - 1.0) * 16.0
                        - group.grievance_score * 18.0
                        + rng.uniform(-7.0, 7.0),
                        0.0,
                        100.0,
                    )
                    trust = _clamp(
                        46.0
                        + group.education_modifier * 7.0
                        - group.grievance_score * 10.0
                        + rng.uniform(-6.0, 6.0),
                        0.0,
                        100.0,
                    )
                    radicalization = _clamp(
                        22.0 + group.grievance_score * 30.0 + rng.uniform(-8.0, 8.0),
                        0.0,
                        100.0,
                    )
                    alignment = _clamp((happiness - 50.0) * 1.1 + rng.uniform(-20.0, 20.0), -100.0, 100.0)
                    population_weight = group.population_percent * role_share / representatives_per_cell

                    agents.append(
                        Agent(
                            id=next_id,
                            role=role,
                            wealth=wealth,
                            influence=influence,
                            radicalization=radicalization,
                            alignment=alignment,
                            happiness=happiness,
                            trust_in_government=trust,
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

        all_ids = [agent.id for agent in agents]
        id_to_group = {agent.id: agent.group_id for agent in agents}

        relationships: list[Relationship] = []
        for agent in agents:
            same_group = [aid for aid in by_group[agent.group_id] if aid != agent.id]
            for target_id in rng.sample(same_group, k=min(local_degree, len(same_group))):
                relationships.append(
                    Relationship(
                        agent_id=agent.id,
                        target_agent_id=target_id,
                        strength=rng.uniform(30.0, 95.0),
                    )
                )

            cross_group = [aid for aid in all_ids if aid != agent.id and id_to_group[aid] != agent.group_id]
            for target_id in rng.sample(cross_group, k=min(cross_degree, len(cross_group))):
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
            happiness_delta = float(effect.get("happiness", 0.0))
            radicalization_delta = float(effect.get("radicalization", 0.0))
            alignment_delta = float(effect.get("alignment", 0.0))
            trust_delta = float(effect.get("trust_in_government", 0.0))

            for agent in agents:
                if match and not agent.identity.matches(match):
                    continue
                agent.happiness += happiness_delta
                agent.radicalization += radicalization_delta
                agent.alignment += alignment_delta
                agent.trust_in_government += trust_delta
                agent.clamp_state()

    def update_happiness(
        self,
        game_state: "GameState",
        group_effects: list[dict[str, Any]],
        rumor_pressure: float,
    ) -> None:
        stats = game_state.city_stats

        economy_signal = ((stats.economy + stats.employment) / 2.0 - 50.0) / 50.0
        safety_signal = (stats.law_and_order - stats.social_tension) / 100.0
        governance_signal = (stats.public_trust - stats.corruption) / 100.0
        corruption_signal = (stats.corruption - 50.0) / 50.0
        tension_signal = (stats.social_tension - 50.0) / 50.0

        for agent in game_state.agents:
            group = game_state.identity_groups[agent.group_id]
            profile = ROLE_PROFILES.get(agent.role, RoleProfile(50.0, 50.0, 1.0))

            econ_sens = group.issue_sensitivity.get("economy", 1.0)
            order_sens = group.issue_sensitivity.get("law_and_order", 1.0)
            corr_sens = group.issue_sensitivity.get("corruption", 1.0)
            tension_sens = group.issue_sensitivity.get("social_tension", 1.0)
            trust_sens = group.issue_sensitivity.get("public_trust", 1.0)

            grievance_drag = max(0.0, tension_signal) * group.grievance_score * 3.2
            delta = (
                economy_signal * 3.8 * econ_sens
                + safety_signal * 3.4 * order_sens
                + governance_signal * 3.6 * trust_sens
                - max(0.0, corruption_signal) * 2.4 * corr_sens
                - max(0.0, tension_signal) * 3.0 * tension_sens
                - grievance_drag
                - rumor_pressure * 2.2
            ) * profile.sentiment_weight

            delta += (agent.wealth - 50.0) / 50.0 * 0.5
            delta += (55.0 - agent.happiness) * 0.06
            delta += game_state.rng.uniform(-1.0, 1.0)

            trust_delta = (
                governance_signal * 3.4
                - max(0.0, corruption_signal) * 2.0
                - rumor_pressure * 1.8
                + (agent.happiness - 50.0) / 50.0 * 0.9
                + (52.0 - agent.trust_in_government) * 0.04
                + game_state.rng.uniform(-0.6, 0.6)
            )

            agent.happiness += delta
            agent.trust_in_government += trust_delta
            agent.clamp_state()

        self.apply_group_effects(game_state.agents, group_effects)

    def update_radicalization(self, game_state: "GameState", rumor_pressure: float) -> None:
        stats = game_state.city_stats
        media = game_state.media_state

        for agent in game_state.agents:
            group = game_state.identity_groups[agent.group_id]

            baseline = 15.0 + group.grievance_score * 30.0
            pressure = (
                group.radicalization_base_rate
                + (stats.social_tension / 100.0) * 0.22
                + (stats.corruption / 100.0) * 0.15
                + (media.sensationalism / 100.0) * 0.12
                + max(0.0, (50.0 - agent.happiness) / 100.0) * 0.18
                + rumor_pressure * 0.2
            )
            stabilizer = (
                (stats.law_and_order / 100.0) * 0.2
                + (stats.public_trust / 100.0) * 0.18
                + (agent.trust_in_government / 100.0) * 0.1
            )

            mean_reversion = (baseline - agent.radicalization) * 0.12
            delta = (pressure - stabilizer) * 6.0 + mean_reversion + game_state.rng.uniform(-0.6, 0.6)
            agent.radicalization += delta
            agent.clamp_state()

    def propagate_alignment(
        self,
        game_state: "GameState",
        campaign_delta: float,
        rumor_pressure: float,
    ) -> None:
        if not self._adjacency:
            self._adjacency = self._build_adjacency(game_state.relationships)

        old_alignment = {agent.id: agent.alignment for agent in game_state.agents}

        for agent in game_state.agents:
            peer_signal = 0.0
            neighbors = self._adjacency.get(agent.id, [])
            if neighbors:
                total_strength = sum(strength for _, strength in neighbors)
                if total_strength > 0:
                    neighbor_alignment = sum(
                        old_alignment[target] * strength for target, strength in neighbors
                    ) / total_strength
                    peer_signal = ((neighbor_alignment - old_alignment[agent.id]) / 100.0) * 5.0

            trust_signal = (agent.trust_in_government - 50.0) / 50.0 * 4.2
            happiness_signal = (agent.happiness - 50.0) / 50.0 * 3.8
            radical_drag = (agent.radicalization - 50.0) / 50.0 * 3.6
            media_bias_signal = (game_state.media_state.bias / 50.0) * 2.4
            rumor_signal = -rumor_pressure * (0.4 + game_state.media_state.sensationalism / 200.0) * 1.2
            centering_signal = -agent.alignment * 0.08

            delta = (
                trust_signal
                + happiness_signal
                - radical_drag
                + peer_signal
                + campaign_delta * 2.0
                + media_bias_signal
                + rumor_signal
                + centering_signal
                + game_state.rng.uniform(-1.2, 1.2)
            )

            agent.alignment += delta
            agent.clamp_state()

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
                    "happiness": 0.0,
                    "alignment": 0.0,
                    "radicalization": 0.0,
                },
            )
            weight = agent.population_weight
            group["population"] += weight
            group["happiness"] += agent.happiness * weight
            group["alignment"] += agent.alignment * weight
            group["radicalization"] += agent.radicalization * weight

        for group in metrics.values():
            population = group["population"]
            if population <= 0:
                continue
            group["happiness"] /= population
            group["alignment"] /= population
            group["radicalization"] /= population

        return metrics

    def recalculate_popularity(
        self,
        game_state: "GameState",
        media_modifiers: tuple[float, float],
    ) -> tuple[float, float]:
        mayor_media_mod, opposition_media_mod = media_modifiers
        mayor_score = 0.0
        opposition_score = 0.0
        security_preference = _clamp(
            (game_state.city_stats.law_and_order - game_state.city_stats.social_tension) / 100.0,
            -0.25,
            0.25,
        )
        governance_balance = _clamp(
            (game_state.city_stats.public_trust - game_state.city_stats.corruption) / 100.0,
            -0.25,
            0.25,
        )

        for agent in game_state.agents:
            weight = agent.population_weight
            mayor_pref = (agent.alignment + 100.0) / 200.0
            opposition_pref = 1.0 - mayor_pref

            engagement = 0.6 + (agent.happiness / 100.0) * 0.2 + (agent.influence / 100.0) * 0.2
            protest_tilt = max(0.0, agent.radicalization - 55.0) / 100.0 * 0.08

            mayor_score += weight * mayor_pref * engagement * mayor_media_mod
            opposition_score += (
                weight
                * opposition_pref
                * (engagement + protest_tilt)
                * opposition_media_mod
            )

        average_happiness = self.weighted_average(game_state.agents, "happiness")
        opposition_grievance_boost = _clamp((50.0 - average_happiness) / 100.0, 0.0, 0.2)

        mayor_score *= (
            1.0
            + max(0.0, security_preference) * 0.18
            + max(0.0, governance_balance) * 0.14
        )
        opposition_score *= (
            1.0
            + max(0.0, -security_preference) * 0.12
            + max(0.0, -governance_balance) * 0.16
            + opposition_grievance_boost
        )

        total = mayor_score + opposition_score
        if total <= 0:
            return 50.0, 50.0

        mayor_popularity = (mayor_score / total) * 100.0
        opposition_popularity = (opposition_score / total) * 100.0
        return mayor_popularity, opposition_popularity

from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor, TimeoutError
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from llm.dynamic_policy import DynamicPolicy
from llm.llm_client import LLMClient

if TYPE_CHECKING:
    from agents.agent import Agent
    from core.game_state import GameState

_FRONT_BY_STAT: dict[str, str] = {
    "economy": "economy",
    "employment": "economy",
    "infrastructure": "economy",
    "environment": "services",
    "law_and_order": "safety",
    "corruption": "corruption",
    "social_tension": "social_cohesion",
    "media_freedom": "public_trust",
    "public_trust": "public_trust",
}

_STAT_DIRECTION: dict[str, float] = {
    "economy": 1.0,
    "employment": 1.0,
    "law_and_order": 1.0,
    "infrastructure": 1.0,
    "environment": 1.0,
    "corruption": -1.0,
    "social_tension": -1.0,
    "media_freedom": 1.0,
    "public_trust": 1.0,
}

_SYSTEM = """You are simulating one citizen's reaction in a political city simulation turn.
Return JSON ONLY with exactly these numeric fields:
- happiness_delta
- trust_delta
- radicalization_delta
- alignment_delta

Rules:
- Base your values on the provided city state, policy duel context, and this agent profile.
- Output realistic bounded deltas; avoid extreme jumps.
- Do not include explanations, markdown, or extra keys.
"""


@dataclass(frozen=True)
class AgentTurnDelta:
    happiness_delta: float
    trust_delta: float
    radicalization_delta: float
    alignment_delta: float


class AgentReactionError(RuntimeError):
    pass


class AgentReactionEngine:
    def __init__(self) -> None:
        model = os.environ.get("LLM_MODEL", "gpt-4o")
        self._client: LLMClient | None
        try:
            self._client = LLMClient(model=model)
        except Exception:
            self._client = None

        key = (
            os.environ.get("LLM_API_KEY")
            or os.environ.get("OPENAI_API_KEY")
            or os.environ.get("ANTHROPIC_API_KEY")
            or ""
        )
        self._disable_live = key.startswith("test-")
        self._max_workers = 3
        self._request_timeout_seconds = max(
            1.0,
            float(os.environ.get("AGENT_REACTION_TIMEOUT_SECONDS", "8.0")),
        )

    @staticmethod
    def _clamp(value: float, lower: float, upper: float) -> float:
        return max(lower, min(upper, value))

    @staticmethod
    def _to_float(value: Any) -> float:
        try:
            out = float(value)
        except (TypeError, ValueError) as exc:
            raise AgentReactionError(f"Non-numeric delta value: {value!r}") from exc
        if not (out == out and abs(out) != float("inf")):
            raise AgentReactionError(f"Invalid numeric delta value: {value!r}")
        return out

    @classmethod
    def _parse_delta(cls, payload: dict[str, Any]) -> AgentTurnDelta:
        required = {
            "happiness_delta",
            "trust_delta",
            "radicalization_delta",
            "alignment_delta",
        }
        missing = [key for key in required if key not in payload]
        if missing:
            raise AgentReactionError(f"Missing reaction fields: {', '.join(sorted(missing))}")

        return AgentTurnDelta(
            happiness_delta=cls._clamp(cls._to_float(payload["happiness_delta"]), -5.0, 5.0),
            trust_delta=cls._clamp(cls._to_float(payload["trust_delta"]), -5.0, 5.0),
            radicalization_delta=cls._clamp(cls._to_float(payload["radicalization_delta"]), -4.0, 4.0),
            alignment_delta=cls._clamp(cls._to_float(payload["alignment_delta"]), -6.0, 6.0),
        )

    @staticmethod
    def _agent_prompt(
        agent: "Agent",
        game_state: "GameState",
        mayor_action: DynamicPolicy,
        opposition_action: DynamicPolicy,
        rumor_pressure: float,
        group_effects: list[dict[str, Any]],
    ) -> str:
        stats = game_state.city_stats
        relevant_group_effects: list[dict[str, Any]] = []
        for effect in group_effects:
            match = effect.get("match") or {}
            if isinstance(match, dict) and match and not agent.identity.matches(match):
                continue
            relevant_group_effects.append(effect)

        return (
            f"Turn {game_state.turn_number + 1}/{game_state.total_turns}. "
            f"Mayor popularity={game_state.mayor_popularity:.1f}, opposition popularity={game_state.opposition_popularity:.1f}.\n"
            f"City stats: economy={stats.economy:.1f}, employment={stats.employment:.1f}, law_and_order={stats.law_and_order:.1f}, "
            f"infrastructure={stats.infrastructure:.1f}, environment={stats.environment:.1f}, corruption={stats.corruption:.1f}, "
            f"social_tension={stats.social_tension:.1f}, media_freedom={stats.media_freedom:.1f}, public_trust={stats.public_trust:.1f}.\n"
            f"Rumor pressure={rumor_pressure:.3f}.\n"
            f"Mayor action: {mayor_action.name} | {mayor_action.description} | effects={mayor_action.effects}.\n"
            f"Opposition action: {opposition_action.name} | {opposition_action.description} | effects={opposition_action.effects}.\n"
            f"Agent profile: role={agent.role}, group_id={agent.group_id}, wealth={agent.wealth:.1f}, influence={agent.influence:.1f}, "
            f"happiness={agent.happiness:.1f}, trust_in_government={agent.trust_in_government:.1f}, "
            f"radicalization={agent.radicalization:.1f}, alignment={agent.alignment:.1f}, "
            f"identity={agent.identity.caste}/{agent.identity.religion}/{agent.identity.language}.\n"
            f"Matched group_effects={relevant_group_effects}."
        )

    def _evaluate_agent(
        self,
        agent: "Agent",
        game_state: "GameState",
        mayor_action: DynamicPolicy,
        opposition_action: DynamicPolicy,
        rumor_pressure: float,
        group_effects: list[dict[str, Any]],
    ) -> AgentTurnDelta:
        if self._client is None or self._disable_live:
            raise AgentReactionError("LLM provider unavailable for agent reaction evaluation")

        user = self._agent_prompt(
            agent=agent,
            game_state=game_state,
            mayor_action=mayor_action,
            opposition_action=opposition_action,
            rumor_pressure=rumor_pressure,
            group_effects=group_effects,
        )
        payload = self._client.chat(_SYSTEM, user)
        return self._parse_delta(payload)

    @staticmethod
    def _dominant_fronts(
        mayor_action: DynamicPolicy,
        opposition_action: DynamicPolicy,
    ) -> list[str]:
        front_scores: dict[str, float] = {}
        combined_effects: dict[str, float] = {}
        for stat_key in set(mayor_action.effects) | set(opposition_action.effects):
            combined_effects[stat_key] = float(mayor_action.effects.get(stat_key, 0.0)) + float(
                opposition_action.effects.get(stat_key, 0.0)
            )
        for stat_key, value in combined_effects.items():
            front = _FRONT_BY_STAT.get(stat_key, stat_key)
            front_scores[front] = front_scores.get(front, 0.0) + value * _STAT_DIRECTION.get(stat_key, 1.0)
        return [
            key
            for key, _ in sorted(front_scores.items(), key=lambda item: abs(item[1]), reverse=True)[:3]
        ]

    def apply_turn_reactions(
        self,
        game_state: "GameState",
        mayor_action: DynamicPolicy,
        opposition_action: DynamicPolicy,
        rumor_pressure: float,
        group_effects: list[dict[str, Any]],
    ) -> dict[str, Any]:
        if not game_state.agents:
            game_state.cohort_metrics = {}
            game_state.last_agent_impact = {}
            return {
                "agent_count_evaluated": 0,
                "llm_panel_count": 0,
                "llm_panel_coverage_ratio": 0.0,
                "avg_happiness_delta": 0.0,
                "avg_radicalization_delta": 0.0,
                "avg_alignment_delta": 0.0,
                "avg_trust_delta": 0.0,
                "dominant_fronts": [],
                "top_cohorts": [],
            }

        if self._client is None or self._disable_live:
            raise AgentReactionError("LLM provider unavailable for agent reaction evaluation")

        deltas_by_agent_id: dict[int, AgentTurnDelta] = {}
        with ThreadPoolExecutor(max_workers=self._max_workers) as executor:
            futures = {
                executor.submit(
                    self._evaluate_agent,
                    agent,
                    game_state,
                    mayor_action,
                    opposition_action,
                    rumor_pressure,
                    group_effects,
                ): agent
                for agent in game_state.agents
            }
            try:
                for future, agent in futures.items():
                    deltas_by_agent_id[agent.id] = future.result(timeout=self._request_timeout_seconds)
            except TimeoutError as exc:
                for future in futures:
                    future.cancel()
                raise AgentReactionError("Timed out while evaluating per-agent LLM reactions") from exc
            except Exception as exc:
                for future in futures:
                    future.cancel()
                if isinstance(exc, AgentReactionError):
                    raise
                raise AgentReactionError(f"Per-agent LLM reaction failed: {exc}") from exc

        total_weight = 0.0
        total_happiness_delta = 0.0
        total_radicalization_delta = 0.0
        total_alignment_delta = 0.0
        total_trust_delta = 0.0

        cohort_rollup: dict[str, dict[str, float | str]] = {}
        for agent in game_state.agents:
            delta = deltas_by_agent_id[agent.id]

            agent.happiness += delta.happiness_delta
            agent.trust_in_government += delta.trust_delta
            agent.radicalization += delta.radicalization_delta
            agent.alignment += delta.alignment_delta
            agent.clamp_state()

            weight = float(agent.population_weight)
            total_weight += weight
            total_happiness_delta += delta.happiness_delta * weight
            total_radicalization_delta += delta.radicalization_delta * weight
            total_alignment_delta += delta.alignment_delta * weight
            total_trust_delta += delta.trust_delta * weight

            cohort_key = f"{agent.group_id}:{agent.role}"
            cohort = cohort_rollup.setdefault(
                cohort_key,
                {
                    "group_id": agent.group_id,
                    "role": agent.role,
                    "population": 0.0,
                    "happiness_delta": 0.0,
                    "radicalization_delta": 0.0,
                    "alignment_delta": 0.0,
                    "trust_delta": 0.0,
                    "narrative_shift_delta": 0.0,
                },
            )
            cohort["population"] = float(cohort["population"]) + weight
            cohort["happiness_delta"] = float(cohort["happiness_delta"]) + delta.happiness_delta * weight
            cohort["radicalization_delta"] = float(cohort["radicalization_delta"]) + delta.radicalization_delta * weight
            cohort["alignment_delta"] = float(cohort["alignment_delta"]) + delta.alignment_delta * weight
            cohort["trust_delta"] = float(cohort["trust_delta"]) + delta.trust_delta * weight
            cohort["narrative_shift_delta"] = float(cohort["narrative_shift_delta"]) + (
                delta.alignment_delta * 0.35 + delta.trust_delta * 0.45 - delta.radicalization_delta * 0.25
            ) * weight

        for cohort in cohort_rollup.values():
            population = float(cohort["population"])
            if population <= 0:
                continue
            cohort["happiness_delta"] = float(cohort["happiness_delta"]) / population
            cohort["radicalization_delta"] = float(cohort["radicalization_delta"]) / population
            cohort["alignment_delta"] = float(cohort["alignment_delta"]) / population
            cohort["trust_delta"] = float(cohort["trust_delta"]) / population
            cohort["narrative_shift_delta"] = float(cohort["narrative_shift_delta"]) / population

        game_state.cohort_metrics = {
            key: {
                "group_id": str(value["group_id"]),
                "role": str(value["role"]),
                "population": round(float(value["population"]), 6),
                "happiness_delta": round(float(value["happiness_delta"]), 4),
                "radicalization_delta": round(float(value["radicalization_delta"]), 4),
                "alignment_delta": round(float(value["alignment_delta"]), 4),
                "trust_delta": round(float(value["trust_delta"]), 4),
                "narrative_shift_delta": round(float(value["narrative_shift_delta"]), 4),
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
            "llm_panel_count": len(game_state.agents),
            "llm_panel_coverage_ratio": 1.0,
            "avg_happiness_delta": round(total_happiness_delta / max(total_weight, 1e-9), 4),
            "avg_radicalization_delta": round(total_radicalization_delta / max(total_weight, 1e-9), 4),
            "avg_alignment_delta": round(total_alignment_delta / max(total_weight, 1e-9), 4),
            "avg_trust_delta": round(total_trust_delta / max(total_weight, 1e-9), 4),
            "dominant_fronts": self._dominant_fronts(mayor_action, opposition_action),
            "top_cohorts": [{"cohort_id": key, **value} for key, value in top_cohorts],
        }
        game_state.last_agent_impact = summary
        return summary

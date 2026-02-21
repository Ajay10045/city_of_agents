from __future__ import annotations

import time

import pytest

from llm.agent_reaction_engine import AgentReactionEngine, AgentReactionError, AgentTurnDelta
from llm.dynamic_policy import DynamicPolicy
from server import _build_game, _create_session


def _policy(name: str, effects: dict[str, float]) -> DynamicPolicy:
    return DynamicPolicy.from_llm(
        {
            "name": name,
            "description": f"{name} description",
            "rationale": f"{name} rationale",
            "why_now": f"{name} why now",
            "effects": effects,
            "group_effects": [],
            "campaign_strength": 1.05,
            "media_effects": {},
        },
        actor="mayor",
    )


def _normalize_weights(game_state) -> None:
    if not game_state.agents:
        return
    total = sum(agent.population_weight for agent in game_state.agents)
    for agent in game_state.agents:
        agent.population_weight /= total


def test_parse_delta_clamps_values() -> None:
    delta = AgentReactionEngine._parse_delta(
        {
            "happiness_delta": 999,
            "trust_delta": -999,
            "radicalization_delta": 999,
            "alignment_delta": -999,
        }
    )

    assert delta.happiness_delta == 5.0
    assert delta.trust_delta == -5.0
    assert delta.radicalization_delta == 4.0
    assert delta.alignment_delta == -6.0


def test_parse_delta_rejects_missing_fields() -> None:
    with pytest.raises(AgentReactionError):
        AgentReactionEngine._parse_delta(
            {
                "happiness_delta": 0.1,
                "trust_delta": 0.2,
                "alignment_delta": 0.3,
            }
        )


def test_apply_turn_reactions_preserves_agent_mapping_under_parallelism(monkeypatch: pytest.MonkeyPatch) -> None:
    turn_manager, _ = _build_game(
        seed=404,
        turns=5,
        election_turn=5,
        simulation_profile={"agent_count": 12, "api_version": "v1", "city_id": "new_delhi"},
    )
    game_state = turn_manager.game_state
    game_state.agents = game_state.agents[:4]
    _normalize_weights(game_state)

    engine = AgentReactionEngine()
    engine._client = object()
    engine._disable_live = False

    baseline_happiness = {agent.id: agent.happiness for agent in game_state.agents}

    def fake_evaluate(
        agent,
        game_state,
        mayor_action,
        opposition_action,
        rumor_pressure,
        group_effects,
    ) -> AgentTurnDelta:
        time.sleep(0.01 * (agent.id % 3))
        delta = round(agent.id / 100.0, 4)
        return AgentTurnDelta(
            happiness_delta=delta,
            trust_delta=0.2,
            radicalization_delta=-0.1,
            alignment_delta=0.3,
        )

    monkeypatch.setattr(engine, "_evaluate_agent", fake_evaluate)

    mayor_action = _policy("Mayor Plan", {"economy": 1.0, "employment": 0.6})
    opposition_action = _policy("Opposition Plan", {"social_tension": 0.5, "public_trust": -0.4})

    summary = engine.apply_turn_reactions(
        game_state=game_state,
        mayor_action=mayor_action,
        opposition_action=opposition_action,
        rumor_pressure=0.15,
        group_effects=[],
    )

    assert summary["agent_count_evaluated"] == 4
    assert summary["llm_panel_count"] == 4
    assert summary["llm_panel_coverage_ratio"] == 1.0

    for agent in game_state.agents:
        expected_delta = round(agent.id / 100.0, 4)
        actual_delta = round(agent.happiness - baseline_happiness[agent.id], 4)
        assert actual_delta == expected_delta


def test_step_rolls_back_on_llm_agent_reaction_failure() -> None:
    session = _create_session(
        seed=510,
        turns=6,
        election_turn=6,
        setup={"api_version": "v1", "city_id": "new_delhi", "agent_count": 12},
    )
    turn_manager = session.turn_manager
    policies = turn_manager.get_mayor_options()
    assert policies

    class _FailingReactionEngine:
        def apply_turn_reactions(self, **kwargs):
            raise RuntimeError("forced llm failure")

    turn_manager.agent_reaction_engine = _FailingReactionEngine()
    before = turn_manager.game_state.snapshot()

    result = turn_manager.step(policies[0].id)

    assert "error" in result
    assert "Turn aborted" in result["error"]
    assert turn_manager.game_state.snapshot() == before

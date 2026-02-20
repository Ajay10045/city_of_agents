from __future__ import annotations

import random
from pathlib import Path

from agents.agent_engine import AgentEngine
from main import build_game_state, load_identity_config


ROOT = Path(__file__).resolve().parents[1]
CONFIG_DIR = ROOT / "config"


def _build_seeded_state(seed: int = 77):
    game_state, agent_engine = build_game_state(
        seed=seed,
        turns=20,
        election_turn=10,
        identities_path=CONFIG_DIR / "identities.json",
    )
    game_state.simulation_profile = {
        "agent_count": len(game_state.agents),
        "llm_panel_size": 40,
        "randomness_scale": 0.14,
    }
    return game_state, agent_engine


def _example_policy_payloads():
    mayor_effects = {
        "economy": 2.4,
        "employment": 3.0,
        "public_trust": 1.3,
        "corruption": -1.2,
    }
    opposition_effects = {
        "social_tension": 1.4,
        "public_trust": -1.0,
        "media_freedom": 0.6,
    }
    mayor_group_effects = [
        {"match": {"religion": "River Faith"}, "happiness": 1.6, "trust_in_government": 1.2},
    ]
    opposition_group_effects = [
        {"match": {"caste": "Merchant Network"}, "happiness": -1.1, "radicalization": 1.0},
    ]
    return mayor_effects, opposition_effects, mayor_group_effects, opposition_group_effects


def test_apply_policy_impact_pass_updates_agents_and_cohorts() -> None:
    game_state, agent_engine = _build_seeded_state(seed=91)
    before_h = AgentEngine.weighted_average(game_state.agents, "happiness")
    before_r = AgentEngine.weighted_average(game_state.agents, "radicalization")
    before_a = AgentEngine.weighted_average(game_state.agents, "alignment")

    mayor_effects, opposition_effects, mayor_group_effects, opposition_group_effects = (
        _example_policy_payloads()
    )
    summary = agent_engine.apply_policy_impact_pass(
        game_state=game_state,
        mayor_effects=mayor_effects,
        opposition_effects=opposition_effects,
        mayor_group_effects=mayor_group_effects,
        opposition_group_effects=opposition_group_effects,
        rumor_pressure=0.23,
    )

    after_h = AgentEngine.weighted_average(game_state.agents, "happiness")
    after_r = AgentEngine.weighted_average(game_state.agents, "radicalization")
    after_a = AgentEngine.weighted_average(game_state.agents, "alignment")

    assert summary["agent_count_evaluated"] == len(game_state.agents)
    assert summary["llm_panel_count"] == 40
    assert summary["dominant_fronts"], "impact summary should report dominant fronts"
    assert game_state.cohort_metrics, "cohort metrics should be populated"
    assert game_state.last_agent_impact == summary
    assert before_h != after_h or before_r != after_r or before_a != after_a


def test_apply_policy_impact_pass_is_seed_reproducible() -> None:
    state_a, engine_a = _build_seeded_state(seed=303)
    state_b, engine_b = _build_seeded_state(seed=303)
    payloads = _example_policy_payloads()

    summary_a = engine_a.apply_policy_impact_pass(
        game_state=state_a,
        mayor_effects=payloads[0],
        opposition_effects=payloads[1],
        mayor_group_effects=payloads[2],
        opposition_group_effects=payloads[3],
        rumor_pressure=0.19,
    )
    summary_b = engine_b.apply_policy_impact_pass(
        game_state=state_b,
        mayor_effects=payloads[0],
        opposition_effects=payloads[1],
        mayor_group_effects=payloads[2],
        opposition_group_effects=payloads[3],
        rumor_pressure=0.19,
    )

    assert summary_a == summary_b
    assert state_a.cohort_metrics == state_b.cohort_metrics


def test_initialize_population_respects_target_agent_count() -> None:
    groups, role_distribution, _ = load_identity_config(CONFIG_DIR / "identities.json")
    engine = AgentEngine()
    agents, relationships = engine.initialize_population(
        identity_groups=groups,
        rng=random.Random(42),
        role_distribution=role_distribution,
        target_agent_count=1200,
    )

    assert len(agents) == 1200
    assert relationships
    assert abs(sum(agent.population_weight for agent in agents) - 1.0) < 1e-9

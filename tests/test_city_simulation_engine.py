from __future__ import annotations

from core.city_simulation_engine import CitySimulationEngine
from llm.dynamic_policy import DynamicPolicy
from server import _create_session


def _average_completion(delivery_report: dict) -> float:
    targets = list(delivery_report.get("targets", []))
    if not targets:
        return 0.0
    return sum(float(item.get("completion_ratio", 0.0)) for item in targets) / len(targets)


def test_dynamic_policy_infers_implementation_targets_when_missing() -> None:
    policy = DynamicPolicy.from_llm(
        {
            "name": "Ward Jobs Sprint",
            "description": "Launch neighborhood employment contracts and service upgrades.",
            "rationale": "Visible employment gains can lower anti-incumbent pressure.",
            "why_now": "Jobs pressure is the immediate city concern.",
            "effects": {"employment": 2.4, "public_trust": 1.1},
            "group_effects": [],
            "campaign_strength": 1.05,
            "media_effects": {},
        },
        actor="mayor",
    )
    assert policy.implementation_targets
    assert policy.implementation_targets[0]["proposed"] > 0


def test_delivery_simulation_penalizes_high_corruption() -> None:
    session_low = _create_session(
        seed=1001,
        turns=5,
        election_turn=5,
        setup={"api_version": "v1", "city_id": "new_delhi", "agent_count": 12},
    )
    session_high = _create_session(
        seed=1001,
        turns=5,
        election_turn=5,
        setup={"api_version": "v1", "city_id": "new_delhi", "agent_count": 12},
    )
    policy = session_low.turn_manager.get_mayor_options()[0]

    session_low.turn_manager.game_state.city_stats.corruption = 25.0
    session_high.turn_manager.game_state.city_stats.corruption = 82.0

    engine = CitySimulationEngine()
    low_report = engine.simulate_delivery(session_low.turn_manager.game_state, policy).to_dict()
    high_report = engine.simulate_delivery(session_high.turn_manager.game_state, policy).to_dict()

    assert _average_completion(low_report) > _average_completion(high_report)
    assert float(high_report.get("implementation_gap", 0.0)) >= float(
        low_report.get("implementation_gap", 0.0)
    )


def test_v1_step_returns_delivery_report_and_updates_state() -> None:
    session = _create_session(
        seed=1002,
        turns=5,
        election_turn=5,
        setup={"api_version": "v1", "city_id": "new_delhi", "agent_count": 12},
    )
    turn_manager = session.turn_manager
    policy = turn_manager.get_mayor_options()[0]

    class _StubAgentReactionEngine:
        @staticmethod
        def apply_turn_reactions(**kwargs):
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

    turn_manager.agent_reaction_engine = _StubAgentReactionEngine()
    result = turn_manager.step(policy.id)

    assert "error" not in result
    assert isinstance(result.get("delivery_report"), dict)
    state = result.get("state", {})
    assert isinstance(state.get("last_delivery_report"), dict)
    assert isinstance(state.get("delivery_history"), list)
    assert state.get("delivery_history")

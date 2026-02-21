from __future__ import annotations

from llm.citizen_debates import CitizenDebates, StreetChatterItem
from server import _create_session


def test_street_chatter_balanced_state_contains_sentiment_mix() -> None:
    session = _create_session(seed=404, turns=5, election_turn=5)
    tm = session.turn_manager
    game_state = tm.game_state

    mayor_action = tm.mayor_advisor.generate_options(game_state)[0]
    opposition_action = tm.opposition_agent.decide_action(game_state, mayor_action)

    chatter = tm.citizen_debates.generate_street_chatter(
        game_state=game_state,
        mayor_action=mayor_action,
        opp_action=opposition_action,
        triggered_events=[],
        limit=8,
    )
    assert len(chatter) >= 3

    positive = {"supportive", "hopeful"}
    assert any(item.sentiment in positive for item in chatter)
    assert any(item.sentiment not in positive for item in chatter)


def test_sentiment_mix_postprocess_skips_extreme_city_states() -> None:
    session = _create_session(seed=405, turns=5, election_turn=5)
    game_state = session.turn_manager.game_state
    game_state.city_stats.social_tension = 85.0
    game_state.city_stats.public_trust = 20.0

    raw = [
        StreetChatterItem(
            speaker="A",
            role="Worker",
            group_name="Citywide",
            line="everything is broken",
            sentiment="angry",
            heat=0.8,
            tags=["crisis"],
        ),
        StreetChatterItem(
            speaker="B",
            role="Student",
            group_name="Citywide",
            line="no one trusts this plan",
            sentiment="skeptical",
            heat=0.7,
            tags=["trust"],
        ),
    ]
    processed = CitizenDebates._ensure_sentiment_mix(raw, game_state)
    assert [item.sentiment for item in processed] == ["angry", "skeptical"]


from __future__ import annotations

from typing import Any

import simulation.session as session_mod
from simulation.session import GameSession
from tests.test_policy_advisor_stances import _build_state


class DummyLLM:
    pass


def _fake_policy_stream(*args: Any, **kwargs: Any):
    _ = (args, kwargs)
    yield {"type": "policies", "options": [{"name": "Stub Policy"}]}


def test_briefing_stream_emits_mayor_summary_between_snapshot_and_headlines(monkeypatch) -> None:
    session = GameSession(DummyLLM())
    session.state = _build_state()

    monkeypatch.setattr(
        session_mod,
        "generate_mayor_briefing_summary",
        lambda llm, state, elected_on_context: {
            "elected_on": "Elected to fix services and procurement discipline.",
            "people_like": "Commuters see faster travel times.",
            "people_dislike": "Housing affordability remains weak.",
            "media_like": "Neutral outlets praise execution dashboards.",
            "media_dislike": "Opposition channels allege uneven delivery.",
        },
    )
    monkeypatch.setattr(session_mod, "generate_situational_headlines", lambda *args, **kwargs: [])
    monkeypatch.setattr(session_mod, "generate_situational_chatter", lambda *args, **kwargs: [])
    monkeypatch.setattr(session_mod, "generate_policy_options_stream", _fake_policy_stream)

    events = list(session.generate_turn_briefing_stream())
    types = [event["type"] for event in events]

    assert "city_snapshot" in types
    assert "mayor_summary" in types
    assert "headlines" in types
    assert types.index("city_snapshot") < types.index("mayor_summary") < types.index("headlines")


def test_briefing_stream_continues_when_mayor_summary_fails(monkeypatch) -> None:
    session = GameSession(DummyLLM())
    session.state = _build_state()

    monkeypatch.setattr(session_mod, "generate_mayor_briefing_summary", lambda *args, **kwargs: None)
    monkeypatch.setattr(session_mod, "generate_situational_headlines", lambda *args, **kwargs: [])
    monkeypatch.setattr(session_mod, "generate_situational_chatter", lambda *args, **kwargs: [])
    monkeypatch.setattr(session_mod, "generate_policy_options_stream", _fake_policy_stream)

    events = list(session.generate_turn_briefing_stream())
    types = [event["type"] for event in events]

    assert "mayor_summary" not in types
    assert "headlines" in types
    assert "voices" in types
    assert "policies" in types
    assert "complete" in types


def test_briefing_stream_reuses_cached_mandate_across_turns(monkeypatch) -> None:
    session = GameSession(DummyLLM())
    session.state = _build_state()
    contexts: list[str | None] = []

    def _summary_with_context(llm, state, elected_on_context):
        _ = (llm, state)
        contexts.append(elected_on_context)
        if len(contexts) == 1:
            return {
                "elected_on": "Elected to restore basic services and accountability.",
                "people_like": "Households appreciate visible maintenance fixes.",
                "people_dislike": "Working poor still feel price pressure.",
                "media_like": "Mainstream desks note stable messaging.",
                "media_dislike": "Opposition papers call reforms too incremental.",
            }
        return {
            "elected_on": "Changed mandate text from model output.",
            "people_like": "Transit users report better reliability.",
            "people_dislike": "Renters still report stress.",
            "media_like": "Business media likes fiscal discipline.",
            "media_dislike": "Talk shows claim the pace is slow.",
        }

    monkeypatch.setattr(session_mod, "generate_mayor_briefing_summary", _summary_with_context)
    monkeypatch.setattr(session_mod, "generate_situational_headlines", lambda *args, **kwargs: [])
    monkeypatch.setattr(session_mod, "generate_situational_chatter", lambda *args, **kwargs: [])
    monkeypatch.setattr(session_mod, "generate_policy_options_stream", _fake_policy_stream)

    events_turn_1 = list(session.generate_turn_briefing_stream())
    mayor_1 = next(event for event in events_turn_1 if event["type"] == "mayor_summary")

    assert session.state is not None
    session.state.current_turn += 1

    events_turn_2 = list(session.generate_turn_briefing_stream())
    mayor_2 = next(event for event in events_turn_2 if event["type"] == "mayor_summary")

    assert contexts == [None, "Elected to restore basic services and accountability."]
    assert mayor_1["elected_on"] == "Elected to restore basic services and accountability."
    assert mayor_2["elected_on"] == "Elected to restore basic services and accountability."


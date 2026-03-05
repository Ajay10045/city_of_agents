from __future__ import annotations

import json

from simulation.llm_calls import generate_mayor_briefing_summary
from tests.test_policy_advisor_stances import _build_state


class StubLLM:
    def __init__(self, responses: list[str]) -> None:
        self.responses = responses
        self.calls: list[tuple[str, str]] = []

    def chat_text(self, system: str, user: str) -> str:
        self.calls.append((system, user))
        if not self.responses:
            raise AssertionError("Unexpected chat_text call")
        return self.responses.pop(0)


def test_generate_mayor_briefing_summary_returns_valid_payload() -> None:
    llm = StubLLM(
        [
            json.dumps(
                {
                    "elected_on": "Voters backed a services-first mandate.",
                    "people_like": "Commuters credit faster bus corridors.",
                    "people_dislike": "Renters still feel housing costs are out of control.",
                    "media_like": "Neutral desks praise visible delivery metrics.",
                    "media_dislike": "Opposition outlets attack procurement opacity.",
                }
            )
        ]
    )
    summary = generate_mayor_briefing_summary(llm, _build_state(), elected_on_context=None)
    assert summary is not None
    assert summary["elected_on"] == "Voters backed a services-first mandate."
    assert summary["people_like"] != ""
    assert summary["people_dislike"] != ""
    assert summary["media_like"] != ""
    assert summary["media_dislike"] != ""


def test_generate_mayor_briefing_summary_returns_none_on_invalid_json() -> None:
    llm = StubLLM(["not-json"])
    summary = generate_mayor_briefing_summary(llm, _build_state(), elected_on_context=None)
    assert summary is None


def test_generate_mayor_briefing_summary_locks_cached_mandate_context() -> None:
    cached_mandate = "You were elected to restore core services and clean up corruption."
    llm = StubLLM(
        [
            json.dumps(
                {
                    "elected_on": "Some other mandate text that should not pass through.",
                    "people_like": "Parents support school attendance gains.",
                    "people_dislike": "Small traders fear compliance burden.",
                    "media_like": "Civic outlets value transparent scorecards.",
                    "media_dislike": "Partisan tabloids call spending too cautious.",
                }
            )
        ]
    )

    summary = generate_mayor_briefing_summary(llm, _build_state(), elected_on_context=cached_mandate)
    assert summary is not None
    assert summary["elected_on"] == cached_mandate
    assert cached_mandate in llm.calls[0][1]
    assert summary["people_like"] == "Parents support school attendance gains."


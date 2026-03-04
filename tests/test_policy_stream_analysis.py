from __future__ import annotations

import time
from typing import Any

import simulation.llm_calls as llm_calls
from simulation.llm_calls import POLICY_REASONING_SYSTEM_STREAM, generate_policy_options_stream
from tests.test_policy_advisor_stances import _build_state


class ScriptedReasoningLLM:
    def __init__(self, scripts: list[list[str]], chunk_delay: float = 0.0) -> None:
        self.model = "stub-model"
        self.scripts = scripts
        self.chunk_delay = chunk_delay
        self.stream_calls: list[tuple[str, str]] = []

    def chat_text_stream(self, system: str, user: str):
        self.stream_calls.append((system, user))
        idx = len(self.stream_calls) - 1
        if idx < len(self.scripts):
            chunks = self.scripts[idx]
        elif self.scripts:
            chunks = self.scripts[-1]
        else:
            chunks = []
        for chunk in chunks:
            if self.chunk_delay > 0:
                time.sleep(self.chunk_delay)
            yield chunk


def _run_stream(
    monkeypatch: Any,
    *,
    scripts: list[list[str]],
    policy_delay: float,
    policy_options: list[dict[str, Any]] | None = None,
) -> tuple[ScriptedReasoningLLM, list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    state = _build_state()
    llm = ScriptedReasoningLLM(scripts=scripts, chunk_delay=0.01)
    opts = policy_options or [{"name": "Generated Option", "advisor_stances": []}]
    policy_calls: list[dict[str, Any]] = []

    def _fake_generate_policy_options(
        policy_llm: Any,
        inner_state: Any,
        consultation_transcript: str,
        available_budget: float,
    ) -> list[dict[str, Any]]:
        policy_calls.append(
            {
                "policy_llm": policy_llm,
                "state_id": id(inner_state),
                "transcript": consultation_transcript,
                "budget": available_budget,
            }
        )
        time.sleep(policy_delay)
        return opts

    monkeypatch.setattr(llm_calls, "generate_policy_options", _fake_generate_policy_options)
    events = list(generate_policy_options_stream(llm, state, consultation_transcript="", available_budget=600))
    thinking_events = [e for e in events if e["type"] == "thinking"]
    policy_events = [e for e in events if e["type"] == "policies"]
    return llm, policy_calls, thinking_events, policy_events


def test_policy_stream_emits_thinking_while_policy_future_pending(monkeypatch: Any) -> None:
    llm, policy_calls, thinking_events, policy_events = _run_stream(
        monkeypatch,
        scripts=[
            [
                "Transit is weak and demands immediate focus. ",
                "Cabinet execution risk is manageable with sequencing.",
            ]
        ],
        policy_delay=0.08,
    )

    assert llm.stream_calls
    assert llm.stream_calls[0][0] == POLICY_REASONING_SYSTEM_STREAM
    assert policy_calls and len(policy_calls) == 1
    assert len(thinking_events) >= 1
    assert policy_events and len(policy_events) == 1
    assert thinking_events[0]["chunk"].strip()


def test_policy_stream_runs_continuation_passes_until_policies_ready(monkeypatch: Any) -> None:
    llm, _, thinking_events, policy_events = _run_stream(
        monkeypatch,
        scripts=[
            ["First pass: immediate pressure is transit reliability. "],
            ["Second pass: budget trade-off could strain clinic staffing. "],
            ["Third pass: sequence implementation to reduce backlash."],
        ],
        policy_delay=0.25,
    )

    thinking = "".join(event["chunk"] for event in thinking_events)
    assert len(llm.stream_calls) >= 2
    assert "First pass" in thinking
    assert "Second pass" in thinking
    assert len(policy_events) == 1


def test_policy_stream_filters_json_like_reasoning_output(monkeypatch: Any) -> None:
    _, _, thinking_events, policy_events = _run_stream(
        monkeypatch,
        scripts=[
            ['Readable reasoning stays visible.\n{"name":"leak"}'],
            ["Follow-up reasoning without structured output."],
        ],
        policy_delay=0.15,
    )

    thinking = "".join(event["chunk"] for event in thinking_events)
    assert "Readable reasoning stays visible." in thinking
    assert "Follow-up reasoning" in thinking
    assert "{" not in thinking
    assert '"name"' not in thinking
    assert len(policy_events) == 1


def test_policy_stream_emits_single_policies_event_from_generator_result(monkeypatch: Any) -> None:
    expected_options = [
        {"name": "Option A", "advisor_stances": []},
        {"name": "Option B", "advisor_stances": []},
    ]
    _, policy_calls, _, policy_events = _run_stream(
        monkeypatch,
        scripts=[["Reasoning while backend drafts options."]],
        policy_delay=0.05,
        policy_options=expected_options,
    )

    assert len(policy_calls) == 1
    assert len(policy_events) == 1
    assert policy_events[0]["options"] == expected_options


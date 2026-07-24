from __future__ import annotations

import json
from typing import Any

from simulation.llm_calls import POLICY_DRAFT_SYSTEM_STREAM, generate_policy_options_stream
from tests.test_policy_advisor_stances import _build_state


class ScriptedPolicyStreamLLM:
    def __init__(self, scripts: list[list[str]]) -> None:
        self.model = "stub-model"
        self.scripts = scripts
        self.stream_calls: list[tuple[str, str]] = []
        self.repair_calls: list[tuple[str, str]] = []

    def chat_text_stream(self, system: str, user: str):
        self.stream_calls.append((system, user))
        idx = len(self.stream_calls) - 1
        chunks = self.scripts[idx] if idx < len(self.scripts) else []
        for chunk in chunks:
            yield chunk

    def chat_text(self, system: str, user: str) -> str:
        # Used only by advisor stance repair path.
        self.repair_calls.append((system, user))
        return json.dumps({"advisor_stances": []})


def _policy_json(name: str, m1: str, m2: str) -> str:
    payload = {
        "name": name,
        "description": f"{name} description.",
        "portfolio": "Infrastructure",
        "budget_cost": 220.0,
        "target_effects": {"transit_and_roads": 6.0},
        "side_effects": {"jobs_and_commerce": -1.5},
        "time_profile": {"turn_0": 0.6, "turn_1": 0.4},
        "targets": [
            {
                "key": "transit_and_roads",
                "label": "Transit and Roads",
                "unit": "points",
                "proposed": 6.0,
                "difficulty": 0.5,
            }
        ],
        "tradeoffs": "Temporary disruption during rollout.",
        "why_now": "Peak-hour congestion is worsening.",
        "advisor_stances": [
            {
                "minister_name": m1,
                "stance": "approve",
                "reason": "This aligns with my delivery backlog and is executable this quarter.",
            },
            {
                "minister_name": m2,
                "stance": "disapprove",
                "reason": "Hospital access may get harder during lane closures.",
            },
        ],
    }
    return json.dumps(payload)


def _run_stream(scripts: list[list[str]]) -> tuple[ScriptedPolicyStreamLLM, list[dict[str, Any]]]:
    state = _build_state()
    llm = ScriptedPolicyStreamLLM(scripts)
    events = list(generate_policy_options_stream(llm, state, consultation_transcript="", available_budget=600))
    return llm, events


def test_policy_stream_generates_five_policies_sequentially_with_linked_reasoning() -> None:
    state = _build_state()
    m1 = state.ministers[0].citizen.name
    m2 = state.ministers[1].citizen.name
    llm, events = _run_stream(
        [
            [f"<analysis>## POLICY 1 — Rapid Bus Corridors\n- **Why now:** congestion is acute.\n</analysis>{_policy_json('Rapid Bus Corridors', m1, m2)}"],
            [f"<analysis>## POLICY 2 — Clinic Access Lanes\n- **Plan logic:** protect ambulance movement.\n</analysis>{_policy_json('Clinic Access Lanes', m1, m2)}"],
            [f"<analysis>## POLICY 3 — Freight Decongestion Sprint\n- **Council vote:** mixed support.\n</analysis>{_policy_json('Freight Decongestion Sprint', m1, m2)}"],
            [f"<analysis>## POLICY 4 — Junction Safety Retrofit\n- **Tradeoff:** slower rollout.\n</analysis>{_policy_json('Junction Safety Retrofit', m1, m2)}"],
            [f"<analysis>## POLICY 5 — Green Freight Window\n- **Why now:** emissions pressure.\n</analysis>{_policy_json('Green Freight Window', m1, m2)}"],
        ]
    )

    thinking = "".join(e["chunk"] for e in events if e["type"] == "thinking")
    policy_events = [e for e in events if e["type"] == "policies"]

    assert len(llm.stream_calls) == 5
    assert all(call[0] == POLICY_DRAFT_SYSTEM_STREAM for call in llm.stream_calls)
    assert "## POLICY 1 — Rapid Bus Corridors" in thinking
    assert "## POLICY 2 — Clinic Access Lanes" in thinking
    assert "## POLICY 3 — Freight Decongestion Sprint" in thinking
    assert "## POLICY 4 — Junction Safety Retrofit" in thinking
    assert "## POLICY 5 — Green Freight Window" in thinking
    assert len(policy_events) == 1
    assert [p["name"] for p in policy_events[0]["options"]] == [
        "Rapid Bus Corridors",
        "Clinic Access Lanes",
        "Freight Decongestion Sprint",
        "Junction Safety Retrofit",
        "Green Freight Window",
    ]


def test_policy_stream_prompts_include_previously_drafted_policies() -> None:
    state = _build_state()
    m1 = state.ministers[0].citizen.name
    m2 = state.ministers[1].citizen.name
    llm, _ = _run_stream(
        [
            [f"<analysis>## POLICY 1 — Alpha\n- note\n</analysis>{_policy_json('Alpha', m1, m2)}"],
            [f"<analysis>## POLICY 2 — Beta\n- note\n</analysis>{_policy_json('Beta', m1, m2)}"],
            [f"<analysis>## POLICY 3 — Gamma\n- note\n</analysis>{_policy_json('Gamma', m1, m2)}"],
            [f"<analysis>## POLICY 4 — Delta\n- note\n</analysis>{_policy_json('Delta', m1, m2)}"],
            [f"<analysis>## POLICY 5 — Epsilon\n- note\n</analysis>{_policy_json('Epsilon', m1, m2)}"],
        ]
    )

    assert len(llm.stream_calls) == 5
    assert '"name": "Alpha"' in llm.stream_calls[1][1]
    assert '"name": "Alpha"' in llm.stream_calls[2][1]
    assert '"name": "Beta"' in llm.stream_calls[2][1]
    assert '"name": "Gamma"' in llm.stream_calls[3][1]
    assert '"name": "Delta"' in llm.stream_calls[4][1]


def test_policy_stream_filters_json_when_analysis_close_tag_missing() -> None:
    state = _build_state()
    m1 = state.ministers[0].citizen.name
    m2 = state.ministers[1].citizen.name
    llm, events = _run_stream(
        [
            [f"<analysis>## POLICY 1 — No close tag\n- Thinking line.\n{_policy_json('No Close Tag Policy', m1, m2)}"],
            [f"<analysis>## POLICY 2 — Valid\n- line\n</analysis>{_policy_json('Valid Policy Two', m1, m2)}"],
            [f"<analysis>## POLICY 3 — Valid\n- line\n</analysis>{_policy_json('Valid Policy Three', m1, m2)}"],
            [f"<analysis>## POLICY 4 — Valid\n- line\n</analysis>{_policy_json('Valid Policy Four', m1, m2)}"],
            [f"<analysis>## POLICY 5 — Valid\n- line\n</analysis>{_policy_json('Valid Policy Five', m1, m2)}"],
        ]
    )

    thinking = "".join(e["chunk"] for e in events if e["type"] == "thinking")
    policy_events = [e for e in events if e["type"] == "policies"]

    assert "No close tag" in thinking
    assert "{" not in thinking
    assert '"name"' not in thinking
    assert len(policy_events) == 1
    assert len(policy_events[0]["options"]) == 5


def test_policy_stream_injects_policy_header_fallback_if_analysis_missing_header() -> None:
    state = _build_state()
    m1 = state.ministers[0].citizen.name
    m2 = state.ministers[1].citizen.name
    llm, events = _run_stream(
        [
            [f"<analysis>- generic bullet without header\n</analysis>{_policy_json('Fallback Header Policy', m1, m2)}"],
            [f"<analysis>## POLICY 2 — B\n- line\n</analysis>{_policy_json('B Policy', m1, m2)}"],
            [f"<analysis>## POLICY 3 — C\n- line\n</analysis>{_policy_json('C Policy', m1, m2)}"],
            [f"<analysis>## POLICY 4 — D\n- line\n</analysis>{_policy_json('D Policy', m1, m2)}"],
            [f"<analysis>## POLICY 5 — E\n- line\n</analysis>{_policy_json('E Policy', m1, m2)}"],
        ]
    )

    thinking = "".join(e["chunk"] for e in events if e["type"] == "thinking")
    assert "## POLICY 1 — Fallback Header Policy" in thinking
    assert "- **Council vote:** 1 For · 1 Against" in thinking


def test_policy_stream_emits_single_final_policies_event() -> None:
    state = _build_state()
    m1 = state.ministers[0].citizen.name
    m2 = state.ministers[1].citizen.name
    _, events = _run_stream(
        [
            [f"<analysis>## POLICY 1 — A\n- line\n</analysis>{_policy_json('A', m1, m2)}"],
            [f"<analysis>## POLICY 2 — B\n- line\n</analysis>{_policy_json('B', m1, m2)}"],
            [f"<analysis>## POLICY 3 — C\n- line\n</analysis>{_policy_json('C', m1, m2)}"],
            [f"<analysis>## POLICY 4 — D\n- line\n</analysis>{_policy_json('D', m1, m2)}"],
            [f"<analysis>## POLICY 5 — E\n- line\n</analysis>{_policy_json('E', m1, m2)}"],
        ]
    )
    policy_events = [e for e in events if e["type"] == "policies"]
    assert len(policy_events) == 1

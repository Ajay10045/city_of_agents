from __future__ import annotations

from types import SimpleNamespace

import pytest

import llm.advisory_chamber as advisory_chamber_module
from core.advisor_session import DEFAULT_ADVISORS
from llm.advisory_chamber import AdvisoryChamber, ChamberPolicyValidationError
from llm.dynamic_policy import DynamicPolicy


def _valid_policy(name: str, advisor_id: str, portfolio: str) -> dict:
    return {
        "name": name,
        "description": "Launch a concrete jobs and transit delivery package with weekly milestones.",
        "rationale": "This directly addresses jobs pressure while preserving trust via visible delivery checkpoints.",
        "why_now": "Jobs stress and trust risk are both active this turn, so timed delivery is necessary now.",
        "effects": {"employment": 2.0, "public_trust": 1.0},
        "group_effects": [],
        "campaign_strength": 1.06,
        "media_effects": {"trust": 0.4},
        "target_groups": ["Workers"],
        "deliberation_trace": {
            "mayor_direction_used": "Prioritize jobs while protecting public trust through measurable milestones.",
            "advisor_inputs_used": [
                {
                    "advisor_id": advisor_id,
                    "portfolio": portfolio,
                    "point": "Set weekly measurable milestones and publish progress by ward.",
                }
            ],
        },
    }


def _sample_transcript() -> list[dict]:
    return [
        {"id": "u1", "role": "user", "content": "Prioritize jobs and trust this turn."},
        {
            "id": "a1",
            "role": "advisor",
            "speaker_advisor_id": "fiscal_growth",
            "content": "Tie jobs expansion to measurable transport and delivery milestones.",
        },
        {
            "id": "a2",
            "role": "advisor",
            "speaker_advisor_id": "social_cohesion",
            "content": "Protect trust by publishing progress and grievance closure data weekly.",
        },
    ]


def test_validate_policy_batch_rejects_placeholder_values() -> None:
    chamber = AdvisoryChamber()
    policy = DynamicPolicy.from_llm(
        {
            "name": "Unknown Policy",
            "description": "Targeted intervention to stabilize key city pressures this turn.",
            "rationale": "Chosen for near-term impact under current city pressures.",
            "why_now": "extend",
            "effects": {"economy": 1.0},
            "group_effects": [],
            "campaign_strength": 1.0,
            "media_effects": {},
            "deliberation_trace": {
                "mayor_direction_used": "extend",
                "advisor_inputs_used": [
                    {"advisor_id": "fiscal_growth", "portfolio": "economy", "point": "short"}
                ],
            },
        },
        actor="mayor",
    )
    with pytest.raises(ChamberPolicyValidationError) as exc:
        chamber._validate_policy_batch(  # noqa: SLF001
            [policy],
            constraints="jobs and trust",
            transcript=_sample_transcript(),
        )
    assert "invalid name" in " | ".join(exc.value.reasons).lower()


def test_generate_policies_retries_once_then_succeeds(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(advisory_chamber_module, "build_city_context", lambda _state: "city context")
    chamber = AdvisoryChamber()

    class _RetryClient:
        def __init__(self) -> None:
            self.calls = 0

        def chat(self, _system: str, _user: str) -> dict:
            self.calls += 1
            if self.calls == 1:
                return {
                    "conclusion_summary": "extend",
                    "policies": [
                        {
                            "name": "Unknown Policy",
                            "description": "Targeted intervention to stabilize key city pressures this turn.",
                            "rationale": "Chosen for near-term impact under current city pressures.",
                            "why_now": "extend",
                            "effects": {"economy": 1.0},
                            "group_effects": [],
                            "campaign_strength": 1.0,
                            "media_effects": {},
                            "deliberation_trace": {
                                "mayor_direction_used": "extend",
                                "advisor_inputs_used": [
                                    {
                                        "advisor_id": "fiscal_growth",
                                        "portfolio": "economy",
                                        "point": "short",
                                    }
                                ],
                            },
                        }
                    ]
                    * 3,
                }
            return {
                "conclusion_summary": "Council converged on a grounded jobs-trust package.",
                "policies": [
                    _valid_policy("Ward Jobs Delivery Sprint", "fiscal_growth", "economy"),
                    _valid_policy("Service Reliability Compact", "social_cohesion", "public_trust"),
                    _valid_policy("Integrity Procurement Pulse", "governance_risk", "corruption"),
                ],
            }

    chamber._client = _RetryClient()  # type: ignore[assignment]
    chamber._disable_live = False
    policies, summary = chamber.generate_policies_from_deliberation(
        game_state=SimpleNamespace(),
        advisors=list(DEFAULT_ADVISORS),
        transcript=_sample_transcript(),
        constraints="jobs trust milestones",
        count=3,
    )
    assert len(policies) == 3
    assert "grounded" in summary.lower()
    assert policies[0].name != "Unknown Policy"


def test_generate_policies_double_fail_raises_validation(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(advisory_chamber_module, "build_city_context", lambda _state: "city context")
    chamber = AdvisoryChamber()

    class _InvalidClient:
        @staticmethod
        def chat(_system: str, _user: str) -> dict:
            return {
                "conclusion_summary": "extend",
                "policies": [
                    {
                        "name": "Unknown Policy",
                        "description": "Targeted intervention to stabilize key city pressures this turn.",
                        "rationale": "Chosen for near-term impact under current city pressures.",
                        "why_now": "extend",
                        "effects": {"economy": 1.0},
                        "group_effects": [],
                        "campaign_strength": 1.0,
                        "media_effects": {},
                        "deliberation_trace": {
                            "mayor_direction_used": "extend",
                            "advisor_inputs_used": [
                                {
                                    "advisor_id": "fiscal_growth",
                                    "portfolio": "economy",
                                    "point": "short",
                                }
                            ],
                        },
                    }
                ]
                * 3,
            }

    chamber._client = _InvalidClient()  # type: ignore[assignment]
    chamber._disable_live = False
    with pytest.raises(ChamberPolicyValidationError):
        chamber.generate_policies_from_deliberation(
            game_state=SimpleNamespace(),
            advisors=list(DEFAULT_ADVISORS),
            transcript=_sample_transcript(),
            constraints="jobs trust milestones",
            count=3,
        )


def test_ensure_policy_trace_enriches_advisor_name() -> None:
    chamber = AdvisoryChamber()
    policy = DynamicPolicy.from_llm(
        {
            "name": "Delivery and Trust Plan",
            "description": "Deliver jobs-linked infrastructure with transparent milestones.",
            "rationale": "Balances growth urgency and trust protection.",
            "why_now": "Jobs and trust pressure are both active and need synchronized action.",
            "effects": {"employment": 1.5},
            "group_effects": [],
            "campaign_strength": 1.0,
            "media_effects": {},
            "deliberation_trace": {
                "mayor_direction_used": "Prioritize jobs while protecting trust with weekly checkpoints.",
                "advisor_inputs_used": [
                    {
                        "advisor_id": "fiscal_growth",
                        "portfolio": "economy",
                        "point": "Use milestone-linked contracts to ensure delivery quality.",
                    }
                ],
            },
        },
        actor="mayor",
    )
    chamber._ensure_policy_trace(  # noqa: SLF001
        policy,
        constraints="jobs trust milestones",
        transcript=_sample_transcript(),
        advisor_meta={
            "fiscal_growth": {
                "name": "Asha Menon",
                "portfolios": ["economy", "employment", "infrastructure"],
            }
        },
    )
    trace = policy.deliberation_trace
    assert trace["advisor_inputs_used"][0]["advisor_name"] == "Asha Menon"

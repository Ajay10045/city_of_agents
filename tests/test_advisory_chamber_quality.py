from __future__ import annotations

from types import SimpleNamespace

import pytest

import llm.advisory_chamber as advisory_chamber_module
from core.advisor_session import DEFAULT_ADVISORS
from llm.advisory_chamber import AdvisoryChamber, ChamberPolicyValidationError, ChamberReplyError
from llm.dynamic_policy import DynamicPolicy


def _valid_policy(name: str, advisor_id: str, portfolio: str) -> dict:
    return {
        "name": name,
        "description": "Launch a concrete jobs and transit delivery package with weekly milestones.",
        "rationale": "This directly addresses jobs pressure while preserving trust via visible delivery checkpoints.",
        "why_now": "Jobs stress and trust risk are both active this turn, so timed delivery is necessary now.",
        "effects": {"employment_rate": 2.0, "media_access": 1.0},
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
            "effects": {"treasury_balance": 1.0},
            "group_effects": [],
            "campaign_strength": 1.0,
            "media_effects": {},
            "deliberation_trace": {
                "mayor_direction_used": "extend",
                "advisor_inputs_used": [
                    {"advisor_id": "fiscal_growth", "portfolio": "treasury_balance", "point": "short"}
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
                            "effects": {"treasury_balance": 1.0},
                            "group_effects": [],
                            "campaign_strength": 1.0,
                            "media_effects": {},
                            "deliberation_trace": {
                                "mayor_direction_used": "extend",
                                "advisor_inputs_used": [
                                    {
                                        "advisor_id": "fiscal_growth",
                                        "portfolio": "treasury_balance",
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
                    _valid_policy("Ward Jobs Delivery Sprint", "fiscal_growth", "treasury_balance"),
                    _valid_policy("Service Reliability Compact", "social_cohesion", "media_access"),
                    _valid_policy("Integrity Procurement Pulse", "governance_risk", "recidivism_rate"),
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
                        "effects": {"treasury_balance": 1.0},
                        "group_effects": [],
                        "campaign_strength": 1.0,
                        "media_effects": {},
                        "deliberation_trace": {
                            "mayor_direction_used": "extend",
                            "advisor_inputs_used": [
                                {
                                    "advisor_id": "fiscal_growth",
                                    "portfolio": "treasury_balance",
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
            "effects": {"employment_rate": 1.5},
            "group_effects": [],
            "campaign_strength": 1.0,
            "media_effects": {},
            "deliberation_trace": {
                "mayor_direction_used": "Prioritize jobs while protecting trust with weekly checkpoints.",
                "advisor_inputs_used": [
                    {
                        "advisor_id": "fiscal_growth",
                        "portfolio": "treasury_balance",
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
                "portfolios": ["treasury_balance", "employment_rate", "avg_wage", "connectivity"],
            }
        },
    )
    trace = policy.deliberation_trace
    assert trace["advisor_inputs_used"][0]["advisor_name"] == "Asha Menon"


def test_validate_reply_requires_references_for_policy_mode() -> None:
    chamber = AdvisoryChamber()
    with pytest.raises(ChamberReplyError):
        chamber._validate_reply(  # noqa: SLF001
            {
                "stance": "extend",
                "portfolio_focus": "treasury_balance",
                "response_text": "From the treasury_balance lens, we should sequence milestones and track delivery risk weekly.",
                "references_to_prior": [],
                "distinctive_risk": "Delivery credibility erosion if targets slip.",
            },
            DEFAULT_ADVISORS[0],
            prior_ids=["a1"],
            interaction_mode="policy",
        )


def test_validate_reply_relaxes_reference_requirement_for_casual_mode() -> None:
    chamber = AdvisoryChamber()
    normalized, summary = chamber._validate_reply(  # noqa: SLF001
        {
            "stance": "extend",
            "portfolio_focus": "treasury_balance",
            "response_text": "Hi Mayor, happy to help whenever you want to dive deeper.",
            "references_to_prior": [],
            "distinctive_risk": "",
        },
        DEFAULT_ADVISORS[0],
        prior_ids=["a1"],
        interaction_mode="casual",
    )
    assert summary
    assert normalized["responds_to_message_ids"] == []
    assert normalized["distinctive_risk"]


def test_summarize_conversation_memory_fallback_keeps_key_context() -> None:
    chamber = AdvisoryChamber()
    chamber._client = None  # type: ignore[assignment]
    chamber._disable_live = True
    summary = chamber.summarize_conversation_memory(
        existing_summary="Mayor wants balanced jobs and trust outcomes.",
        transcript=[
            {"id": "u1", "role": "user", "content": "Focus on trust first, then jobs."},
            {"id": "a1", "role": "advisor", "advisor_name": "Mei Tanaka", "content": "Trust gains need clear service reliability metrics."},
            {"id": "u2", "role": "user", "content": "Can we do both without backlash?"},
        ],
    )
    assert "Mayor priorities" in summary
    assert "Open questions" in summary


def test_validate_reply_filters_context_refs() -> None:
    chamber = AdvisoryChamber()
    normalized, _ = chamber._validate_reply(  # noqa: SLF001
        {
            "stance": "extend",
            "portfolio_focus": "treasury_balance",
            "response_text": "Yes, and as we discussed earlier, weekly milestone updates can improve trust.",
            "references_to_prior": ["a1"],
            "context_refs": ["a1", "unknown"],
            "distinctive_risk": "Credibility drops if milestones are missed repeatedly.",
        },
        DEFAULT_ADVISORS[0],
        prior_ids=["a1"],
        allowed_context_ids=["a1", "u1"],
        interaction_intent="strategy",
        interaction_mode="policy",
    )
    assert normalized["context_refs"] == ["a1"]

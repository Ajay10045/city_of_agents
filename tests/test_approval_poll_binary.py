from __future__ import annotations

from engine.models import (
    Citizen,
    CitizenCapability,
    CitizenDemographics,
    CitizenPersonality,
    Policy,
    PolicyTarget,
    WellbeingState,
)
from simulation.llm_calls import poll_citizen_approval


class StubLLM:
    def __init__(self, response: str) -> None:
        self.response = response

    def chat_text(self, system: str, user: str) -> str:
        _ = (system, user)
        return self.response


def _citizen() -> Citizen:
    return Citizen(
        id="c1",
        name="Test Citizen",
        demographics=CitizenDemographics(
            age_group="26-35",
            income_percentile=50,
            income_bracket="middle",
            religion="none",
            profession="teacher",
            education_level=70,
            location="Central",
            ideology_economic="center",
            ideology_social="liberal",
        ),
        personality=CitizenPersonality(
            integrity=60,
            empathy=55,
            risk_appetite=45,
            ambition=52,
            conscientiousness=58,
            authority_respect=48,
            corruption_tolerance=35,
        ),
        capability=CitizenCapability(
            competence=62,
            managerial_skill=54,
            strategic_thinking=51,
            crisis_handling=49,
            bureaucratic_navigation=50,
        ),
        wellbeing=WellbeingState(health=55, wealth=55, safety=55, social=55),
        mayor_alignment=0,
        population_weight=1.0,
    )


def _policy() -> Policy:
    return Policy(
        name="Test Policy",
        description="A policy used for testing.",
        portfolio="Infrastructure",
        budget_cost=100,
        target_effects={"transit_and_roads": 2.0},
        side_effects={},
        time_profile={"turn_0": 1.0},
        targets=[
            PolicyTarget(
                key="transit_and_roads",
                label="Transit and Roads",
                unit="points",
                proposed=2.0,
                difficulty=0.4,
            )
        ],
        tradeoffs="Some disruption.",
        why_now="Needed this turn.",
    )


def test_poll_citizen_approval_converts_undecided_to_binary() -> None:
    llm = StubLLM('{"reaction":"hmm","sentiment":"undecided"}')
    voice = poll_citizen_approval(
        llm=llm,
        citizen=_citizen(),
        wellbeing_before=WellbeingState(health=50, wealth=50, safety=50, social=50),
        wellbeing_after=WellbeingState(health=52, wealth=50, safety=50, social=50),
        policy=_policy(),
        execution_pct=60,
        city_params_before={"transit_and_roads": 50},
        city_params_after={"transit_and_roads": 52},
        city_name="Testopolis",
    )
    assert voice.sentiment in {"approve", "disapprove"}
    assert voice.sentiment == "approve"


def test_poll_citizen_approval_fallback_is_binary() -> None:
    llm = StubLLM("not-json")
    voice = poll_citizen_approval(
        llm=llm,
        citizen=_citizen(),
        wellbeing_before=WellbeingState(health=50, wealth=50, safety=50, social=50),
        wellbeing_after=WellbeingState(health=49, wealth=50, safety=50, social=50),
        policy=_policy(),
        execution_pct=60,
        city_params_before={"transit_and_roads": 50},
        city_params_after={"transit_and_roads": 49},
        city_name="Testopolis",
    )
    assert voice.sentiment in {"approve", "disapprove"}
    assert voice.sentiment == "disapprove"

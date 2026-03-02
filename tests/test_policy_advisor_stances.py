from __future__ import annotations

import json

from engine.models import (
    AgeBracket,
    BudgetConfig,
    Citizen,
    CitizenCapability,
    CitizenDemographics,
    CitizenPersonality,
    CityParameters,
    CityProfile,
    CommunalConfig,
    DemographicDistributions,
    EducationDistribution,
    GameConfig,
    GameState,
    IncomeDistribution,
    LocationEntry,
    MediaOutletProfile,
    MediaOutletState,
    Minister,
    MinisterState,
    PersonalityClimate,
    ProfessionEntry,
    ReligionEntry,
    WellbeingState,
)
from simulation.llm_calls import amend_policy_option, generate_policy_options


class StubLLM:
    def __init__(self, responses: list[str]) -> None:
        self.responses = responses
        self.calls: list[tuple[str, str]] = []

    def chat_text(self, system: str, user: str) -> str:
        self.calls.append((system, user))
        if not self.responses:
            raise AssertionError("Unexpected chat_text call")
        return self.responses.pop(0)


def _build_citizen(citizen_id: str, name: str, weight: float) -> Citizen:
    return Citizen(
        id=citizen_id,
        name=name,
        demographics=CitizenDemographics(
            age_group="26-35",
            income_percentile=50,
            income_bracket="middle",
            religion="none",
            profession="civil servant",
            education_level=70,
            location="Central",
            ideology_economic="center",
            ideology_social="liberal",
        ),
        personality=CitizenPersonality(
            integrity=68,
            empathy=55,
            risk_appetite=45,
            ambition=62,
            conscientiousness=64,
            authority_respect=58,
            corruption_tolerance=30,
        ),
        capability=CitizenCapability(
            competence=70,
            managerial_skill=66,
            strategic_thinking=61,
            crisis_handling=60,
            bureaucratic_navigation=67,
        ),
        wellbeing=WellbeingState(health=55, wealth=56, safety=54, social=57),
        mayor_alignment=0,
        population_weight=weight,
    )


def _build_state() -> GameState:
    profile = CityProfile(
        city_name="Testopolis",
        region="Testland",
        population_description="A compact city for tests.",
        languages=["English"],
        dominant_religions=[ReligionEntry(name="none", percent=100)],
        cultural_notes="Pragmatic and policy-focused.",
        geographic_character="coastal",
        historical_context="Test fixture city.",
        city_parameters=CityParameters(),
        demographics=DemographicDistributions(
            income_distribution=IncomeDistribution(type="beta", mean=0.5, spread=0.2, skew="symmetric"),
            age_distribution={"brackets": [AgeBracket(label="26-35", percent=100)]},
            religion_distribution=[ReligionEntry(name="none", percent=100)],
            profession_distribution=[ProfessionEntry(name="civil servant", percent=100)],
            education_distribution=EducationDistribution(mean=0.6, spread=0.2),
            location_distribution=[LocationEntry(name="Central", percent=100)],
            ideology_economic_distribution={
                "extreme_left": 10,
                "left": 20,
                "center": 40,
                "right": 20,
                "extreme_right": 10,
            },
            ideology_social_distribution={"liberal": 60, "conservative": 40},
        ),
        personality_climate=PersonalityClimate(
            integrity_mean=60,
            competence_mean=62,
            conscientiousness_mean=61,
            ambition_mean=58,
            empathy_mean=55,
            risk_appetite_mean=50,
            authority_respect_mean=53,
            corruption_tolerance_mean=35,
        ),
        media_outlets=[
            MediaOutletProfile(
                name="Daily Test",
                lean="neutral",
                bias_intensity=0.4,
                sensationalism=0.3,
                trust_rating=0.7,
                reach=0.8,
            )
        ],
        communal_config=CommunalConfig(tension_baseline=0.2, dominant_fault_line="class", festival_calendar=[]),
        budget=BudgetConfig(
            starting_treasury=1200,
            base_tax_revenue=150,
            max_policy_budget=600,
            max_minor_budget=100,
            max_debt=4000,
            interest_rate=0.04,
        ),
        game_config=GameConfig(total_turns=10, election_turn=8, agent_count=10, minister_count=2),
    )

    infra_citizen = _build_citizen("m1", "Asha Menon", 0.34)
    health_citizen = _build_citizen("m2", "Ravi Iyer", 0.33)
    opposition = _build_citizen("opp", "Nora Khan", 0.33)

    return GameState(
        city_profile=profile,
        city_params=profile.city_parameters,
        citizens=[infra_citizen, health_citizen, opposition],
        ministers=[
            Minister(
                citizen=infra_citizen,
                portfolio="Infrastructure",
                state=MinisterState(loyalty=62, scandal_exposure=10, political_capital=55),
            ),
            Minister(
                citizen=health_citizen,
                portfolio="Health & Education",
                state=MinisterState(loyalty=58, scandal_exposure=8, political_capital=52),
            ),
        ],
        opposition_leader=opposition,
        media_outlets=[
            MediaOutletState(
                name="Daily Test",
                lean="neutral",
                bias_intensity=0.4,
                sensationalism=0.3,
                trust_rating=0.7,
                reach=0.8,
                initial_trust=0.7,
                initial_reach=0.8,
            )
        ],
        treasury=1200,
        communal_tension=0.2,
        prng_seed=42,
    )


def _policy_payload(advisor_stances: list[dict[str, str]]) -> list[dict]:
    return [
        {
            "name": "Rapid Bus Corridors",
            "description": "Build dedicated bus lanes on major routes.",
            "portfolio": "Infrastructure",
            "budget_cost": 540,
            "target_effects": {"transit_and_roads": 12.5},
            "side_effects": {"air_quality_and_pollution": -6.3},
            "time_profile": {"turn_0": 0.7, "turn_1": 0.3},
            "targets": [
                {
                    "key": "transit_and_roads",
                    "label": "Transit and Roads",
                    "unit": "points",
                    "proposed": 12.5,
                    "difficulty": 0.5,
                }
            ],
            "tradeoffs": "Construction disruption in key corridors.",
            "why_now": "Peak-hour congestion is worsening quickly.",
            "advisor_stances": advisor_stances,
        }
    ]


def _existing_policy() -> dict:
    return _policy_payload([])[0]


def test_generate_policy_options_complete_stances_no_repair() -> None:
    state = _build_state()
    llm = StubLLM(
        [
            json.dumps(
                _policy_payload(
                    [
                        {"minister_name": "Asha Menon", "stance": "approve", "reason": "This directly relieves my transport backlog."},
                        {"minister_name": "Ravi Iyer", "stance": "disapprove", "reason": "Hospital access disruptions will hurt patient flow."},
                    ]
                )
            )
        ]
    )

    options = generate_policy_options(llm, state, consultation_transcript="", available_budget=600)

    assert len(llm.calls) == 1
    assert len(options) == 1
    assert len(options[0]["advisor_stances"]) == 2
    assert options[0]["target_effects"]["transit_and_roads"] == 10.0
    assert options[0]["side_effects"]["air_quality_and_pollution"] == -5.0


def test_generate_policy_options_repairs_missing_stances_once() -> None:
    state = _build_state()
    llm = StubLLM(
        [
            json.dumps(
                _policy_payload(
                    [
                        {"minister_name": "Asha Menon", "stance": "approve", "reason": "This lifts throughput in my portfolio immediately."}
                    ]
                )
            ),
            json.dumps(
                {
                    "advisor_stances": [
                        {"minister_name": "Asha Menon", "stance": "approve", "reason": "Dedicated lanes finally match our delivery capacity."},
                        {"minister_name": "Ravi Iyer", "stance": "disapprove", "reason": "I cannot absorb clinic access losses during rollout."},
                    ]
                }
            ),
        ]
    )

    options = generate_policy_options(llm, state, consultation_transcript="", available_budget=600)

    assert len(llm.calls) == 2
    assert len(options[0]["advisor_stances"]) == 2
    assert {s["minister_name"] for s in options[0]["advisor_stances"]} == {"Asha Menon", "Ravi Iyer"}


def test_generate_policy_options_repairs_invalid_stances() -> None:
    state = _build_state()
    llm = StubLLM(
        [
            json.dumps(
                _policy_payload(
                    [
                        {"ministerName": "Asha Menon", "stance": "YES", "reason": "I support this."},
                        {"minister_name": "Ravi Iyer", "stance": "disapprove", "reason": ""},
                    ]
                )
            ),
            json.dumps(
                {
                    "advisor_stances": [
                        {"minister_name": "Asha Menon", "stance": "approve", "reason": "My department can execute this with existing crews."},
                        {"minister_name": "Ravi Iyer", "stance": "disapprove", "reason": "It shifts budget away from clinics during shortages."},
                    ]
                }
            ),
        ]
    )

    options = generate_policy_options(llm, state, consultation_transcript="", available_budget=600)

    assert len(llm.calls) == 2
    assert len(options[0]["advisor_stances"]) == 2
    assert all(s["stance"] in {"approve", "disapprove"} for s in options[0]["advisor_stances"])
    assert all(s["reason"] for s in options[0]["advisor_stances"])


def test_generate_policy_options_partial_when_repair_incomplete() -> None:
    state = _build_state()
    llm = StubLLM(
        [
            json.dumps(
                _policy_payload(
                    [
                        {"minister_name": "Asha Menon", "stance": "approve", "reason": "This addresses route bottlenecks we have tracked for months."}
                    ]
                )
            ),
            json.dumps(
                {
                    "advisor_stances": [
                        {"minister_name": "Asha Menon", "stance": "approve", "reason": "I can deliver this without waiting on procurement resets."}
                    ]
                }
            ),
        ]
    )

    options = generate_policy_options(llm, state, consultation_transcript="", available_budget=600)

    assert len(llm.calls) == 2
    assert options[0]["advisor_stances"] == [
        {
            "minister_name": "Asha Menon",
            "stance": "approve",
            "reason": "I can deliver this without waiting on procurement resets.",
        }
    ]


def test_amend_policy_option_repairs_missing_stances_once() -> None:
    state = _build_state()
    llm = StubLLM(
        [
            json.dumps(
                {
                    **_existing_policy(),
                    "advisor_stances": [
                        {"minister_name": "Asha Menon", "stance": "approve", "reason": "The amendment still fits my rollout plan."}
                    ],
                }
            ),
            json.dumps(
                {
                    "advisor_stances": [
                        {"minister_name": "Asha Menon", "stance": "approve", "reason": "Sequenced rollout keeps deliverables realistic."},
                        {"minister_name": "Ravi Iyer", "stance": "disapprove", "reason": "The revised budget still squeezes school maintenance lines."},
                    ]
                }
            ),
        ]
    )

    amended = amend_policy_option(
        llm,
        state,
        existing_policy=_existing_policy(),
        discussion_transcript="Mayor asked for tighter budget control.",
        available_budget=600,
    )

    assert len(llm.calls) == 2
    assert len(amended["advisor_stances"]) == 2

"""Canonical Pydantic models for City of Agents (v4 spec).

All engine modules import from here. Never import from one engine module to another
to avoid circular deps — import from models instead.
"""
from __future__ import annotations

import uuid
from typing import Any, Literal

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# City Profile — root of everything
# ---------------------------------------------------------------------------

class IncomeDistribution(BaseModel):
    type: str = "beta"
    mean: float
    spread: float
    skew: Literal["left", "right", "symmetric"] = "left"


class AgeBracket(BaseModel):
    label: str
    percent: float


class ReligionEntry(BaseModel):
    name: str
    percent: float


class ProfessionEntry(BaseModel):
    name: str
    percent: float


class LocationEntry(BaseModel):
    name: str
    percent: float


class EducationDistribution(BaseModel):
    mean: float
    spread: float


class DemographicDistributions(BaseModel):
    income_distribution: IncomeDistribution
    age_distribution: dict[str, list[AgeBracket]]  # {"brackets": [...]}
    religion_distribution: list[ReligionEntry]
    profession_distribution: list[ProfessionEntry]
    education_distribution: EducationDistribution
    location_distribution: list[LocationEntry]
    ideology_economic_distribution: dict[str, float]  # extreme_left/left/center/right/extreme_right
    ideology_social_distribution: dict[str, float]    # liberal/conservative


class PersonalityClimate(BaseModel):
    integrity_mean: float
    competence_mean: float
    conscientiousness_mean: float
    ambition_mean: float
    empathy_mean: float
    risk_appetite_mean: float
    authority_respect_mean: float
    corruption_tolerance_mean: float


class MediaOutletProfile(BaseModel):
    name: str
    lean: Literal["mayor", "opposition", "neutral"]
    bias_intensity: float   # 0–100
    sensationalism: float   # 0–100
    trust_rating: float     # 0–100
    reach: float            # 0–100


class CommunalConfig(BaseModel):
    tension_baseline: float
    dominant_fault_line: str
    festival_calendar: list[dict[str, Any]] = Field(default_factory=list)


class BudgetConfig(BaseModel):
    starting_treasury: float
    base_tax_revenue: float
    max_policy_budget: float
    max_minor_budget: float
    max_debt: float
    interest_rate: float


class GameConfig(BaseModel):
    total_turns: int = 20
    election_turn: int = 12
    agent_count: int = 50
    minister_count: int = 5
    legacy_equilibrium_multiplier: float = 2.0


class CityParameters(BaseModel):
    jobs_and_commerce: float = 50          # P1
    transit_and_roads: float = 50          # P2
    water_power_sanitation: float = 50     # P3
    hospitals_and_clinics: float = 50      # P4
    schools_and_universities: float = 50   # P5
    affordable_housing: float = 50         # P6
    community_and_spaces: float = 50       # P7
    police_and_emergency: float = 50       # P8
    courts_and_legal: float = 50           # P9
    air_quality_and_pollution: float = 50  # P10
    admin_efficiency: float = 50           # P11
    anti_corruption: float = 50            # P12
    media_freedom: float = 50             # P13

    def as_dict(self) -> dict[str, float]:
        return self.model_dump()

    def apply_delta(self, deltas: dict[str, float]) -> "CityParameters":
        """Return a new CityParameters with deltas applied (clamped 0–100)."""
        data = self.as_dict()
        for k, v in deltas.items():
            if k in data:
                data[k] = max(0.0, min(100.0, data[k] + v))
        return CityParameters(**data)


class CityProfile(BaseModel):
    city_name: str
    region: str
    population_description: str
    languages: list[str]
    dominant_religions: list[ReligionEntry]
    cultural_notes: str
    geographic_character: str
    historical_context: str
    city_parameters: CityParameters
    demographics: DemographicDistributions
    personality_climate: PersonalityClimate
    media_outlets: list[MediaOutletProfile]
    communal_config: CommunalConfig
    budget: BudgetConfig
    game_config: GameConfig


# ---------------------------------------------------------------------------
# Citizen / Agent
# ---------------------------------------------------------------------------

IncomeBracket = Literal["poor", "lower_mid", "middle", "upper_mid", "rich"]
IdeologyEconomic = Literal["extreme_left", "left", "center", "right", "extreme_right"]
IdeologySocial = Literal["liberal", "conservative"]


class CitizenDemographics(BaseModel):
    age_group: str
    income_percentile: float        # 0–100
    income_bracket: IncomeBracket
    religion: str
    profession: str
    education_level: float          # 0–100
    location: str
    ideology_economic: IdeologyEconomic
    ideology_social: IdeologySocial


class CitizenPersonality(BaseModel):
    integrity: float
    empathy: float
    risk_appetite: float
    ambition: float
    conscientiousness: float
    authority_respect: float
    corruption_tolerance: float


class CitizenCapability(BaseModel):
    competence: float
    managerial_skill: float
    strategic_thinking: float
    crisis_handling: float
    bureaucratic_navigation: float


class WellbeingState(BaseModel):
    health: float
    wealth: float
    safety: float
    social: float

    def score(self) -> float:
        return self.health * 0.25 + self.wealth * 0.30 + self.safety * 0.25 + self.social * 0.20


class Citizen(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    name: str
    demographics: CitizenDemographics
    personality: CitizenPersonality
    capability: CitizenCapability
    wellbeing: WellbeingState
    mayor_alignment: float          # –100 to +100, stored
    population_weight: float        # normalised, sums to 1.0 across all citizens
    # slow-moving state (event-driven)
    employment_status: str = "employed"


# ---------------------------------------------------------------------------
# Minister (Citizen elevated to office)
# ---------------------------------------------------------------------------

class MinisterState(BaseModel):
    loyalty: float = 65.0           # 0–100
    scandal_exposure: float = 0.0   # 0–100; accumulates, may break
    political_capital: float = 50.0 # 0–100; high = hard to fire


class Minister(BaseModel):
    citizen: Citizen
    portfolio: str                  # one of the 7 portfolios
    extra_portfolios: list[str] = Field(default_factory=list)
    state: MinisterState = Field(default_factory=MinisterState)


# ---------------------------------------------------------------------------
# Policy
# ---------------------------------------------------------------------------

class PolicyTarget(BaseModel):
    key: str
    label: str
    unit: str
    proposed: float
    difficulty: float               # 0–1; higher = harder to achieve
    delivered: float | None = None  # filled in after execution


class Policy(BaseModel):
    name: str
    description: str
    portfolio: str
    budget_cost: float
    target_effects: dict[str, float]   # param_key → intended delta (±10 max)
    side_effects: dict[str, float]     # param_key → side effect delta (±5 max)
    time_profile: dict[str, float]     # "turn_0", "turn_1", etc. → fraction (sums to 1.0)
    targets: list[PolicyTarget]
    tradeoffs: str
    why_now: str
    consultation_link: str = ""


# ---------------------------------------------------------------------------
# Minor Action
# ---------------------------------------------------------------------------

MinorActionType = Literal[
    "maintenance",       # Sector Maintenance: prevents decay for 1 param
    "banking",           # Budget Banking: skip, gain +20 Cr
    "reshuffle",         # Cabinet Reshuffle: reassign / fire / hire
    "press_conference",  # Press Conference: +3 alignment for target group (cooldown 3 turns)
    "emergency_fund",    # Emergency Fund: allocate up to 100 Cr to active crisis
    "governance_upkeep", # Governance Upkeep: +1 to P11/P12/P13
]


class MinorAction(BaseModel):
    type: MinorActionType
    target: str | None = None  # param key / group name / minister id depending on type
    budget: float = 0.0


# ---------------------------------------------------------------------------
# Events
# ---------------------------------------------------------------------------

EventType = Literal["crisis", "opportunity"]


class ActiveEvent(BaseModel):
    id: str
    name: str
    type: EventType
    severity: int                   # 1–3
    turns_remaining: int
    escalation_level: int = 0
    escalation_chance: float = 0.25
    city_effects_per_turn: dict[str, float] = Field(default_factory=dict)
    portfolio: str = ""


# ---------------------------------------------------------------------------
# Media outlet live state (extends profile with mutable values)
# ---------------------------------------------------------------------------

class MediaOutletState(BaseModel):
    name: str
    lean: Literal["mayor", "opposition", "neutral"]
    bias_intensity: float
    sensationalism: float
    trust_rating: float
    reach: float
    initial_trust: float    # anchored for drift recovery
    initial_reach: float


# ---------------------------------------------------------------------------
# Turn result
# ---------------------------------------------------------------------------

class DeliveryTarget(BaseModel):
    key: str
    label: str
    unit: str
    proposed: float
    delivered: float
    completion_ratio: float


class CitizenVoice(BaseModel):
    citizen_id: str
    name: str
    demographics_summary: str   # "32yo, Hindu, auto-rickshaw driver, Urban Core"
    ideology: str               # e.g. "left / liberal"
    reaction: str               # LLM-generated one-liner
    sentiment: Literal["approve", "disapprove", "undecided"]


class MediaHeadline(BaseModel):
    outlet: str
    lean: Literal["mayor", "opposition", "neutral"]
    headline: str


class WardReportEntry(BaseModel):
    group_type: str    # "income" | "location" | "religion" | "profession"
    group_name: str
    trend: Literal["up", "flat", "down"]
    avg_wellbeing_delta: float
    avg_wellbeing: float = 50.0
    hotspot: bool = False
    bright_spot: bool = False
    population: int = 0          # citizen count in this group
    population_pct: float = 0.0  # % of total citizens (0–100)
    approval: float = 50.0       # group avg mayor approval (0–100%)
    pulse_summary: str = ""      # LLM-like 1-sentence analytical summary


class TurnResult(BaseModel):
    turn: int
    major_policy: Policy
    minor_action: MinorAction
    execution_score: float
    actual_deltas: dict[str, float]
    side_effect_deltas: dict[str, float]
    budget_stolen: float
    delivery_targets: list[DeliveryTarget]
    delivery_narrative: str
    evaluator_reasoning: str = ""
    city_params_before: dict[str, float]
    city_params_after: dict[str, float]
    media_headlines: list[MediaHeadline]
    citizen_voices: list[CitizenVoice]
    opposition_attack: str
    counter_frame: str
    approval_before: float = 0.0
    interim_approval: float
    ward_report: list[WardReportEntry]
    events_triggered: list[ActiveEvent]
    communal_tension_after: float
    minister_loyalty_changes: dict[str, float]  # citizen_id → delta
    treasury_after: float
    outstanding_debt_after: float
    interest_paid: float
    tax_revenue: float
    advisor_summary: str = ""


# ---------------------------------------------------------------------------
# Game State — canonical live state
# ---------------------------------------------------------------------------

class GamePhase(str):
    PRE_ELECTION = "pre_election"
    LEGACY = "legacy"
    GAME_OVER = "game_over"


class GameState(BaseModel):
    game_id: str = Field(default_factory=lambda: str(uuid.uuid4())[:12])
    city_profile: CityProfile
    city_params: CityParameters
    citizens: list[Citizen]
    ministers: list[Minister]
    opposition_leader: Citizen
    opposition_credibility: float = 50.0
    media_outlets: list[MediaOutletState]
    active_events: list[ActiveEvent] = Field(default_factory=list)
    communal_tension: float = 25.0
    treasury: float = 1500.0
    outstanding_debt: float = 0.0
    current_turn: int = 1
    phase: str = "pre_election"   # pre_election | legacy | game_over
    turn_history: list[TurnResult] = Field(default_factory=list)
    # carry-over deltas from time-lagged policies: {turn_to_apply: {param: delta}}
    pending_deltas: dict[int, dict[str, float]] = Field(default_factory=dict)
    # track which params were targeted this/last turn for decay
    targeted_this_turn: set[str] = Field(default_factory=set)
    targeted_last_turn: set[str] = Field(default_factory=set)
    # press_conference cooldown per group: group_name → turn_last_used
    press_conference_cooldowns: dict[str, int] = Field(default_factory=dict)
    prng_seed: int = 0


# ---------------------------------------------------------------------------
# Scorecard (end of game)
# ---------------------------------------------------------------------------

class GovernanceScorecard(BaseModel):
    game_id: str
    final_approval: float
    wellbeing_equity: float
    institutional_legacy: float
    budget_health: float
    crisis_record: float
    promise_delivery: float
    cabinet_integrity: float
    final_score: float
    legacy_title: str
    summary: str

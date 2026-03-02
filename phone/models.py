"""Data models for The Mayor's Phone game.

Extends existing engine models (Citizen, CityParameters, etc.)
with conversation-specific structures for the phone-based UI.
"""

from __future__ import annotations

import uuid
from typing import Any, Literal

from pydantic import BaseModel, Field

from engine.models import (
    ActiveEvent,
    Citizen,
    CityParameters,
    CityProfile,
    MediaOutletState,
    Minister,
)


# ---------------------------------------------------------------------------
# Expression types — how citizens communicate (or don't)
# ---------------------------------------------------------------------------

ExpressionType = Literal["vocal", "amplifier", "leader", "silent", "swing"]

EXPRESSION_WEIGHTS: dict[ExpressionType, float] = {
    "vocal": 5.0,  # Messages directly, persistent
    "amplifier": 0.0,  # Shows up in media, not inbox (0 for Public tab)
    "leader": 3.0,  # Speaks for groups
    "silent": 0.0,  # Never messages. Only votes.
    "swing": 1.0,  # Only at severity >= moderate
}

EXPRESSION_DISTRIBUTION: dict[ExpressionType, float] = {
    "vocal": 0.15,
    "amplifier": 0.20,
    "leader": 0.05,
    "silent": 0.40,
    "swing": 0.20,
}


# ---------------------------------------------------------------------------
# Thread Message — a single message in a conversation
# ---------------------------------------------------------------------------


class ThreadMessage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    day: int
    sender: Literal["citizen", "mayor", "secretary", "system"]
    text: str
    topic: str | None = None
    cost_committed: float = 0.0
    tone: Literal[
        "complaint",
        "praise",
        "urgent",
        "neutral",
        "angry",
        "grateful",
        "threatening",
        "informational",
    ] = "neutral"
    secretary_options: list[SecretaryOption] | None = None
    read: bool = False


class SecretaryOption(BaseModel):
    """One of 3 pre-drafted response options from the secretary."""

    label: str  # e.g. "A. Send emergency tanker"
    text: str  # Full response text
    cost: float = 0.0  # ₹ Cr
    tone: Literal["diplomatic", "bold", "deflective", "honest"] = "diplomatic"
    action_hint: str = ""  # Engine hint: "repair_water_east" or "investigate"


# Need to rebuild ThreadMessage to include forward ref
ThreadMessage.model_rebuild()


# ---------------------------------------------------------------------------
# Citizen Thread — full conversation history with one citizen
# ---------------------------------------------------------------------------


class CitizenThread(BaseModel):
    citizen_id: str
    citizen_name: str
    citizen_occupation: str
    citizen_area: str
    citizen_summary: str  # Brief profile for LLM context
    expression_type: ExpressionType
    relationship: float = 0.0  # -100 to +100
    messages: list[ThreadMessage] = Field(default_factory=list)
    open_complaints: list[str] = Field(default_factory=list)  # param keys
    last_contact_day: int = 0
    is_supporter: bool = False


# ---------------------------------------------------------------------------
# Active Action — something the mayor committed to doing
# ---------------------------------------------------------------------------


class ActiveAction(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    action_type: Literal[
        "repair",
        "build",
        "investigate",
        "allocate",
        "policy",
        "hire",
        "reform",
        "other",
    ]
    param_affected: str  # e.g. "water_power_sanitation"
    area: str  # e.g. "East Ward"
    cost: float  # ₹ Cr
    days_to_complete: int
    started_on: int  # day number
    triggered_by: str  # citizen_id who asked
    mayor_quote: str  # exact words
    completed: bool = False
    completion_delta: float = 2.0  # param improvement on completion


# ---------------------------------------------------------------------------
# Promise — something the mayor said they'd do
# ---------------------------------------------------------------------------


class Promise(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    citizen_id: str
    topic: str  # "water repair", "jobs program"
    mayor_said: str  # exact words
    day_made: int
    deadline_day: int  # inferred from mayor's words
    fulfilled: bool = False
    broken_notified: bool = False  # has citizen been told about broken promise


# ---------------------------------------------------------------------------
# Active Problem — a real issue that needs attention
# ---------------------------------------------------------------------------


class ActiveProblem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    param: str  # "water_power_sanitation"
    area: str  # "East Ward"
    severity: Literal["whisper", "growing", "media", "crisis", "cascade", "political"]
    day_started: int
    days_at_current_stage: int = 0
    triggered_citizens: list[str] = Field(default_factory=list)
    mayor_responded: bool = False
    action_taken: str | None = None
    related_action_id: str | None = None  # link to ActiveAction
    escalation_history: list[str] = Field(default_factory=list)  # severity changes


# ---------------------------------------------------------------------------
# Inbox Message — a message waiting for the player
# ---------------------------------------------------------------------------


class InboxMessage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    day: int
    tab: Literal["cabinet", "media", "public", "crises"]
    sender_id: str  # citizen_id, minister_id, or outlet name
    sender_name: str
    sender_role: str  # "citizen", "minister", "journalist", "opposition"
    sender_avatar: str = ""  # avatar URL
    text: str
    topic: str | None = None
    requires_response: bool = True
    secretary_options: list[SecretaryOption] | None = None
    thread_id: str | None = None  # link to CitizenThread
    problem_id: str | None = None  # link to ActiveProblem
    urgency: Literal["low", "medium", "high", "critical"] = "medium"
    read: bool = False


# ---------------------------------------------------------------------------
# Survey Result
# ---------------------------------------------------------------------------


class SurveyResult(BaseModel):
    day_requested: int
    day_delivered: int
    cost: float = 20.0
    approval_by_area: dict[str, float]  # "East Ward": 62%
    top_concerns: list[tuple[str, float]]  # [("jobs", 43%), ("health", 38%)]
    silent_voter_mood: str  # LLM-generated summary
    overall_trend: Literal["improving", "stable", "declining"]


# ---------------------------------------------------------------------------
# Phone Game State — the full live game state
# ---------------------------------------------------------------------------


class PhoneGameState(BaseModel):
    """Complete game state for The Mayor's Phone."""

    game_id: str = Field(default_factory=lambda: str(uuid.uuid4())[:12])

    # REUSED from existing engine
    city_profile: CityProfile
    city_params: CityParameters
    citizens: list[Citizen]
    ministers: list[Minister]
    media_outlets: list[MediaOutletState]
    active_events: list[ActiveEvent] = Field(default_factory=list)
    treasury: float
    outstanding_debt: float = 0.0

    # NEW for Mayor's Phone
    current_day: int = 1
    total_days: int = 30
    phase: Literal["playing", "election", "game_over"] = "playing"

    # Conversation tracking
    citizen_threads: dict[str, CitizenThread] = Field(default_factory=dict)
    minister_threads: dict[str, list[ThreadMessage]] = Field(default_factory=dict)

    # Action & problem tracking
    active_actions: list[ActiveAction] = Field(default_factory=list)
    active_problems: list[ActiveProblem] = Field(default_factory=list)
    promises: list[Promise] = Field(default_factory=list)

    # Survey
    pending_survey: bool = False
    surveys: list[SurveyResult] = Field(default_factory=list)

    # Daily inbox (regenerated each day)
    current_inbox: list[InboxMessage] = Field(default_factory=list)

    # History
    approval_history: list[float] = Field(default_factory=list)
    daily_summaries: list[str] = Field(default_factory=list)

    # Tracking
    targeted_params: set[str] = Field(default_factory=set)
    loss_reason: str | None = None
    prng_seed: int = 42


# ---------------------------------------------------------------------------
# Complaint trigger configuration
# ---------------------------------------------------------------------------

COMPLAINT_THRESHOLDS: dict[str, list[dict[str, Any]]] = {
    "water_power_sanitation": [
        {"below": 45, "severity": "whisper", "msg_count": 1},
        {"below": 38, "severity": "growing", "msg_count": 2},
        {"below": 30, "severity": "crisis", "msg_count": 3},
    ],
    "hospitals_and_clinics": [
        {"below": 45, "severity": "whisper", "msg_count": 1},
        {"below": 35, "severity": "growing", "msg_count": 2},
        {"below": 25, "severity": "crisis", "msg_count": 3},
    ],
    "jobs_and_commerce": [
        {"below": 42, "severity": "whisper", "msg_count": 1},
        {"below": 35, "severity": "growing", "msg_count": 2},
        {"below": 28, "severity": "crisis", "msg_count": 3},
    ],
    "transit_and_roads": [
        {"below": 40, "severity": "whisper", "msg_count": 1},
        {"below": 32, "severity": "growing", "msg_count": 2},
        {"below": 25, "severity": "crisis", "msg_count": 3},
    ],
    "schools_and_universities": [
        {"below": 40, "severity": "whisper", "msg_count": 1},
        {"below": 33, "severity": "growing", "msg_count": 2},
        {"below": 25, "severity": "crisis", "msg_count": 3},
    ],
    "affordable_housing": [
        {"below": 40, "severity": "whisper", "msg_count": 1},
        {"below": 32, "severity": "growing", "msg_count": 2},
        {"below": 24, "severity": "crisis", "msg_count": 3},
    ],
    "police_and_emergency": [
        {"below": 42, "severity": "whisper", "msg_count": 1},
        {"below": 35, "severity": "growing", "msg_count": 2},
        {"below": 28, "severity": "crisis", "msg_count": 3},
    ],
    "community_and_spaces": [
        {"below": 38, "severity": "whisper", "msg_count": 1},
        {"below": 30, "severity": "growing", "msg_count": 2},
        {"below": 22, "severity": "crisis", "msg_count": 3},
    ],
    "environment_and_green": [
        {"below": 38, "severity": "whisper", "msg_count": 1},
        {"below": 28, "severity": "growing", "msg_count": 2},
        {"below": 20, "severity": "crisis", "msg_count": 3},
    ],
    "courts_and_justice": [
        {"below": 38, "severity": "whisper", "msg_count": 1},
        {"below": 28, "severity": "growing", "msg_count": 2},
        {"below": 20, "severity": "crisis", "msg_count": 3},
    ],
}

# Escalation timing (days at current severity before escalating)
ESCALATION_DAYS: dict[str, int] = {
    "whisper": 3,
    "growing": 3,
    "media": 2,
    "crisis": 3,
    "cascade": 3,
    "political": 999,  # doesn't escalate further
}

# Parameter cascade relationships
PARAM_CASCADES: dict[str, str] = {
    "water_power_sanitation": "hospitals_and_clinics",  # bad water → disease
    "hospitals_and_clinics": "jobs_and_commerce",  # sick workers → productivity
    "transit_and_roads": "jobs_and_commerce",  # can't commute → can't work
    "police_and_emergency": "community_and_spaces",  # unsafe → community decay
    "affordable_housing": "community_and_spaces",  # homelessness → social decay
    "schools_and_universities": "jobs_and_commerce",  # uneducated → unemployable
    "environment_and_green": "hospitals_and_clinics",  # pollution → health
}

# Human-readable param labels for prompts
PARAM_LABELS: dict[str, str] = {
    "water_power_sanitation": "water and sanitation",
    "hospitals_and_clinics": "healthcare",
    "jobs_and_commerce": "jobs and economy",
    "transit_and_roads": "roads and transport",
    "schools_and_universities": "education",
    "affordable_housing": "housing",
    "police_and_emergency": "safety and policing",
    "community_and_spaces": "community spaces",
    "environment_and_green": "environment",
    "courts_and_justice": "justice system",
    "admin_efficiency": "government efficiency",
    "anti_corruption": "anti-corruption",
    "media_freedom": "press freedom",
}

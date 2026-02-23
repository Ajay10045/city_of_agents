from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from llm.dynamic_policy import DynamicPolicy


@dataclass(frozen=True)
class AdvisorPersona:
    advisor_id: str
    name: str
    portfolios: list[str]
    style: str
    aliases: list[str] = field(default_factory=list)
    tone: str = ""
    voice_traits: list[str] = field(default_factory=list)
    conversational_habits: list[str] = field(default_factory=list)
    taboo_patterns: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "advisor_id": self.advisor_id,
            "name": self.name,
            "portfolios": list(self.portfolios),
            "style": self.style,
            "aliases": list(self.aliases),
            "tone": self.tone,
            "voice_traits": list(self.voice_traits),
            "conversational_habits": list(self.conversational_habits),
            "taboo_patterns": list(self.taboo_patterns),
        }


DEFAULT_ADVISORS: list[AdvisorPersona] = [
    AdvisorPersona(
        advisor_id="fiscal_growth",
        name="Asha Menon",
        portfolios=["treasury_balance", "employment_rate", "avg_wage", "connectivity"],
        style="Data-first growth strategist focused on delivery milestones.",
        aliases=["asha", "menon", "fiscal", "growth"],
        tone="calm_analytical",
        voice_traits=["uses concrete metrics", "keeps delivery-focused framing", "speaks in crisp tradeoffs"],
        conversational_habits=["opens with a direct answer", "adds one measurable next step"],
        taboo_patterns=["as an ai", "i cannot help"],
    ),
    AdvisorPersona(
        advisor_id="social_cohesion",
        name="Rehan Qureshi",
        portfolios=["park_density", "media_access", "hospital_capacity", "food_supply"],
        style="Community negotiator focused on trust and conflict de-escalation.",
        aliases=["rehan", "qureshi", "social", "cohesion"],
        tone="grounded_empathic",
        voice_traits=["centers people impact", "bridges disagreements calmly", "uses plain civic language"],
        conversational_habits=["acknowledges concern before advice", "keeps suggestions practical"],
        taboo_patterns=["as an ai", "i cannot help"],
    ),
    AdvisorPersona(
        advisor_id="governance_risk",
        name="Mira Rao",
        portfolios=["police_coverage", "recidivism_rate", "lighting_level", "media_access"],
        style="Risk hawk focused on integrity, enforcement, and narrative threats.",
        aliases=["mira", "rao", "governance", "risk"],
        tone="skeptical_guardrail",
        voice_traits=["flags downside risks early", "demands accountability steps", "prioritizes credibility safeguards"],
        conversational_habits=["states one critical risk", "suggests one mitigation"],
        taboo_patterns=["as an ai", "i cannot help"],
    ),
]


@dataclass
class AdvisorMessage:
    id: str
    role: str
    content: str
    thread_scope: str
    option_id: str | None
    timestamp: float
    structured: dict[str, Any] = field(default_factory=dict)
    speaker_advisor_id: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "role": self.role,
            "content": self.content,
            "thread_scope": self.thread_scope,
            "option_id": self.option_id,
            "timestamp": self.timestamp,
            "structured": dict(self.structured),
            "speaker_advisor_id": self.speaker_advisor_id,
        }


@dataclass
class AdvisorSession:
    advisor_session_id: str
    turn_number: int
    options: list[DynamicPolicy]
    advisors: list[AdvisorPersona] = field(default_factory=lambda: list(DEFAULT_ADVISORS))
    global_thread: list[AdvisorMessage] = field(default_factory=list)
    option_threads: dict[str, list[AdvisorMessage]] = field(default_factory=dict)
    global_memory_summary: str = ""
    global_memory_anchor_message_id: str | None = None
    option_memory_summary: dict[str, str] = field(default_factory=dict)
    option_memory_anchor_message_id: dict[str, str] = field(default_factory=dict)
    session_status: str = "ready"
    option_source: str = "live"
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    def append_message(
        self,
        role: str,
        content: str,
        thread_scope: str,
        option_id: str | None,
        structured: dict[str, Any] | None = None,
        speaker_advisor_id: str | None = None,
    ) -> AdvisorMessage:
        msg = AdvisorMessage(
            id=str(uuid.uuid4()),
            role=role,
            content=content,
            thread_scope=thread_scope,
            option_id=option_id,
            timestamp=time.time(),
            structured=dict(structured or {}),
            speaker_advisor_id=speaker_advisor_id,
        )
        if thread_scope == "option" and option_id:
            self.option_threads.setdefault(option_id, []).append(msg)
        else:
            self.global_thread.append(msg)
        self.updated_at = msg.timestamp
        return msg

    def ensure_option_threads(self) -> None:
        option_ids = {option.id for option in self.options}
        self.option_threads = {
            option_id: thread
            for option_id, thread in self.option_threads.items()
            if option_id in option_ids
        }
        self.option_memory_summary = {
            option_id: summary
            for option_id, summary in self.option_memory_summary.items()
            if option_id in option_ids
        }
        self.option_memory_anchor_message_id = {
            option_id: anchor_id
            for option_id, anchor_id in self.option_memory_anchor_message_id.items()
            if option_id in option_ids
        }
        for option_id in option_ids:
            self.option_threads.setdefault(option_id, [])
            self.option_memory_summary.setdefault(option_id, "")
            self.option_memory_anchor_message_id.setdefault(option_id, "")

    def to_dict(self) -> dict[str, Any]:
        self.ensure_option_threads()
        return {
            "advisor_session_id": self.advisor_session_id,
            "turn_number": self.turn_number,
            "options": [option.to_dict() for option in self.options],
            "advisors": [advisor.to_dict() for advisor in self.advisors],
            "global_thread": [message.to_dict() for message in self.global_thread],
            "option_threads": {
                option_id: [message.to_dict() for message in messages]
                for option_id, messages in self.option_threads.items()
            },
            "global_memory_summary": self.global_memory_summary,
            "global_memory_anchor_message_id": self.global_memory_anchor_message_id,
            "option_memory_summary": dict(self.option_memory_summary),
            "option_memory_anchor_message_id": dict(self.option_memory_anchor_message_id),
            "session_status": self.session_status,
            "option_source": self.option_source,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


def new_advisor_session(
    turn_number: int,
    options: list[DynamicPolicy],
    advisors: list[AdvisorPersona] | None = None,
) -> AdvisorSession:
    session = AdvisorSession(
        advisor_session_id=str(uuid.uuid4()),
        turn_number=turn_number,
        options=list(options),
        advisors=list(advisors) if advisors else list(DEFAULT_ADVISORS),
        session_status="ready",
        option_source="live",
    )
    session.ensure_option_threads()
    return session

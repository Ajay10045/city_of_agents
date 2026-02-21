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

    def to_dict(self) -> dict[str, Any]:
        return {
            "advisor_id": self.advisor_id,
            "name": self.name,
            "portfolios": list(self.portfolios),
            "style": self.style,
        }


DEFAULT_ADVISORS: list[AdvisorPersona] = [
    AdvisorPersona(
        advisor_id="fiscal_growth",
        name="Asha Menon",
        portfolios=["economy", "employment", "infrastructure"],
        style="Data-first growth strategist focused on delivery milestones.",
    ),
    AdvisorPersona(
        advisor_id="social_cohesion",
        name="Rehan Qureshi",
        portfolios=["social_cohesion", "public_trust", "services"],
        style="Community negotiator focused on trust and conflict de-escalation.",
    ),
    AdvisorPersona(
        advisor_id="governance_risk",
        name="Mira Rao",
        portfolios=["corruption", "law_and_order", "media"],
        style="Risk hawk focused on integrity, enforcement, and narrative threats.",
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
        for option_id in option_ids:
            self.option_threads.setdefault(option_id, [])

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
            "session_status": self.session_status,
            "option_source": self.option_source,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


def new_advisor_session(turn_number: int, options: list[DynamicPolicy]) -> AdvisorSession:
    session = AdvisorSession(
        advisor_session_id=str(uuid.uuid4()),
        turn_number=turn_number,
        options=list(options),
        advisors=list(DEFAULT_ADVISORS),
        session_status="ready",
        option_source="live",
    )
    session.ensure_option_threads()
    return session

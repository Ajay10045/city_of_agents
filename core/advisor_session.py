from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from llm.dynamic_policy import DynamicPolicy


@dataclass
class AdvisorMessage:
    id: str
    role: str
    content: str
    thread_scope: str
    option_id: str | None
    timestamp: float
    structured: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "role": self.role,
            "content": self.content,
            "thread_scope": self.thread_scope,
            "option_id": self.option_id,
            "timestamp": self.timestamp,
            "structured": dict(self.structured),
        }


@dataclass
class AdvisorSession:
    advisor_session_id: str
    turn_number: int
    options: list[DynamicPolicy]
    global_thread: list[AdvisorMessage] = field(default_factory=list)
    option_threads: dict[str, list[AdvisorMessage]] = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    def append_message(
        self,
        role: str,
        content: str,
        thread_scope: str,
        option_id: str | None,
        structured: dict[str, Any] | None = None,
    ) -> AdvisorMessage:
        msg = AdvisorMessage(
            id=str(uuid.uuid4()),
            role=role,
            content=content,
            thread_scope=thread_scope,
            option_id=option_id,
            timestamp=time.time(),
            structured=dict(structured or {}),
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
            "global_thread": [message.to_dict() for message in self.global_thread],
            "option_threads": {
                option_id: [message.to_dict() for message in messages]
                for option_id, messages in self.option_threads.items()
            },
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


def new_advisor_session(turn_number: int, options: list[DynamicPolicy]) -> AdvisorSession:
    session = AdvisorSession(
        advisor_session_id=str(uuid.uuid4()),
        turn_number=turn_number,
        options=list(options),
    )
    session.ensure_option_threads()
    return session

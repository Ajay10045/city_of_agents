from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class LLMCompletionRequest:
    system_prompt: str
    user_prompt: str
    schema: dict[str, Any] | None = None
    model: str | None = None
    temperature: float | None = None
    max_tokens: int | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class LLMCompletionResponse:
    provider: str
    model: str
    text: str
    parsed: dict[str, Any]
    usage: dict[str, Any] = field(default_factory=dict)


class LLMProviderError(RuntimeError):
    pass


class LLMResponseParseError(LLMProviderError):
    pass


class LLMProviderNotAvailableError(LLMProviderError):
    pass

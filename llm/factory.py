from __future__ import annotations

import json

from llm.base import LLMProvider
from llm.config import LLMSettings
from llm.types import (
    LLMCompletionRequest,
    LLMCompletionResponse,
    LLMProviderNotAvailableError,
)


class MockProvider(LLMProvider):
    name = "mock"

    def __init__(self, settings: LLMSettings) -> None:
        self._settings = settings

    def complete(self, request: LLMCompletionRequest) -> LLMCompletionResponse:
        payload = {
            "emotion": "neutral",
            "action": "observe",
            "alignment_delta": 0.0,
            "radicalization_delta": 0.0,
            "trust_delta": 0.0,
            "statement": "Monitoring city conditions.",
            "rumor": None,
        }
        text = json.dumps(payload)
        return LLMCompletionResponse(
            provider=self.name,
            model=request.model or self._settings.model,
            text=text,
            parsed=payload,
            usage={"mock": True},
        )


def create_provider(settings: LLMSettings) -> LLMProvider:
    provider = settings.provider.strip().lower()

    if provider == "mock":
        return MockProvider(settings)

    if provider in {"anthropic", "openai", "ollama"}:
        raise LLMProviderNotAvailableError(
            f"Provider '{provider}' is configured but not implemented yet. "
            "Use LLM_PROVIDER=mock for development until provider adapters are added."
        )

    raise LLMProviderNotAvailableError(f"Unsupported LLM provider: {settings.provider}")

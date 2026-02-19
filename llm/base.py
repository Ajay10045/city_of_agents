from __future__ import annotations

import json
from abc import ABC, abstractmethod
from typing import Any

from llm.types import LLMCompletionRequest, LLMCompletionResponse, LLMResponseParseError


class LLMProvider(ABC):
    name: str = "unknown"

    @abstractmethod
    def complete(self, request: LLMCompletionRequest) -> LLMCompletionResponse:
        raise NotImplementedError

    @staticmethod
    def parse_json_payload(raw_text: str) -> dict[str, Any]:
        try:
            payload = json.loads(raw_text)
        except json.JSONDecodeError as exc:
            raise LLMResponseParseError(f"Provider response was not valid JSON: {exc}") from exc

        if not isinstance(payload, dict):
            raise LLMResponseParseError("Provider response JSON must be an object")

        return payload

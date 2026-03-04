from __future__ import annotations

import ast
import json
import os
from typing import Any
from pathlib import Path


def _load_env() -> None:
    """Load environment variables from .env file if present."""
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())


_load_env()

# ---------------------------------------------------------------------------
# Supported providers:
#   openai    — OpenAI API (gpt-4o, gpt-4o-mini, …)
#   anthropic — Anthropic API (claude-* models)
#   deepseek  — DeepSeek API, OpenAI-compatible (deepseek-chat, deepseek-reasoner)
#   ollama    — Local Ollama server, OpenAI-compatible (any local model)
# ---------------------------------------------------------------------------

_DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1"


class LLMClient:
    """Multi-provider LLM client.

    Reads configuration from environment variables (or .env):
        LLM_PROVIDER   — openai | anthropic | deepseek | ollama  (default: ollama)
        LLM_MODEL      — model name appropriate for the chosen provider
        LLM_TEMPERATURE — sampling temperature                    (default: 0.8)
        LLM_MAX_TOKENS  — max output tokens for Anthropic/DeepSeek (default: 2500)

    Provider-specific keys:
        OPENAI_API_KEY       — for openai
        ANTHROPIC_API_KEY    — for anthropic
        DEEPSEEK_API_KEY     — for deepseek
        LLM_API_KEY          — fallback for any provider
        OLLAMA_BASE_URL      — Ollama server URL (default: http://localhost:11434/v1)
    """

    def __init__(self, model: str | None = None) -> None:
        self.provider = os.environ.get("LLM_PROVIDER", "ollama").strip().lower()
        self.model = model or os.environ.get("LLM_MODEL", "mistral:latest")
        self.temperature = float(os.environ.get("LLM_TEMPERATURE", "0.8"))
        self.max_tokens = int(os.environ.get("LLM_MAX_TOKENS", "2500"))

        if self.provider == "openai":
            from openai import OpenAI
            api_key = os.environ.get("LLM_API_KEY") or os.environ.get("OPENAI_API_KEY")
            if not api_key:
                raise RuntimeError("Missing OPENAI_API_KEY (or LLM_API_KEY) in environment")
            self.client = OpenAI(api_key=api_key)

        elif self.provider == "anthropic":
            from anthropic import Anthropic
            api_key = os.environ.get("LLM_API_KEY") or os.environ.get("ANTHROPIC_API_KEY")
            if not api_key:
                raise RuntimeError("Missing ANTHROPIC_API_KEY (or LLM_API_KEY) in environment")
            self.client = Anthropic(api_key=api_key)

        elif self.provider == "deepseek":
            from openai import OpenAI
            api_key = os.environ.get("LLM_API_KEY") or os.environ.get("DEEPSEEK_API_KEY")
            if not api_key:
                raise RuntimeError("Missing DEEPSEEK_API_KEY (or LLM_API_KEY) in environment")
            self.client = OpenAI(base_url=_DEEPSEEK_BASE_URL, api_key=api_key)

        elif self.provider == "ollama":
            from openai import OpenAI
            base_url = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434/v1")
            self.client = OpenAI(base_url=base_url, api_key="ollama")

        else:
            raise RuntimeError(
                f"Unsupported LLM_PROVIDER={self.provider!r}. "
                "Use 'openai', 'anthropic', 'deepseek', or 'ollama'."
            )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _strip_code_fences(text: str) -> str:
        cleaned = text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
        return cleaned.strip()

    @staticmethod
    def _extract_json_candidate(text: str) -> str:
        """Return the first balanced JSON object or array found in *text*."""
        start = -1
        stack: list[str] = []
        in_string = False
        quote_char = ""
        escaped = False

        for idx, ch in enumerate(text):
            if start < 0:
                if ch in "{[":
                    start = idx
                    stack.append(ch)
                continue

            if in_string:
                if escaped:
                    escaped = False
                    continue
                if ch == "\\":
                    escaped = True
                    continue
                if ch == quote_char:
                    in_string = False
                continue

            if ch in {'"', "'"}:
                in_string = True
                quote_char = ch
            elif ch in "{[":
                stack.append(ch)
            elif ch in "}]":
                if not stack:
                    break
                opener = stack.pop()
                if (opener == "{" and ch != "}") or (opener == "[" and ch != "]"):
                    break
                if not stack and start >= 0:
                    return text[start : idx + 1]

        return ""

    @classmethod
    def _parse_json_object(cls, raw: str) -> dict[str, Any]:
        cleaned = cls._strip_code_fences(raw)
        candidates = [cleaned]
        extracted = cls._extract_json_candidate(cleaned)
        if extracted and extracted != cleaned:
            candidates.append(extracted)

        for candidate in candidates:
            try:
                parsed = json.loads(candidate)
                if isinstance(parsed, dict):
                    return parsed
            except json.JSONDecodeError:
                pass
            try:
                parsed = ast.literal_eval(candidate)
                if isinstance(parsed, dict):
                    return parsed
            except (ValueError, SyntaxError):
                pass

        raise ValueError("LLM returned invalid JSON object")

    @staticmethod
    def _extract_anthropic_text(response: Any) -> str:
        parts: list[str] = []
        for block in getattr(response, "content", []):
            if getattr(block, "type", None) == "text":
                parts.append(getattr(block, "text", ""))
        return "\n".join(parts).strip()

    def _repair_json_response(self, raw: str) -> dict[str, Any]:
        """Ask the LLM to repair a malformed JSON response."""
        repair_system = (
            "You are a strict JSON formatter. "
            "Return only one valid JSON object with double-quoted keys and strings."
        )
        repair_user = (
            "Rewrite the following content as strict JSON only, preserving meaning. "
            "Do not add explanation.\n\n" + raw
        )

        if self.provider in {"openai", "deepseek"}:
            response = self.client.chat.completions.create(
                model=self.model,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": repair_system},
                    {"role": "user", "content": repair_user},
                ],
                temperature=0,
            )
            return self._parse_json_object(response.choices[0].message.content)

        if self.provider == "ollama":
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": repair_system + "\n\nReturn ONLY a valid JSON object."},
                    {"role": "user", "content": repair_user},
                ],
                temperature=0,
            )
            return self._parse_json_object(response.choices[0].message.content)

        # anthropic
        response = self.client.messages.create(
            model=self.model,
            system=repair_system,
            messages=[{"role": "user", "content": repair_user}],
            temperature=0,
            max_tokens=self.max_tokens,
        )
        return self._parse_json_object(self._extract_anthropic_text(response))

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def chat(self, system: str, user: str) -> dict[str, Any]:
        """Send a prompt and return a parsed JSON dict.

        Raises ValueError if the response cannot be parsed even after repair.
        """
        if self.provider in {"openai", "deepseek"}:
            response = self.client.chat.completions.create(
                model=self.model,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                temperature=self.temperature,
            )
            raw = response.choices[0].message.content

        elif self.provider == "ollama":
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system + "\n\nReturn ONLY a valid JSON object."},
                    {"role": "user", "content": user},
                ],
                temperature=self.temperature,
            )
            raw = response.choices[0].message.content

        else:  # anthropic
            response = self.client.messages.create(
                model=self.model,
                system=system + "\n\nReturn ONLY a valid JSON object.",
                messages=[{"role": "user", "content": user}],
                temperature=self.temperature,
                max_tokens=self.max_tokens,
            )
            raw = self._extract_anthropic_text(response)

        try:
            return self._parse_json_object(raw)
        except ValueError:
            return self._repair_json_response(raw)

    def chat_text(self, system: str, user: str) -> str:
        """Send a prompt and return plain text (no JSON parsing)."""
        if self.provider in {"openai", "deepseek", "ollama"}:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                temperature=self.temperature,
            )
            return response.choices[0].message.content or ""

        # anthropic
        response = self.client.messages.create(
            model=self.model,
            system=system,
            messages=[{"role": "user", "content": user}],
            temperature=self.temperature,
            max_tokens=self.max_tokens,
        )
        return self._extract_anthropic_text(response)

    def chat_text_stream(self, system: str, user: str):
        """Send a prompt and yield text chunks as they arrive."""
        if self.provider in {"openai", "deepseek", "ollama"}:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                temperature=self.temperature,
                stream=True,
            )
            for chunk in response:
                delta = chunk.choices[0].delta if chunk.choices else None
                if delta and delta.content:
                    yield delta.content

        else:  # anthropic
            with self.client.messages.stream(
                model=self.model,
                system=system,
                messages=[{"role": "user", "content": user}],
                temperature=self.temperature,
                max_tokens=self.max_tokens,
            ) as stream:
                for text in stream.text_stream:
                    yield text

    def chat_messages(self, messages: list[dict[str, str]]) -> str:
        """Multi-turn chat. Returns plain text.

        messages — list of dicts with 'role' ('system'|'user'|'assistant') and 'content'.
        The first message may be a system message; subsequent messages alternate user/assistant.
        """
        if self.provider in {"openai", "deepseek", "ollama"}:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=self.temperature,
            )
            return response.choices[0].message.content or ""

        # anthropic: separate system from conversation messages
        system_parts = [m["content"] for m in messages if m["role"] == "system"]
        convo = [m for m in messages if m["role"] != "system"]
        system_text = "\n\n".join(system_parts) if system_parts else "You are a helpful assistant."

        response = self.client.messages.create(
            model=self.model,
            system=system_text,
            messages=convo,
            temperature=self.temperature,
            max_tokens=self.max_tokens,
        )
        return self._extract_anthropic_text(response)

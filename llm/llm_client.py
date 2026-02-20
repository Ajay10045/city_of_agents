from __future__ import annotations

import ast
import json
import os
from typing import Any
from pathlib import Path


def _load_env() -> None:
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


class LLMClient:
    def __init__(self, model: str | None = None) -> None:
        self.provider = os.environ.get("LLM_PROVIDER", "openai").strip().lower()
        self.model = model or os.environ.get("LLM_MODEL", "gpt-4o")
        self.temperature = float(os.environ.get("LLM_TEMPERATURE", "0.8"))
        self.max_tokens = int(os.environ.get("LLM_MAX_TOKENS", "2500"))

        if self.provider == "openai":
            from openai import OpenAI

            api_key = os.environ.get("LLM_API_KEY") or os.environ.get("OPENAI_API_KEY")
            if not api_key:
                raise RuntimeError("Missing OPENAI_API_KEY (or LLM_API_KEY) in environment")
            self.client = OpenAI(api_key=api_key)
        elif self.provider == "ollama":
            from openai import OpenAI

            base_url = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434/v1")
            self.client = OpenAI(base_url=base_url, api_key="ollama")
        elif self.provider == "anthropic":
            from anthropic import Anthropic

            api_key = os.environ.get("LLM_API_KEY") or os.environ.get("ANTHROPIC_API_KEY")
            if not api_key:
                raise RuntimeError("Missing ANTHROPIC_API_KEY (or LLM_API_KEY) in environment")
            self.client = Anthropic(api_key=api_key)
        else:
            raise RuntimeError(
                f"Unsupported LLM_PROVIDER={self.provider!r}. Use 'openai', 'anthropic', or 'ollama'."
            )

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
        """Extract the first balanced JSON-like object/array substring from text."""
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
        """Use the configured provider once to repair malformed JSON output."""
        repair_system = (
            "You are a strict JSON formatter. "
            "Return only one valid JSON object with double-quoted keys and strings."
        )
        repair_user = (
            "Rewrite the following content as strict JSON only, preserving meaning. "
            "Do not add explanation.\n\n"
            f"{raw}"
        )

        if self.provider == "openai":
            response = self.client.chat.completions.create(
                model=self.model,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": repair_system},
                    {"role": "user", "content": repair_user},
                ],
                temperature=0,
            )
            repaired_raw = response.choices[0].message.content
            return self._parse_json_object(repaired_raw)

        if self.provider == "ollama":
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": repair_system + "\n\nReturn ONLY a valid JSON object.",
                    },
                    {"role": "user", "content": repair_user},
                ],
                temperature=0,
            )
            repaired_raw = response.choices[0].message.content
            return self._parse_json_object(repaired_raw)

        response = self.client.messages.create(
            model=self.model,
            system=repair_system,
            messages=[{"role": "user", "content": repair_user}],
            temperature=0,
            max_tokens=self.max_tokens,
        )
        repaired_raw = self._extract_anthropic_text(response)
        return self._parse_json_object(repaired_raw)

    def chat(self, system: str, user: str) -> dict:
        """Call LLM and return parsed JSON dict. Raises on failure."""
        if self.provider == "openai":
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
            try:
                return self._parse_json_object(raw)
            except ValueError:
                return self._repair_json_response(raw)

        if self.provider == "ollama":
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system + "\n\nReturn ONLY a valid JSON object."},
                    {"role": "user", "content": user},
                ],
                temperature=self.temperature,
            )
            raw = response.choices[0].message.content
            try:
                return self._parse_json_object(raw)
            except ValueError:
                return self._repair_json_response(raw)

        # anthropic path
        response = self.client.messages.create(
            model=self.model,
            system=(
                system
                + "\n\nReturn ONLY a valid JSON object."
            ),
            messages=[{"role": "user", "content": user}],
            temperature=self.temperature,
            max_tokens=self.max_tokens,
        )
        raw = self._extract_anthropic_text(response)
        try:
            return self._parse_json_object(raw)
        except ValueError:
            return self._repair_json_response(raw)

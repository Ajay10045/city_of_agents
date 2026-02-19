from __future__ import annotations

import json
import os
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
        from openai import OpenAI
        self.client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
        self.model = model or os.environ.get("LLM_MODEL", "gpt-4o")

    def chat(self, system: str, user: str) -> dict:
        """Call LLM and return parsed JSON dict. Raises on failure."""
        response = self.client.chat.completions.create(
            model=self.model,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.8,
        )
        return json.loads(response.choices[0].message.content)

    def chat_text(self, system: str, user: str) -> str:
        """Call LLM and return raw text."""
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.8,
        )
        return response.choices[0].message.content

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping


@dataclass(frozen=True)
class LLMSettings:
    provider: str
    model: str
    api_key: str | None = None
    timeout_seconds: float = 20.0
    max_retries: int = 2
    temperature: float = 0.2
    max_tokens: int = 600


def _load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    raw = json.loads(path.read_text(encoding="utf-8"))
    return raw if isinstance(raw, dict) else {}


def load_llm_settings(
    config_path: str | Path | None = None,
    env: Mapping[str, str] | None = None,
) -> LLMSettings:
    if config_path is None:
        root = Path(__file__).resolve().parents[1]
        config_path = root / "config" / "llm.json"

    cfg = _load_json(Path(config_path))
    environment = env or os.environ

    provider = environment.get("LLM_PROVIDER", str(cfg.get("provider", "anthropic"))).strip()
    model = environment.get(
        "LLM_MODEL",
        str(cfg.get("model", "claude-3-5-sonnet-latest")),
    ).strip()

    api_key = environment.get("LLM_API_KEY") or cfg.get("api_key")
    timeout_seconds = float(environment.get("LLM_TIMEOUT_SECONDS", cfg.get("timeout_seconds", 20.0)))
    max_retries = int(environment.get("LLM_MAX_RETRIES", cfg.get("max_retries", 2)))
    temperature = float(environment.get("LLM_TEMPERATURE", cfg.get("temperature", 0.2)))
    max_tokens = int(environment.get("LLM_MAX_TOKENS", cfg.get("max_tokens", 600)))

    return LLMSettings(
        provider=provider,
        model=model,
        api_key=api_key,
        timeout_seconds=timeout_seconds,
        max_retries=max_retries,
        temperature=temperature,
        max_tokens=max_tokens,
    )

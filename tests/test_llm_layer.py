from __future__ import annotations

from pathlib import Path

import pytest

from llm.config import load_llm_settings
from llm.factory import MockProvider, create_provider
from llm.types import LLMCompletionRequest, LLMProviderNotAvailableError


def test_load_llm_settings_from_file_and_env_override(tmp_path: Path) -> None:
    cfg = tmp_path / "llm.json"
    cfg.write_text(
        """
{
  "provider": "anthropic",
  "model": "claude-file",
  "temperature": 0.1,
  "max_tokens": 321
}
""".strip(),
        encoding="utf-8",
    )

    settings = load_llm_settings(
        config_path=cfg,
        env={
            "LLM_PROVIDER": "mock",
            "LLM_MODEL": "mock-model",
            "LLM_MAX_TOKENS": "777",
        },
    )

    assert settings.provider == "mock"
    assert settings.model == "mock-model"
    assert settings.max_tokens == 777
    assert settings.temperature == 0.1


def test_create_provider_mock() -> None:
    settings = load_llm_settings(env={"LLM_PROVIDER": "mock", "LLM_MODEL": "m1"})
    provider = create_provider(settings)

    assert isinstance(provider, MockProvider)

    response = provider.complete(
        LLMCompletionRequest(
            system_prompt="sys",
            user_prompt="user",
        )
    )
    assert response.provider == "mock"
    assert response.parsed["action"] == "observe"


def test_create_provider_unimplemented_raises() -> None:
    settings = load_llm_settings(env={"LLM_PROVIDER": "anthropic"})
    with pytest.raises(LLMProviderNotAvailableError):
        create_provider(settings)

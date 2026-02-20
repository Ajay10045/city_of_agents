from __future__ import annotations

import sys
import types

import pytest

from llm.llm_client import LLMClient


def _install_fake_openai(monkeypatch: pytest.MonkeyPatch, response_content: str = '{"ok": true}'):
    class FakeOpenAI:
        last_init_kwargs: dict | None = None
        last_create_kwargs: dict | None = None
        next_response_content: str = response_content

        def __init__(self, **kwargs):
            type(self).last_init_kwargs = kwargs
            self.chat = types.SimpleNamespace(
                completions=types.SimpleNamespace(create=self._create)
            )

        def _create(self, **kwargs):
            type(self).last_create_kwargs = kwargs
            return types.SimpleNamespace(
                choices=[
                    types.SimpleNamespace(
                        message=types.SimpleNamespace(content=type(self).next_response_content)
                    )
                ]
            )

    monkeypatch.setitem(sys.modules, "openai", types.SimpleNamespace(OpenAI=FakeOpenAI))
    return FakeOpenAI


def test_ollama_init_uses_base_url_and_dummy_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_openai = _install_fake_openai(monkeypatch)
    monkeypatch.setenv("LLM_PROVIDER", "ollama")
    monkeypatch.setenv("OLLAMA_BASE_URL", "http://localhost:11434/v1")

    _ = LLMClient(model="mistral:latest")

    assert fake_openai.last_init_kwargs == {
        "base_url": "http://localhost:11434/v1",
        "api_key": "ollama",
    }


def test_ollama_chat_avoids_response_format_and_uses_json_instruction(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_openai = _install_fake_openai(monkeypatch, response_content='{"decision": "approve"}')
    monkeypatch.setenv("LLM_PROVIDER", "ollama")

    client = LLMClient(model="mistral:latest")
    payload = client.chat("System prompt", "User prompt")

    assert payload["decision"] == "approve"
    assert fake_openai.last_create_kwargs is not None
    assert "response_format" not in fake_openai.last_create_kwargs
    assert fake_openai.last_create_kwargs["messages"][0]["content"].endswith(
        "Return ONLY a valid JSON object."
    )


def test_ollama_repair_avoids_response_format(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_openai = _install_fake_openai(monkeypatch, response_content='{"fixed": true}')
    monkeypatch.setenv("LLM_PROVIDER", "ollama")

    client = LLMClient(model="mistral:latest")
    repaired = client._repair_json_response("{not: json}")

    assert repaired["fixed"] is True
    assert fake_openai.last_create_kwargs is not None
    assert "response_format" not in fake_openai.last_create_kwargs
    assert fake_openai.last_create_kwargs["messages"][0]["content"].endswith(
        "Return ONLY a valid JSON object."
    )


def test_unknown_provider_still_fails_fast(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LLM_PROVIDER", "not-a-provider")
    with pytest.raises(RuntimeError, match="Unsupported LLM_PROVIDER"):
        LLMClient()

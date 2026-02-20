from __future__ import annotations

import pytest

from llm.llm_client import LLMClient


def test_parse_json_object_accepts_strict_json() -> None:
    payload = LLMClient._parse_json_object('{"policies": [{"name": "A"}]}')
    assert payload["policies"][0]["name"] == "A"


def test_parse_json_object_accepts_fenced_relaxed_json() -> None:
    raw = """```json
{'policy': {'name': 'X', 'effects': {'economy': 2,},},}
```"""
    payload = LLMClient._parse_json_object(raw)
    assert payload["policy"]["name"] == "X"
    assert payload["policy"]["effects"]["economy"] == 2


def test_parse_json_object_extracts_object_from_prose() -> None:
    raw = "Model response:\\nHere is your object:\\n{'generate': True, 'event': {'name': 'Flood'}}\\nDone."
    payload = LLMClient._parse_json_object(raw)
    assert payload["generate"] is True
    assert payload["event"]["name"] == "Flood"


def test_parse_json_object_raises_for_non_json_text() -> None:
    with pytest.raises(ValueError):
        LLMClient._parse_json_object("this is not json and has no object")

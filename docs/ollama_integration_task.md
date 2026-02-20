# Task: Add Ollama as a Third LLM Provider

## Context

- The project is a city simulation game (`city_of_agents`) that calls an LLM for 5000 agents — OpenAI/Anthropic is too expensive for development.
- Ollama is installed locally (v0.9.6) with `mistral:latest` already downloaded.
- The machine is an **M4 Pro 24GB Mac** — can comfortably run models up to ~14B params.
- Ollama exposes an **OpenAI-compatible API** at `http://localhost:11434/v1`, so no new pip dependencies are needed.

---

## Files to Change

### 1. `llm/llm_client.py`

- In `LLMClient.__init__`, add a third `elif self.provider == "ollama"` branch that instantiates the existing `OpenAI` client with:
  - `base_url` read from `OLLAMA_BASE_URL` env var, falling back to `"http://localhost:11434/v1"`
  - `api_key="ollama"` (Ollama ignores the key)
- Remove the hardcoded `raise` that currently rejects unknown providers.
- In the `chat()` method, add an `elif self.provider == "ollama"` path that does **not** pass `response_format={"type": "json_object"}` (not all Ollama models support it). Instead, append `"\n\nReturn ONLY a valid JSON object."` to the system prompt — same approach as the existing Anthropic path.
- In `_repair_json_response()`, add an `elif self.provider == "ollama"` branch identical to the OpenAI repair path but without `response_format`.

### 2. `.env`

Add the following example lines (commented out so existing Anthropic config stays active):

```env
# --- Ollama (free local dev) ---
# LLM_PROVIDER=ollama
# LLM_MODEL=qwen2.5:14b            # low-volume: mayor advisor, opposition agent
# LLM_DEBATE_MODEL=llama3.2:3b     # high-volume: citizen debates, event generation
# OLLAMA_BASE_URL=http://localhost:11434/v1
```

### 3. `pyproject.toml`

No changes needed — the `openai` package already handles Ollama calls via `base_url`.

---

## Constraints

- Keep full backward compatibility — existing `openai` and `anthropic` paths must not change.
- Use `OLLAMA_BASE_URL` env var with fallback to `http://localhost:11434/v1`.
- Do **not** pass `response_format` for the Ollama path; guide JSON output via the system prompt instead.

---

## Recommended Models for M4 Pro 24GB

| Use Case | Model | Size | Notes |
|---|---|---|---|
| High-volume (debates, events) | `llama3.2:3b` | ~2 GB | Fastest, fits many parallel calls |
| High-volume (debates, events) | `mistral:latest` | 4.4 GB | Already downloaded |
| Balanced | `qwen2.5:7b` | ~5 GB | Best JSON reliability at small size |
| Low-volume (mayor, opposition) | `qwen2.5:14b` | ~9 GB | Near GPT-4o-mini quality |
| Max quality | `qwen2.5:32b` | ~20 GB | Fits in 24GB, but slow |

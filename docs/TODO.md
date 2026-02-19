# City of Power - TODO / Implementation Roadmap

This roadmap is optimized for collaboration and fast delivery of a provider-agnostic LLM layer.

Legend:

- Status: `todo` | `in-progress` | `blocked` | `done`
- Owner: `@ajay` (default) or `@contrib`
- Effort: `S` (0.5-1 day), `M` (2-3 days), `L` (4-7 days)

---

## Milestone M1 (Combined P0 + P1) - Foundation + LLM Core

Goal: keep the app stable for contributors while enabling Anthropic-first, provider-agnostic LLM integration.

Target output:

1. Reproducible local setup and CI.
2. Provider abstraction with Anthropic implementation.
3. Simulation modes `rule | hybrid | llm`.
4. Initial agent thought/action trace in API + UI.

---

## A) Stability + Collaboration Baseline (P0)

### A1. Local run verification checklist

- [ ] `todo` | owner: `@ajay` | effort: `S`
  - [ ] Fresh clone runbook validated on a clean shell
  - [ ] Backend starts: `uv run uvicorn api.main:app --reload --port 8000`
  - [ ] Frontend starts: `cd ui && npm run dev`
  - [ ] UI successfully calls `POST /api/simulate`

### A2. CI + quality gates

- [ ] `todo` | owner: `@contrib` | effort: `M`
  - [ ] Add GitHub Action for Python tests
  - [ ] Add GitHub Action for frontend build check
  - [ ] Add markdown lint / basic repo lint checks

### A3. Dependency and config hygiene

- [ ] `todo` | owner: `@ajay` | effort: `S`
  - [ ] Keep `pyproject.toml` as source of truth
  - [ ] Keep `requirements.txt` as temporary compatibility shim (remove later)
  - [x] Add `.env.example` with LLM-related environment variables

---

## B) Provider-Agnostic LLM Layer (P1)

### B1. LLM abstraction module

- [x] `done` | owner: `@ajay` | effort: `M`
  - [x] Add `llm/` package
  - [x] Define interface `LLMProvider.complete(system_prompt, user_prompt, schema, model, temperature)`
  - [x] Add standard request/response dataclasses

### B2. Anthropic provider (first implementation)

- [ ] `todo` | owner: `@ajay` | effort: `M`
  - [ ] Add Anthropic SDK dependency
  - [ ] Implement `AnthropicProvider`
  - [ ] Enforce structured JSON output and validation
  - [ ] Add retries/timeouts and clear error classes

### B3. Provider config switching

- [ ] `todo` | owner: `@contrib` | effort: `S`
  - [x] Add `config/llm.json` defaults
  - [ ] Support env overrides: `LLM_PROVIDER`, `LLM_MODEL`, `LLM_API_KEY`
  - [ ] Add startup validation for missing key/provider mismatch

### B4. Next providers (after Anthropic)

- [ ] `todo` | owner: `@contrib` | effort: `M`
  - [ ] `OpenAIProvider`
  - [ ] `OllamaProvider`

---

## C) LLM Agent Simulation Slice (M1 feature core)

### C1. Simulation mode toggle

- [ ] `todo` | owner: `@ajay` | effort: `S`
  - [ ] Add `mode` in API request: `rule | hybrid | llm`
  - [ ] Default to `rule` to preserve current behavior

### C2. Hybrid execution path

- [ ] `todo` | owner: `@ajay` | effort: `M`
  - [ ] Add `llm_agent_engine.py`
  - [ ] In `hybrid`, run LLM for sampled/leader agents and rule engine for rest
  - [ ] Add robust fallback to rule engine if provider fails

### C3. Agent output schema

- [ ] `todo` | owner: `@ajay` | effort: `S`
  - [ ] Define fields: `emotion`, `action`, `alignment_delta`, `radicalization_delta`, `trust_delta`, `statement`, `rumor`
  - [ ] Validate all outputs before applying state changes

---

## D) UI Visibility of Agent Cognition (M1 completion)

### D1. Minimal thought/action feed

- [ ] `todo` | owner: `@contrib` | effort: `M`
  - [ ] Add API response section for sampled `agent_traces`
  - [ ] Add UI panel showing agent statements/actions by turn
  - [ ] Basic filters: role and identity group

### D2. Explainability panel

- [ ] `todo` | owner: `@contrib` | effort: `M`
  - [ ] "Why changed this turn" summary
  - [ ] Show top event/media/policy contributors

---

## Dependencies Map

- B1 -> B2 -> C2
- C1 -> C2
- C3 -> C2
- C2 -> D1
- A2 can run in parallel with B1/B2

---

## Suggested execution order for contributors

1. A1 + A3 (stabilize runbook/config)
2. B1 + B2 (ship Anthropic LLM foundation)
3. C1 + C3 + C2 (enable hybrid mode)
4. D1 (show agent traces in UI)
5. A2 (CI hardening, if not already parallelized)
6. B4 + D2 (expand providers and explainability)

---

## Post-M1 backlog (keep, do not start yet)

- Full per-agent LLM mode with batching and cost controls
- Agent memory and continuity layer
- Hot-seat 2-player input mode
- Online multiplayer rooms via WebSockets
- Cost estimator and moderation pipeline

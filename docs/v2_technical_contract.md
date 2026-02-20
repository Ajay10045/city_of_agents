# city_of_agents v2 — Technical Contract

## 1) Scope

This document defines implementable backend/UI contracts for:

- Narrative duel turn flow
- Expanded turn ledger
- Media narrative feed
- Advisor explainability payloads
- Pre-game setup configuration
- City scenario loading
- Hybrid agent-impact simulation at scale

---

## 2) Canonical Turn Pipeline (v2)

Given turn `t`:

1. `mayor_action_submitted`
2. `opposition_frame_primary`
3. `mayor_counter_frame`
4. `opposition_frame_followup`
5. `street_chatter_synthesized`
6. `media_narrative_published`
7. `simulation_stats_applied`
8. `popularity_recalculated`
9. `turn_closed`

All steps must emit ordered events with monotonic `event_id`.

---

## 3) Event Envelope

All SSE/stream events use this envelope:

```json
{
  "event_id": 184,
  "game_id": "uuid",
  "turn": 7,
  "type": "media_narrative_published",
  "actor": "media",
  "timestamp": 1739970000.123,
  "payload": {}
}
```

Required fields:

- `event_id` integer
- `game_id` string
- `turn` integer
- `type` string
- `actor` nullable string
- `timestamp` unix seconds float
- `payload` object

---

## 4) New/Extended Event Types

### 4.1 Advisor Events

- `advisor_options_generated`

Payload:

- `options`: array of 5 options
- `front_pressure_summary`

Each option object:

- `id`
- `title`
- `description`
- `why_now`
- `target_groups` string[]
- `expected_stat_delta` object
- `opposition_counter_risk` float (0-1)
- `narrative_fronts_impacted` object
- `confidence` float (0-1)

### 4.2 Narrative Duel Events

- `mayor_action_submitted`
- `opposition_frame_primary`
- `mayor_counter_frame`
- `opposition_frame_followup`

Shared duel payload fields:

- `message`
- `front_weights` object
- `target_groups` string[]
- `estimated_shift` object

### 4.3 Media Feed Event

- `media_narrative_published`

Payload:

- `cards`: array

Card fields:

- `headline`
- `source`
- `lean` (`mayor` | `opposition` | `neutral`)
- `virality` (0-100)
- `trust_impact` (-10 to +10)
- `front` (issue front id)

### 4.4 Turn Ledger Event

- `turn_closed`

Payload:

- `turn_summary`
- `stat_deltas`
- `popularity_delta`
- `key_events` string[]

### 4.5 Agent Impact Events

- `agent_impact_assessed`
- `cohort_shift_aggregated`

`agent_impact_assessed` payload:

- `turn`
- `agent_count_evaluated`
- `llm_panel_count`
- `dominant_fronts` string[]

`cohort_shift_aggregated` payload:

- `cohort_id`
- `size`
- `happiness_delta`
- `radicalization_delta`
- `alignment_delta`
- `narrative_shift_delta`

---

## 5) API Contract Changes

## 5.1 Create Game

`POST /v1/games`

Request body additions:

- `turns_to_election` integer (default 10)
- `city_id` string (required for v2 setup flow)
- `population_scale` integer (default 50000)
- `agent_count` integer (default 5000 for v2 rollout)
- `llm_panel_size` integer (default 500)
- `llm_sampling_strategy` string (`stratified` default)
- `llm_micro_batch_size` integer (default 20)
- `max_parallel_llm_requests` integer (default 8)

Response adds:

- `setup` object with resolved city profile metadata/version

### 5.2 Setup Metadata

`GET /v1/setup/options`

Returns:

- `cities` list with display names and ids
- default values for `turns_to_election`, `population_scale`
- validation limits

### 5.3 Turn Archive

`GET /v1/games/{game_id}/turns`

Returns paginated summaries:

- `turn`
- `headline`
- `winner_fronts` summary
- `event_count`

`GET /v1/games/{game_id}/turns/{turn}`

Returns full turn ledger:

- all duel steps
- all media cards
- full deltas and derived scores

### 5.4 Media Timeline

`GET /v1/games/{game_id}/media?since_turn={n}`

Returns media cards across turns.

### 5.5 Action Submission Consistency

`POST /v1/games/{game_id}/actions`

Request supports:

- `policy_id` (required)
- `expected_turn` (recommended)
- `advisor_session_id` (optional but recommended)

Server rules:

- Actions are validated against the active advisor session for the planned turn.
- If `advisor_session_id` is stale, return `409` with active session metadata.
- If `policy_id` is not in the active option set, return `409` with recoverable refresh guidance.
- Do not emit opaque unknown-policy failures for stale/regenerated policy sets.

---

## 6) Agent Impact Framework (Hybrid)

### 6.1 Core Decision

- Every agent is evaluated each turn via deterministic policy-impact math.
- LLM calls are restricted to a stratified panel sample and synthesis roles.
- Default rollout profile:
  - `agent_count=5000`
  - `llm_panel_size=500`
  - `llm_sampling_strategy=stratified`

### 6.2 Deterministic Per-Agent Evaluation

For each agent on each turn, evaluate:

- direct relevance to policy
- socioeconomic need match
- identity resonance
- district/local condition influence
- media exposure susceptibility
- social influence drift
- bounded stochastic term

Outputs per agent:

- `happiness_delta`
- `radicalization_delta`
- `alignment_delta`
- `issue_front_shift`

### 6.3 LLM Panel Influence

LLM panel agents are sampled by cohort strata, not pure random.

Panel outputs are transformed into:

- cohort-level `narrative_shift` vectors
- front-level momentum modifiers

These modifiers are then applied to full-population cohort aggregates.

### 6.4 Prohibited/Restricted Modes

- No per-agent LLM calls in normal production/dev simulation mode.
- Optional debug mode `full_llm` is allowed only for tiny runs (`agent_count <= 300`).

### 6.5 Parallelism and Batching

- LLM panel calls use micro-batches and bounded concurrency.
- Batch guidance:
  - `llm_micro_batch_size=20`
  - `max_parallel_llm_requests=8`

---

## 7) City Profile Contract

File path:

- `config/cities/{city_id}.json`

Schema fields:

- `city_id`
- `display_name`
- `population_reference`
- `cohort_blueprint` array
- `income_distribution`
- `issue_salience`
- `institutional_profile`
- `media_profile`
- `profile_version`
- `generated_at`
- `generation_seed`

LLM-generated profiles must pass schema validation before being accepted.

---

## 8) Data Model Additions

`GameState` additions:

- `setup`: setup config snapshot
- `narrative_fronts`: control/risk values per issue front
- `turn_archive`: compact list of per-turn summaries
- `simulation_profile`: agent/LLM panel configuration
- `cohort_metrics`: aggregated cohort runtime values

`TurnManager` additions:

- structured `run_turn_duel(...)`
- emits canonical event sequence in section 2
- runs deterministic impact pass before turn close

`MediaEngine` additions:

- build `cards` payload with lean/virality/trust impact

`AgentEngine` additions:

- deterministic policy impact evaluator for all agents
- cohort aggregation pipeline
- stratified panel sampler

`ImpactEngine` (new module) additions:

- computes per-agent impact components and final deltas
- supports seeded stochastic term
- emits aggregate diagnostics

---

## 9) Validation Rules

- `turns_to_election`: 3-100
- `population_scale`: 10000-200000
- `agent_count`: 1000-50000 (v2 practical rollout default: 5000)
- `llm_panel_size`: 50-5000 and must be `<= agent_count`
- `llm_sampling_strategy`: one of `stratified`, `uniform`, `none`
- `llm_micro_batch_size`: 1-100
- `max_parallel_llm_requests`: 1-32
- `city_id`: must exist in setup options
- advisor options must be exactly 5
- every closed turn must emit one `turn_closed` event

---

## 10) Compatibility Policy

- Keep legacy `/api/*` routes until UI fully migrates.
- v1 endpoint contract remains backward compatible for current clients.
- v2 features are additive under existing `/v1` namespace.

---

## 11) Observability Requirements

Emit diagnostics (dev mode):

- turn step timing by phase
- LLM call count by role (`advisor`, `opposition`, `media`, `citizen`)
- parse/repair fallback count
- event emission count per turn
- deterministic impact evaluations per turn
- LLM panel coverage ratio (`llm_panel_size / agent_count`)
- LLM batch latency percentile
- per-turn token usage by role

These metrics are needed for balance and cost tuning.

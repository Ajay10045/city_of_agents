# city_of_agents v2 — Technical Contract

## 1) Scope

This document defines implementable backend/UI contracts for:

- Narrative duel turn flow
- Expanded turn ledger
- Media narrative feed
- Advisor explainability payloads
- Pre-game setup configuration
- City scenario loading

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

---

## 5) API Contract Changes

## 5.1 Create Game

`POST /v1/games`

Request body additions:

- `turns_to_election` integer (default 10)
- `city_id` string (required for v2 setup flow)
- `population_scale` integer (default 50000)

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

---

## 6) City Profile Contract

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

## 7) Data Model Additions

`GameState` additions:

- `setup`: setup config snapshot
- `narrative_fronts`: control/risk values per issue front
- `turn_archive`: compact list of per-turn summaries

`TurnManager` additions:

- structured `run_turn_duel(...)`
- emits canonical event sequence in section 2

`MediaEngine` additions:

- build `cards` payload with lean/virality/trust impact

---

## 8) Validation Rules

- `turns_to_election`: 3-100
- `population_scale`: 10000-200000
- `city_id`: must exist in setup options
- advisor options must be exactly 5
- every closed turn must emit one `turn_closed` event

---

## 9) Compatibility Policy

- Keep legacy `/api/*` routes until UI fully migrates.
- v1 endpoint contract remains backward compatible for current clients.
- v2 features are additive under existing `/v1` namespace.

---

## 10) Observability Requirements

Emit diagnostics (dev mode):

- turn step timing by phase
- LLM call count by role (`advisor`, `opposition`, `media`, `citizen`)
- parse/repair fallback count
- event emission count per turn

These metrics are needed for balance and cost tuning.

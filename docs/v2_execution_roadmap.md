# city_of_agents v2 — Execution Roadmap

## 1) Delivery Strategy

Use one feature branch per capability. Keep each branch mergeable on its own with tests and docs.

Branch naming pattern:

- `feature/v2-<capability>`

---

## 2) Milestones

## Milestone A — Contracts and Baseline Alignment

Branch:

- `feature/v2-contracts-baseline`

Deliverables:

- merge PRD + technical contract docs
- align backend event names with contract (no behavior change yet)
- add placeholders for new payload fields

Exit criteria:

- CI green
- no UI regression

## Milestone B — Agent Impact Contracts

Branch:

- `feature/v2-agent-impact-contracts`

Deliverables:

- define agent impact schema fields and evaluation components
- add setup config contract fields:
  - `agent_count`
  - `llm_panel_size`
  - `llm_sampling_strategy`
  - `llm_micro_batch_size`
  - `max_parallel_llm_requests`
- add validation and defaults in API contracts

Exit criteria:

- setup payloads validate correctly
- API contract tests for new setup fields

## Milestone C — Agent Impact Engine (Deterministic Core)

Branch:

- `feature/v2-agent-impact-engine`

Deliverables:

- deterministic per-agent policy impact evaluation for all agents each turn
- cohort aggregation pipeline for bottom-up stats/group updates
- deterministic seeded randomness for bounded noise

Exit criteria:

- 5000-agent simulation runs within acceptable local runtime
- deterministic replay works for same seed

## Milestone D — Hybrid LLM Panel and Calibration

Branch:

- `feature/v2-agent-impact-calibration`

Deliverables:

- stratified panel sampling (default 500 agents)
- LLM micro-batching + bounded parallelism
- panel narrative shift injection back into cohort aggregates
- calibration harness for win-rate and collapse-rate tuning

Exit criteria:

- no per-agent LLM calls in standard mode
- panel influence is observable and stable across seed sweeps

## Milestone E — Turn Archive (Expandable Logs)

Branch:

- `feature/v2-turn-archive-ledger`

Deliverables:

- backend stores per-turn ledger snapshots
- API endpoints:
  - `GET /v1/games/{id}/turns`
  - `GET /v1/games/{id}/turns/{turn}`
- UI bottom panel supports per-turn expand/collapse

Exit criteria:

- every turn appears with expandable details
- integration tests for archive endpoints

## Milestone F — Narrative Duel Engine

Branch:

- `feature/v2-narrative-duel`

Deliverables:

- add two-phase opposition/mayor exchange inside turn
- emit duel events in strict order
- update popularity/front-control using duel outcomes

Exit criteria:

- event order tests pass
- no missing `turn_closed` events

## Milestone G — Media Narrative Board

Branch:

- `feature/v2-media-board`

Deliverables:

- right-side media feed panel (timeline cards)
- backend `media_narrative_published` cards
- feed updates each turn from stream + history

Exit criteria:

- at least one media card per turn
- UI renders feed without blocking turn controls

## Milestone H — Advisor Explainability

Branch:

- `feature/v2-advisor-explainability`

Deliverables:

- advisor returns 5 options with rationale fields
- UI renders "why this policy" and counter-risk per option
- enforce schema validation on advisor output

Exit criteria:

- 5/5 options consistently include rationale fields
- parse failures degrade gracefully via fallback

## Milestone I — Game Setup Config

Branch:

- `feature/v2-game-setup`

Deliverables:

- start screen fields:
  - turns to election (default 10)
  - city select
  - population scale (default 50,000)
  - agent count and LLM panel settings (with safe defaults)
- pass setup to `POST /v1/games`

Exit criteria:

- game starts with selected setup
- setup reflected in game state snapshot

## Milestone J — City Scenario Profiles

Branch:

- `feature/v2-city-profiles`

Deliverables:

- initial profiles: New Delhi, New York, London, Tokyo, Dubai
- schema for `config/cities/*.json`
- loader + validator + fallback behavior

Exit criteria:

- all configured cities load
- invalid profile fails with actionable error

## Milestone K — Balance and Regression Suite

Branch:

- `feature/v2-balance-tests`

Deliverables:

- simulation balance tests (seed sweeps)
- fairness envelope checks
- narrative dominance regression checks
- hybrid impact throughput checks (5000+ agents)

Exit criteria:

- no extreme side lock in baseline seeds
- full quality suite green

---

## 3) Testing Matrix

Per branch minimum:

- unit tests for new logic
- API contract tests for changed endpoints
- UI smoke test for modified panels

Global nightly:

- 100-seed simulation sweep
- win-rate and collapse-rate trend report

---

## 4) Risk Controls

- Keep v1 contract additive; avoid breaking existing UI route flow until migrated.
- Gate unfinished features behind explicit flags.
- Store strict event envelopes to support replay/debugging.
- Avoid unbounded LLM calls per turn; keep role-limited call budget.

---

## 5) Suggested Team Workflow

- Backend contract owner and UI owner pair on each milestone.
- Merge only after API examples in PR description are validated with curl.
- Keep branch scope small enough for 1-2 day review cycle.

---

## 6) Immediate Next Branch

Start with:

- `feature/v2-agent-impact-contracts`

Reason:

- Locks the simulation foundation first so all UI/narrative layers build on accurate bottom-up agent impact.

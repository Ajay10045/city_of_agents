# city_of_agents v2 — Political Duel PRD

## 1) Goal

Make each turn feel like a live political contest, not a one-sided stat update.

The player should be able to:

- Understand why advisor options exist and what they are trying to counter.
- Watch Mayor vs Opposition narrative battle unfold in-turn.
- Inspect complete turn history and drill down into decisions and outcomes.
- Start games with configurable election horizon and city scenario.

---

## 2) Problems to Solve

Current pain points:

- Opposition momentum often dominates too quickly.
- Mayor options are not clearly tied to opposition narrative pressure.
- Logs are hard to inspect deeply (no per-turn expansion flow).
- Media narrative is underrepresented in UI and gameplay loop.
- City setup is too generic and does not reflect city-specific demographics/issues.
- Policy regeneration can desync selected option IDs from active turn cache, causing `Unknown policy id` failures.

---

## 3) Product Principles

- Simulation-first: no hardcoded winner scripts.
- Explainability-first: every major recommendation and shift should have rationale.
- City-specific realism: scenarios must differ in demographics, issues, and economic structure.
- Scalable architecture: each feature must be modular and event-driven.

---

## 4) v2 Player Experience

### 4.1 Pre-Game Setup

Before turn 1, player configures:

- `turns_to_election` (default: 10)
- `city_scenario` (initial set: New Delhi, New York, London, Tokyo, Dubai)
- `population_scale` (default simulated cohorts equivalent to 50,000 agents)

### 4.2 In-Turn Narrative Duel

Each turn includes:

1. Mayor policy declaration
2. Opposition framing attack
3. Mayor rebuttal/counter-frame
4. Opposition follow-up
5. Media synthesis + street sentiment shift
6. Stat and popularity resolution

### 4.3 Expanded Turn Audit

UI adds expandable turn log:

- Summary row per turn
- Expand to view all narrative steps, key stat deltas, and triggered events
- Persistent searchable history across completed turns

### 4.4 Media Narrative Board

Right-side panel displays social/media feed cards:

- Headline
- Source/outlet archetype
- Lean (Mayor/Opp/neutral)
- Virality / reach
- Trust impact

Visual direction should feel like a live timeline feed (Twitter-style structure, not text dump).

---

## 5) Core Mechanics (v2 additions)

### 5.1 Narrative Fronts

Track contested issue fronts:

- Economy
- Corruption
- Safety / law and order
- Public services
- Identity/social cohesion

Each front gets a control score per side (`mayor_control`, `opposition_control`).

### 5.2 Advisor Explainability

Each of 5 mayor options must include:

- `why_now`
- `target_groups`
- `expected_stat_delta`
- `opposition_counter_risk`
- `narrative_fronts_impacted`
- `confidence`

### 5.3 Balanced Counterplay

Mayor options should explicitly include at least one:

- defensive stabilizer option
- offensive narrative recapture option
- high-risk/high-reward option

This prevents single-path collapse and supports strategic tradeoffs.

### 5.4 Agent-First Impact at Scale

Simulation must remain bottom-up:

- Every agent is evaluated each turn for policy impact.
- v2 default runtime profile is 5,000 agents.
- LLM is used for sampled deliberation plus narrative synthesis, not full per-agent inference.

Hybrid default:

- deterministic evaluation for all agents
- stratified LLM panel for a sampled subset (default 500/5000)
- panel influence is aggregated back to cohorts and fronts

---

## 6) City Scenario System

Each city scenario contains:

- Demographic and profession cohort mix
- Income distribution bands
- Baseline issue salience
- Institutional trust/media behavior profile

Profiles are generated via LLM with strict schema validation, then cached/versioned JSON.

Policy: do not regenerate live every game by default; use cached profiles for stability and cost control.

---

## 7) Non-Goals for v2

- Full animation/GIF/avatar pipelines
- High-fidelity 3D/Unity integration
- Multiplayer synchronous politics

These remain future phases after v2 systems are stable.

---

## 8) Success Metrics

Simulation quality:

- Opposition win rate should not collapse to near-100% under normal play.
- Mayor and opposition both have viable winning paths across seeded runs.

Product quality:

- 100% of turns are drill-down inspectable in expanded logs.
- 100% of mayor options contain advisor rationale fields.
- Media board updates every turn with at least one narrative card.
- Regenerated/stale advisor sessions are conflict-safe (clear 409 + recoverable refresh path, no opaque unknown-policy errors).

Performance:

- 50-turn simulation completes without crash in local dev mode.
- Cohort-based population updates avoid O(n^2) behavior.

---

## 9) Release Criteria for v2

v2 is ready when all are true:

- Pre-game config is active (`turns_to_election`, city, population scale).
- Narrative duel runs every turn with logged step sequence.
- Media narrative board is populated from backend events.
- Turn archive supports per-turn expansion.
- Advisor explainability fields are present and rendered.

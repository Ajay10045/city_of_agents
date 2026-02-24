# City of Agents — End-to-End Implementation Plan

> **Source of truth for the engine:** `docs/prd/core_engine_v4.md`
> **Source of truth for the UI:** The three screens provided by the user (City Selection, Cabinet Selection, Game Dashboard)
>
> **Philosophy:** Build the engine first, wire it end-to-end, then build UI screens on top. Every phase produces something runnable.

---

## Tech Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| **Backend** | Python 3.11 + FastAPI | Already scaffolded |
| **Package mgr** | uv | Already configured |
| **LLM client** | Multi-provider (openai / anthropic / ollama) | Already abstracted in `api/` |
| **Storage** | In-memory dict → SQLite (Phase 6) | No DB needed until persistence |
| **Frontend** | React 18 + TypeScript + Vite | Already in `city_of_agents_ui/` |
| **Styling** | Tailwind CSS 4 + inline styles | Match provided screen designs |
| **State** | React Context + useReducer | Turn-based, discrete state changes |
| **API transport** | REST + optional SSE for streaming | Chat already streams |

---

## Project Structure (target)

```
city_of_agents/
├── api/
│   ├── main.py                    ← FastAPI app (already exists)
│   ├── routes/
│   │   ├── game.py                ← /game/* endpoints (new)
│   │   └── v2.py                  ← existing v2 routes
│   └── llm.py                     ← LLM client abstraction (already exists)
│
├── engine/                        ← Pure Python, no FastAPI dependency
│   ├── __init__.py
│   ├── city_profile.py            ← CityProfile generation + validation
│   ├── citizen.py                 ← Citizen/Agent generation
│   ├── minister.py                ← Minister traits + execution scoring
│   ├── game_state.py              ← GameState + turn management
│   ├── implementation.py          ← Implementation engine (filters, leakage)
│   ├── wellbeing.py               ← Impact matrix + wellbeing updates
│   ├── political.py               ← Alignment, approval, polling
│   ├── media.py                   ← Media engine + drift
│   ├── opposition.py              ← Opposition engine + counter-frame
│   ├── events.py                  ← Crisis + opportunity event system
│   ├── budget.py                  ← Revenue, debt, decay
│   └── scoring.py                 ← Scorecard + legacy titles
│
├── simulation/                    ← Orchestration layer
│   ├── __init__.py
│   ├── session.py                 ← GameSession: holds state, runs turn loop
│   └── llm_calls.py               ← All LLM calls: profile gen, policy draft, narration
│
├── city_of_agents_ui/             ← Frontend (already scaffolded)
│   └── src/
│       ├── types/                 ← TypeScript types mirroring engine schemas
│       ├── api/                   ← API client (mock → real swap)
│       ├── context/               ← GameContext
│       └── screens/               ← City Selection, Cabinet, Dashboard
│
└── tests/
    ├── test_engine/               ← Unit tests per engine module
    └── test_api/                  ← Integration tests for API endpoints
```

---

## Phase 0 — Shared Schema & Types (Foundation)

**Goal:** Single canonical data model. Python Pydantic models and matching TypeScript types. Every subsequent phase reads from these.

### 0.1 Python Pydantic Models (`engine/`)

```python
# engine/city_profile.py
class CityParameters(BaseModel):
    jobs_and_commerce: float          # P1
    transit_and_roads: float          # P2
    water_power_sanitation: float     # P3
    hospitals_and_clinics: float      # P4
    schools_and_universities: float   # P5
    affordable_housing: float         # P6
    community_and_spaces: float       # P7
    police_and_emergency: float       # P8
    courts_and_legal: float           # P9
    air_quality_and_pollution: float  # P10
    admin_efficiency: float           # P11
    anti_corruption: float            # P12
    media_freedom: float              # P13

class DemographicDistributions(BaseModel):
    income_distribution: dict
    age_distribution: dict
    religion_distribution: list[dict]
    profession_distribution: list[dict]
    education_distribution: dict
    location_distribution: list[dict]
    ideology_economic_distribution: dict  # extreme_left/left/center/right/extreme_right
    ideology_social_distribution: dict    # liberal/conservative

class PersonalityClimate(BaseModel):
    integrity_mean: float
    competence_mean: float
    conscientiousness_mean: float
    ambition_mean: float
    empathy_mean: float
    risk_appetite_mean: float
    authority_respect_mean: float
    corruption_tolerance_mean: float

class MediaOutlet(BaseModel):
    name: str
    lean: Literal["mayor", "opposition", "neutral"]
    bias_intensity: float
    sensationalism: float
    trust_rating: float
    reach: float

class CommunalConfig(BaseModel):
    tension_baseline: float
    dominant_fault_line: str
    festival_calendar: list[dict]

class BudgetConfig(BaseModel):
    starting_treasury: float
    base_tax_revenue: float
    max_policy_budget: float
    max_minor_budget: float
    max_debt: float
    interest_rate: float

class GameConfig(BaseModel):
    total_turns: int
    election_turn: int
    agent_count: int
    minister_count: int
    legacy_equilibrium_multiplier: float = 2.0

class CityProfile(BaseModel):
    city_name: str
    region: str
    population_description: str
    languages: list[str]
    dominant_religions: list[dict]
    cultural_notes: str
    geographic_character: str
    historical_context: str
    city_parameters: CityParameters
    demographics: DemographicDistributions
    personality_climate: PersonalityClimate
    media_outlets: list[MediaOutlet]
    communal_config: CommunalConfig
    budget: BudgetConfig
    game_config: GameConfig
```

```python
# engine/citizen.py
class WellbeingState(BaseModel):
    health: float
    wealth: float
    safety: float
    social: float

class CitizenPersonality(BaseModel):
    integrity: float
    empathy: float
    risk_appetite: float
    ambition: float
    conscientiousness: float
    authority_respect: float
    corruption_tolerance: float

class CitizenCapability(BaseModel):
    competence: float
    managerial_skill: float
    strategic_thinking: float
    crisis_handling: float
    bureaucratic_navigation: float

class CitizenDemographics(BaseModel):
    age_group: str
    income_percentile: float
    income_bracket: Literal["poor", "lower_mid", "middle", "upper_mid", "rich"]
    religion: str
    profession: str
    education_level: float
    location: str
    ideology_economic: Literal["extreme_left", "left", "center", "right", "extreme_right"]
    ideology_social: Literal["liberal", "conservative"]

class Citizen(BaseModel):
    id: str
    name: str
    demographics: CitizenDemographics
    personality: CitizenPersonality
    capability: CitizenCapability
    wellbeing: WellbeingState
    mayor_alignment: float
    population_weight: float
    # slow-moving state
    slow_income: float
    slow_education: float
    employment_status: str
```

```python
# engine/game_state.py
class Policy(BaseModel):
    name: str
    description: str
    portfolio: str
    budget_cost: float
    target_effects: dict[str, float]
    side_effects: dict[str, float]
    time_profile: dict[str, float]
    targets: list[dict]
    tradeoffs: str
    why_now: str
    consultation_link: str

class MinorAction(BaseModel):
    type: Literal["maintenance", "banking", "reshuffle", "press_conference",
                  "emergency_fund", "governance_upkeep"]
    target: str | None = None
    budget: float = 0.0

class TurnResult(BaseModel):
    turn: int
    major_policy: Policy
    minor_action: MinorAction
    execution_score: float
    actual_deltas: dict[str, float]
    side_effect_deltas: dict[str, float]
    budget_stolen: float
    delivery_targets: list[dict]   # proposed vs delivered per target
    delivery_narrative: str        # LLM-generated explanation of the gap
    city_params_after: dict[str, float]
    wellbeing_changes: dict[str, dict]  # citizen_id → {health, wealth, safety, social}
    media_headlines: list[dict]
    citizen_voices: list[dict]     # sampled LLM reactions
    opposition_attack: dict
    counter_frame_used: str
    interim_approval: float
    ward_report: dict
    events_triggered: list[dict]
    communal_tension: float
    minister_loyalty_changes: dict[str, float]

class GameState(BaseModel):
    game_id: str
    city_profile: CityProfile
    citizens: list[Citizen]
    ministers: list[dict]          # citizens elevated to minister + minister state
    opposition_leader: dict
    city_params: dict[str, float]  # current live values
    treasury: float
    outstanding_debt: float
    current_turn: int
    turn_history: list[TurnResult]
    active_events: list[dict]
    communal_tension: float
    media_outlets: list[MediaOutlet]
    opposition_credibility: float
    prng_state: int                # reproducibility
    phase: Literal["pre_election", "election", "legacy", "game_over"]
    consultation_history: list[dict]   # all turns' transcripts
```

### 0.2 TypeScript Types (`city_of_agents_ui/src/types/`)

Mirror the Python models exactly. Key files:

```
types/
├── city.ts       ← CityProfile, CityParameters, MediaOutlet
├── citizen.ts    ← Citizen, WellbeingState, Ideology enums
├── game.ts       ← GameState, TurnResult, Policy, MinorAction
└── api.ts        ← API request/response envelope types
```

**Deliverable:** All models defined. No logic yet. `uv run python -m compileall engine/` passes.

---

## Phase 1 — City Profile Generation

**Goal:** Given a city name, produce a validated CityProfile JSON.

### 1.1 LLM Call — `simulation/llm_calls.py`

```python
async def generate_city_profile(city_name: str, constraints: str = "") -> CityProfile:
    """
    Single LLM call. Model uses web search + domain knowledge.
    Prompt specifies the exact JSON schema (CityProfile).
    Returns validated CityProfile or raises ValidationError.
    """
    prompt = build_city_profile_prompt(city_name, constraints)
    raw = await llm_client.complete(prompt, response_format="json")
    profile = CityProfile.model_validate_json(raw)
    validate_city_profile(profile)   # programmatic checks (Section 1.3 of engine spec)
    return profile
```

### 1.2 Validation (`engine/city_profile.py`)

Implement all 10 validation rules from Section 1.3:
- Parameter range checks
- Demographic sum-to-100 checks
- Logic checks (election_turn < total_turns, etc.)
- Retry prompt with specific errors if validation fails (max 3 retries)

### 1.3 PRNG Seeding

```python
import hashlib, random
def seed_prng_from_profile(profile: CityProfile) -> random.Random:
    profile_hash = hashlib.sha256(profile.model_dump_json().encode()).hexdigest()
    return random.Random(int(profile_hash[:16], 16))
```

### 1.4 API Endpoint

```
POST /game/profile
Body: { city_name: str, constraints?: str }
Response: CityProfile JSON
```

**Tests:**
- Unit: validation rules fire correctly on bad profiles
- Integration: end-to-end call produces valid profile for "New Delhi"

**Deliverable:** `POST /game/profile` returns a valid, reproducible CityProfile.

---

## Phase 2 — Agent Generation

**Goal:** From a CityProfile, generate N citizens + assign ministers + generate opposition leader.

### 2.1 Citizen Generation (`engine/citizen.py`)

```python
def generate_citizens(profile: CityProfile, rng: random.Random) -> list[Citizen]:
    """
    For each of game_config.agent_count citizens:
    1. Sample demographics from distributions
    2. Sample personality from personality_climate + σ=15
    3. Apply personality-demographic correlations (Section 3.2)
    4. Apply ideology-personality correlations (Section 3.7)
    5. Derive capability traits from personality (Section 3.3)
    6. Compute initial wellbeing from city params (Section 3.4)
    7. Compute initial mayor alignment (Section 3.4)
    8. Assign population weight (Section 3.6)
    9. Assign a name (LLM-generated batch, or sampled from city's language/culture)
    """
```

**Key functions:**
- `sample_income_bracket(percentile)` → bucketed bracket
- `compute_initial_wellbeing(params, demographics)` → WellbeingState
- `compute_initial_alignment(wellbeing, personality, rng)` → float
- `assign_population_weights(citizens)` → normalized weights

### 2.2 Name Generation

Batch LLM call: generate N names appropriate to the city's languages and religions. This is one LLM call for all citizens, not N calls.

```python
async def generate_citizen_names(profile: CityProfile, n: int) -> list[str]:
    # Single LLM call: "Generate {n} realistic names for citizens of {city_name}.
    # Languages: {languages}. Religion mix: {religions}. Return JSON list."
```

### 2.3 Minister Selection (`engine/minister.py`)

```python
def select_minister_candidates(citizens: list[Citizen], count: int,
                                 rng: random.Random) -> list[dict]:
    """
    Select 3-5× the minister_count as candidates (for player to choose from).
    Selection criteria: high competence OR high ambition (realistic candidate pool).
    Shuffle for hidden information.
    Returns partial views: demographics + reputation signals visible, traits hidden.
    """

def build_minister_state(citizen: Citizen, portfolio: str) -> dict:
    """Elevate citizen to minister. Add dynamic state: loyalty, scandal_exposure, political_capital."""
```

### 2.4 Opposition Leader Generation

```python
def generate_opposition_leader(citizens: list[Citizen], rng: random.Random) -> dict:
    """
    Pick the citizen with highest (Ambition × 0.7 + Competence × 0.3) not in cabinet.
    Assign initial credibility = 50.
    """
```

### 2.5 API Endpoint

```
POST /game/new
Body: { city_profile: CityProfile, minister_selections: list[str] }
       # minister_selections = citizen IDs chosen by player + portfolio assignments
Response: { game_id: str, initial_game_state: GameState }
```

**Deliverable:** `POST /game/new` returns a full initial GameState with 50 citizens, ministers, opposition.

---

## Phase 3 — Minister Consultation (The Conversation)

**Goal:** Open-ended multi-turn chat between player and cabinet.

### 3.1 Chat Endpoint

```
POST /game/{game_id}/consult
Body: {
    minister_id: str,    # which minister the player is addressing
    message: str         # player's message
}
Response: {
    minister_response: str,
    minister_id: str,
    transcript_so_far: list[dict]
}
```

### 3.2 LLM Call — Minister Response

```python
async def minister_response(
    game_state: GameState,
    minister: dict,
    transcript: list[dict],
    player_message: str
) -> str:
    """
    Prompt structure:
    [SYSTEM] You are {minister.name}, {minister.demographics.profession}.
             Personality: integrity={...}, ambition={...}, empathy={...}...
             Portfolio: {portfolio}. Current portfolio parameters: {params}.
             [TRAIT BEHAVIOR RULES from Section 4.3]

    [CONTEXT] City: {city_name}. Turn {n} of {total}.
              City state: {params summary}. Budget: {treasury}.
              Active crises: {crises}.
              Ward report: {ward_report_summary}.

    [CONVERSATION SO FAR]
    {transcript}

    [PLAYER SAYS]
    {player_message}

    Respond in character. Stay grounded in city realities.
    You may agree, disagree, advise, warn, or deflect — per your personality.
    """
```

Key prompt constraints:
- Minister's trait profile is injected into the system prompt
- Full transcript is included (no summarization)
- Minister doesn't reference game mechanics explicitly (stays in-world)

### 3.3 Transcript Management

```python
class ConsultationTranscript:
    def __init__(self, briefing: dict):
        self.messages: list[dict] = [
            {"role": "system", "content": format_briefing(briefing)}
        ]

    def add(self, speaker: str, text: str):
        self.messages.append({"role": speaker, "content": text, "timestamp": now()})

    def to_policy_context(self) -> str:
        """Serialize for policy draft LLM call."""
        return "\n".join([f"[{m['role'].upper()}]: {m['content']}" for m in self.messages])
```

**Deliverable:** Player can have a multi-turn conversation with each minister. Transcript accumulates.

---

## Phase 4 — Policy Draft Generation

**Goal:** From completed consultation transcript + game state, generate 5 policy options.

### 4.1 LLM Call — Policy Draft

```python
async def generate_policy_options(
    game_state: GameState,
    transcript: ConsultationTranscript
) -> list[Policy]:
    """
    Input: full consultation transcript + structured city state
    Output: 5 DynamicPolicy objects

    Prompt:
    [SYSTEM] You are the policy advisor for {city_name}.
             Generate 5 policy options based on the cabinet consultation below.
             Policies must be responsive to topics raised in the conversation.
             Each policy must conform exactly to this schema: {PolicySchema}
             [VALIDATION RULES from Section 5.3]

    [CONSULTATION TRANSCRIPT]
    {transcript.to_policy_context()}

    [CURRENT STATE]
    City parameters: {params}
    Budget: {treasury} Cr available, {debt} Cr outstanding debt
    Active crises: {crises}
    Policy history (all turns): {policy_history}
    City profile context: {city_name}, {cultural_notes}, {historical_context}

    Generate exactly 5 policies. Each must include consultation_link
    tying it to something discussed.
    """

    raw = await llm_client.complete(prompt, response_format="json")
    policies = [Policy.model_validate(p) for p in raw["policies"]]

    # Programmatic validation (Section 5.3)
    for i, policy in enumerate(policies):
        try:
            validate_policy(policy, game_state.city_profile.budget)
        except ValidationError as e:
            policies[i] = get_fallback_policy(policy.portfolio)

    return policies
```

### 4.2 Fallback Policy Catalog

A static catalog of safe, valid policies per portfolio — used when LLM output fails validation.

```python
FALLBACK_POLICIES: dict[str, Policy] = {
    "Infrastructure": Policy(name="Road Maintenance Program", ...),
    "Finance & Economy": Policy(name="Small Business Support Fund", ...),
    ...
}
```

### 4.3 API Endpoint

```
POST /game/{game_id}/policies
Body: {}   # transcript already stored server-side per game session
Response: { policies: list[Policy] }
```

**Deliverable:** After consultation, player receives 5 contextually relevant policy options.

---

## Phase 5 — Implementation Engine

**Goal:** Execute the selected policy + minor action. Produce all turn deltas.

### 5.1 Core Engine (`engine/implementation.py`)

```python
def run_implementation(
    policy: Policy,
    minister: dict,
    city_params: dict,
    rng: random.Random
) -> ImplementationResult:
    """
    Returns:
    - execution_score (float 0–1)
    - actual_deltas (dict: param → delta)
    - side_effect_deltas (dict: param → delta)
    - leakage_rate (float)
    - budget_stolen (float)
    - completion_targets (list: proposed vs delivered per target)
    """
    minister_exec = compute_minister_exec_score(minister, city_params)
    city_filter = compute_city_filter_score(city_params)
    raw = minister_exec * 0.55 + city_filter * 0.45
    raw *= dual_portfolio_penalty(minister)
    noise = rng.uniform(-0.05, 0.05)
    execution_score = clamp(raw + noise, 0.10, 0.95)

    actual_deltas = {}
    for param, intended in policy.target_effects.items():
        if intended > 0:
            actual_deltas[param] = intended * execution_score
        else:
            actual_deltas[param] = intended   # full damage

    side_effect_deltas = {}
    for param, delta in policy.side_effects.items():
        if delta < 0:
            side_effect_deltas[param] = delta
        else:
            side_effect_deltas[param] = delta * execution_score

    corruption = compute_corruption(minister, city_params, policy.budget_cost)
    completion_targets = compute_completion_targets(policy.targets, execution_score, rng)

    return ImplementationResult(
        execution_score=execution_score,
        actual_deltas=actual_deltas,
        side_effect_deltas=side_effect_deltas,
        leakage_rate=corruption.rate,
        budget_stolen=corruption.stolen,
        completion_targets=completion_targets
    )
```

### 5.2 Wellbeing Update (`engine/wellbeing.py`)

```python
def update_citizen_wellbeing(
    citizens: list[Citizen],
    city_param_deltas: dict[str, float],
    city_profile: CityProfile
) -> dict[str, WellbeingState]:
    """
    Apply Impact Matrix × identity multipliers × diminishing returns.
    Returns citizen_id → new WellbeingState.
    """
    IMPACT_MATRIX = {
        "jobs_and_commerce":       {"health": 0.05, "wealth": 0.65, "safety": 0.05, "social": 0.10},
        "transit_and_roads":       {"health": 0.05, "wealth": 0.05, "safety": 0.10, "social": 0.10},
        ...  # full matrix from Section 8.1
    }

    results = {}
    for citizen in citizens:
        delta = compute_citizen_wellbeing_delta(
            citizen, city_param_deltas, IMPACT_MATRIX, city_profile
        )
        new_wellbeing = apply_diminishing_returns(citizen.wellbeing, delta)
        results[citizen.id] = new_wellbeing
    return results
```

### 5.3 Political Feedback (`engine/political.py`)

```python
def update_mayor_alignment(
    citizen: Citizen,
    new_wellbeing: WellbeingState,
    media_influence: float,
    media_narrative_delta: float,
    rng: random.Random
) -> float:
    """Sticky alignment update. Max ±1.2 per turn."""

def compute_interim_approval(citizens: list[Citizen]) -> float:
    """Weighted approval of active citizens (engagement > 0.50)."""

def compute_election_approval(citizens: list[Citizen]) -> float:
    """Full population weighted approval."""
```

### 5.4 LLM Call — Delivery Narrative

```python
async def generate_delivery_narrative(
    policy: Policy,
    result: ImplementationResult,
    minister: dict,
    city_params: dict
) -> str:
    """
    Explains why the gap exists in narrative terms.
    E.g. "The metro stalled at the river crossing. Minister Shinde's
    team lacked clearance authority. 8.1km built instead of 12."
    """
```

**Deliverable:** `POST /game/{game_id}/turn` runs the full implementation engine and returns TurnResult with all deltas.

---

## Phase 6 — Full Turn Loop

**Goal:** Wire all turn phases together into a single turn execution.

### 6.1 Turn Orchestration (`simulation/session.py`)

```python
async def execute_turn(
    game_state: GameState,
    major_policy: Policy,
    minor_action: MinorAction,
    counter_frame: str,
    transcript: ConsultationTranscript
) -> TurnResult:
    """
    Runs phases ④ through ⑫ of the Turn Anatomy (Section 5):

    1. Implementation Engine        → actual deltas, execution score, corruption
    2. Minor Action effects         → maintenance/banking/reshuffle/etc.
    3. City State Update            → apply all deltas to city_params
    4. Maintenance Decay            → decay neglected parameters
    5. Citizen Wellbeing Update     → impact matrix
    6. Media Cycle                  → narratives, scandal check, drift
    7. Citizen Reaction             → LLM sampling (citizen voices)
    8. Opposition Attack + Counter  → effectiveness formula
    9. Political Feedback           → alignment, interim approval
    10. Event Check                 → crises, opportunities, communal tension
    11. Budget Update               → revenue, interest, auto-repayment
    12. Turn Report compilation     → TurnResult
    """
    rng = get_session_rng(game_state)

    impl = run_implementation(major_policy, get_minister(game_state, major_policy.portfolio), ...)
    apply_minor_action(game_state, minor_action)
    update_city_params(game_state, impl.actual_deltas, impl.side_effect_deltas)
    apply_maintenance_decay(game_state)
    wellbeing_changes = update_citizen_wellbeing(game_state.citizens, ...)
    media_results = run_media_cycle(game_state, impl)
    citizen_voices = await sample_citizen_reactions(game_state, major_policy, media_results)
    opposition = run_opposition(game_state)
    counter_result = apply_counter_frame(game_state, counter_frame, opposition)
    political = update_political_feedback(game_state, wellbeing_changes, media_results, counter_result)
    events = check_events(game_state, rng)
    budget = update_budget(game_state, major_policy, minor_action, impl.budget_stolen)
    narrative = await generate_delivery_narrative(major_policy, impl, ...)
    headlines = await generate_media_headlines(game_state.media_outlets, impl, events)

    return compile_turn_result(...)
```

### 6.2 API Endpoints

```
POST /game/{game_id}/turn
Body: {
    major_policy_index: int,      # 0-4 index into last policy options
    minor_action: MinorAction,
    counter_frame: str
}
Response: TurnResult

GET /game/{game_id}/state
Response: GameState (current, without consultation transcript)

GET /game/{game_id}/transcript
Response: { consultation_history: list[dict] }  # all turns' transcripts
```

### 6.3 Session Storage

```python
# simulation/session.py
SESSIONS: dict[str, GameSession] = {}   # in-memory for v1

class GameSession:
    game_id: str
    game_state: GameState
    current_transcript: ConsultationTranscript | None
    last_policy_options: list[Policy] | None
    rng: random.Random
```

**Deliverable:** Full turn loop runs end-to-end. CLI test can play a complete 20-turn game.

---

## Phase 7 — Remaining Game Systems

Implement the subsystems referenced in Phase 6 but not yet detailed:

### 7.1 Media Engine (`engine/media.py`)
- Narrative envelope per outlet (Section 10.2)
- Media influence on citizens (Section 10.3)
- Scandal exposure check + break mechanic (Section 10.4)
- Media drift (Section 10.6)
- LLM headline generation: one call per outlet per turn

### 7.2 Opposition Engine (`engine/opposition.py`)
- Vulnerability scoring per parameter (Section 11.2)
- Attack strategy selection
- Effectiveness formula (Section 11.3)
- Counter-frame effectiveness (Section 11.4)
- Opposition credibility evolution (Section 11.5)
- LLM: opposition statement generation + counter-frame narration

### 7.3 Event System (`engine/events.py`)
- Threshold trigger checks (Section 12.1)
- Stochastic event rolls (Section 12.2)
- Crisis escalation + resolution
- Opportunity event windows
- Communal tension updates (Section 12.5)

### 7.4 Cabinet Dynamics (`engine/minister.py`)
- Loyalty drift formula (Section 13.1)
- Defection check (Section 13.2)
- Firing cost calculation (Section 13.3)
- Reshuffle handling (Section 13.4)

### 7.5 Governance Equilibrium (`engine/political.py`)
- Equilibrium target computation (Section 15.1)
- P11 drift toward target (Section 15.2)
- Media freedom vulnerability (Section 15.3)

### 7.6 Budget System (`engine/budget.py`)
- Revenue per turn (Section 14.1)
- Debt management + interest (Section 14.2)
- Maintenance decay (Section 14.3)
- Fiscal warning / crisis triggers

### 7.7 Election + Scoring (`engine/scoring.py`)
- Election vote share computation (Section 9.6)
- Last-minute swing
- Legacy Phase mandate effects (Section 16.3)
- Governance scorecard (Section 17.2)
- Legacy title assignment (Section 17.3)

**Deliverable:** All game systems implemented. Full 20-turn game with election is playable via API calls.

---

## Phase 8 — UI: Screen 1 — City Selection

**Goal:** Player picks a city, adjusts turns/population, starts game.

### Components to Build

| Component | Description |
|-----------|-------------|
| `CitySelectionScreen` | Full-page screen. Grid of city cards + settings bar at bottom. |
| `CityCard` | City photo, name, region, population, 3-4 key stat badges (economic health, governance, inequality). Selected state: amber ring. |
| `GameSettingsBar` | "Turns to Election" slider (10–50, default 20). "Population" slider (10–100, default 50 agents). Start Game button. |

### API wiring
- On mount: `GET /cities` — returns 5 preset city options (real cities: Delhi, Karachi, Dhaka, Colombo + 1 fictional South Asian megacity)
- "Start Game" → `POST /game/profile` with selected city → shows loading → stores in GameContext → navigate to `/cabinet`

### UI Notes (from provided designs)
- Dark background (#0D0D0D or equivalent)
- City cards in horizontal scroll or 5-wide grid
- Amber/gold accent color for selected state and primary CTA
- Rajdhani for city names, Inter for descriptions, Share Tech Mono for numbers

---

## Phase 9 — UI: Screen 2 — Cabinet Selection

**Goal:** Player selects 5 ministers and assigns portfolios.

### Components to Build

| Component | Description |
|-----------|-------------|
| `CabinetSelectionScreen` | Split: left = applicant pool, right = selected cabinet |
| `ApplicantCard` | Portrait, name, profession, education level, 7 attribute star ratings (shown as stars or bars), ideology badges, Add button |
| `CabinetSlot` | Selected minister compact card. Portfolio assignment dropdown. Remove button. |
| `PortfolioBar` | Bottom strip: 7 unallocated portfolio badges. Drag or click-to-assign to minister. |
| `ValidationWarning` | Shows if < 5 ministers or any portfolio unassigned. Blocks Continue. |

### Ideology Display
Show both ideology axes on applicant cards:
- Ideology 1: small colored tag (e.g., "LEFT", "RIGHT", "CENTER") with appropriate color coding
- Ideology 2: small tag ("LIBERAL" / "CONSERVATIVE")

### API wiring
- On mount: reads minister candidates from GameState (set in Phase 2 via `POST /game/new`)
- "Continue to Game" → stores cabinet to GameContext + `PATCH /game/{game_id}/cabinet` → navigate to `/game`

---

## Phase 10 — UI: Screen 3 — Game Dashboard

The main game screen. Three-column layout.

### 10.1 TopBar
- City emblem + name
- Turn N of M indicator
- Budget bar (spent / remaining)
- Mayor Approval ring + delta
- "NEXT TURN" golden CTA button

### 10.2 Left Column — Advisory Chat
- **Minister list**: 3-5 minister avatars with name, role, loyalty arc ring. Click to address that minister.
- **Chat thread**: Scrollable. Mayor messages amber-tinted, minister messages blue-tinted. Avatar + name + role + bubble.
- **Chat input**: Text field + Send. "Draft Policy" button appears after first exchange.
- **Crisis panel**: Active crises with severity badges, risk %, affected parameters.

### 10.3 Center Column — Welfare + Events
- **4 welfare rings**: Health, Wealth, Safety, Social. SVG gauges, 0-100, with delta arrows.
- **Game stream**: Hero card for current active event (image, title, location, stat effects).
- **Turn history**: Timeline of past turns. Turn badge, policy enacted, approval change.
- **"View All Parameters"**: Expands to show all 13 city params as bars.

### 10.4 Right Column — Identity + Media + Chatter
- **Identity groups**: 6 demographic groups. Icon + name + approval bar + influence bar.
- **Media outlets**: 3 outlets with lean badge, headline, trust bar.
- **City chatter**: 3-5 citizen reaction posts. Avatar + name + ideology badge + message.

### 10.5 Policy Selection Modal
- Triggered by "Draft Policy" button or after consultation signals readiness
- Shows 5 policy cards: name, portfolio badge, budget cost, target effects table, side effects, tradeoffs, `consultation_link` note
- Player selects one → Minor action selector appears → "Confirm Turn"

### 10.6 Turn Report Overlay
- Appears after "NEXT TURN" resolves
- Promise vs Reality scorecard (proposed vs delivered per target)
- Delivery narrative (LLM text explaining the gap)
- Media headlines (per outlet)
- Citizen voices (sampled LLM reactions, with ideology badges)
- Stat changes (parameter arrows)
- Interim approval
- Any events triggered
- Dismiss → dashboard updates

---

## Phase 11 — Full Integration

**Goal:** Replace all mock data with live API calls.

### 11.1 API Client (`city_of_agents_ui/src/api/client.ts`)

```typescript
interface GameAPIClient {
  // City profile
  generateProfile(cityName: string, constraints?: string): Promise<CityProfile>;

  // Game session
  newGame(profile: CityProfile, ministers: MinisterSelection[]): Promise<{ gameId: string; state: GameState }>;
  getState(gameId: string): Promise<GameState>;

  // Consultation
  consultMinister(gameId: string, ministerId: string, message: string): Promise<ConsultResponse>;
  getPolicies(gameId: string): Promise<Policy[]>;

  // Turn execution
  submitTurn(gameId: string, params: TurnSubmission): Promise<TurnResult>;

  // Election
  getScorecard(gameId: string): Promise<GovernanceScorecard>;
}
```

Switch via `VITE_API_MODE=mock|real` env var.

### 11.2 Streaming for Consultation

Minister responses should stream (they're conversational). Use SSE or fetch with ReadableStream.

```
GET /game/{game_id}/consult/stream
Query: minister_id, message
Response: text/event-stream
```

### 11.3 Loading States

Every API call needs a proper loading state:
- Consultation: typing indicator on minister avatar
- Policy draft: "Compiling policy options..." spinner
- Turn execution: turn-phases progress (Implementation → Citizens → Media → Feedback)

---

## Phase 12 — Polish, Testing & CI

### 12.1 Tests

| Layer | What to Test |
|-------|--------------|
| `engine/` unit tests | Each formula: execution score, wellbeing delta, corruption leakage, alignment drift. Edge cases: execution=0.10 floor, wellbeing diminishing returns. |
| `simulation/` integration | Full 20-turn game loop with PRNG. Same seed → same numbers. |
| `api/` endpoint tests | Profile generation retry on validation failure. Turn submission validates policy. |
| UI component tests | Vitest + React Testing Library. Policy card renders correctly. Turn report overlay shows on turn completion. |

### 12.2 CI (already in `.github/workflows/ci.yml`)

Current CI runs: `ruff check`, `compileall`, `pytest`. Extend:
- Add `uv run pytest tests/test_engine/` explicitly
- Add `npm run build` for frontend

### 12.3 Known Issues to Resolve

| # | Issue | Fix |
|---|-------|-----|
| 1 | Garbled text in Figma-derived city/minister names | Replace with real culturally appropriate names |
| 2 | Portfolio mismatch (Figma shows more than 7) | Consolidate to 7 engine portfolios |
| 3 | Ideology not yet shown in any UI | Add ideology badges to: ApplicantCard, CityChatter citizen posts |
| 4 | Consultation transcript grows unbounded per session | Add token budget; compress older turns after 5 turns |
| 5 | LLM hallucinated policies may reference wrong parameters | Validate portfolio scope check (policy targets only its portfolio's params) |

---

## Milestone Summary

| Phase | Deliverable | Test |
|-------|-------------|------|
| 0 | Pydantic models + TypeScript types | `compileall` + `tsc --noEmit` |
| 1 | City Profile generation endpoint | `GET /game/profile` returns valid JSON |
| 2 | Agent generation endpoint | `POST /game/new` returns 50 citizens |
| 3 | Minister consultation | Multi-turn chat stays in character |
| 4 | Policy draft | 5 policies responsive to conversation |
| 5 | Implementation engine | Execution scores, deltas, corruption math |
| 6 | Full turn loop | CLI plays Turn 1 end-to-end |
| 7 | All game subsystems | CLI plays full 20-turn game to election |
| 8 | UI Screen 1 — City Selection | Click through, profile generated |
| 9 | UI Screen 2 — Cabinet Selection | Ministers selected, portfolios assigned |
| 10 | UI Screen 3 — Dashboard | Full dashboard live, mock data |
| 11 | Full integration | UI → API → engine → UI, all live |
| 12 | Polish + tests | CI green, no console errors, `npm run build` clean |

---

## Critical Path

```
Phase 0 (Types)
    → Phase 1 (Profile) + Phase 2 (Agents) [can overlap]
        → Phase 3 (Consultation) + Phase 5 (Engine) [can overlap]
            → Phase 4 (Policy Draft) [needs 3]
                → Phase 6 (Turn Loop) [needs 4 + 5]
                    → Phase 7 (Subsystems) [needs 6]

Phase 8-10 (UI Screens) [can run in parallel with Phases 3-7]

Phase 11 (Integration) [needs 7 + 10]
Phase 12 (Polish) [needs 11]
```

Backend Phases 0–7 and UI Phases 8–10 can proceed in parallel, with integration deferred to Phase 11.

# City of Agents

A political strategy simulation where you govern a city as Mayor, making policy decisions that affect identity groups, the economy, public trust, and your re-election chances. Every turn, LLM-powered agents react dynamically — the opposition plots against you, citizens debate in the streets, and crises emerge organically from city conditions.

## How it works

Each turn:

1. **You choose** a mayor policy (LLM-generated options tailored to city pressure fronts)
2. **Opposition framing** and **counter-framing** unfold in a multi-step narrative duel
3. **Event oracle** decides whether a crisis emerges from current city conditions
4. **Citizen groups** debate internally — their conversations shift alignment, happiness, and radicalization
5. **Media narrative cards** are published and popularity is recalculated
6. Turn closes with a full archiveable event ledger

The simulation runs for 50 turns, culminating in an election.

## Setup

### Requirements

- Python 3.10+
- OpenAI API key, Anthropic API key, or local Ollama runtime

### Install

```bash
uv sync
```

### Configure

```bash
cp .env.example .env
# Edit .env and set:
# - LLM_PROVIDER=openai | anthropic | ollama
# - OPENAI_API_KEY or ANTHROPIC_API_KEY (only for cloud providers)
# - OLLAMA_BASE_URL for local Ollama (default: http://localhost:11434/v1)
# - Optional setup-time profile generator:
#   SETUP_LLM_PROVIDER, SETUP_LLM_MODEL, SETUP_RESEARCH_MODE
```

### Run

```bash
# build the UI once (or after UI changes)
cd city_of_agents_ui && npm run build && cd ..

# run backend + static UI server
python server.py
```

Open [http://localhost:8000](http://localhost:8000) in your browser.

If you prefer pip instead of uv:

```bash
pip install openai anthropic
```

## Testing

Run the full local quality suite:

```bash
uvx ruff check .
uv run python -m compileall -q .
uv run pytest -q
cd city_of_agents_ui && npm ci && npm run build
```

Current automated coverage includes:
- 50-turn simulation invariants and seed reproducibility.
- `/v1` API contract tests (create/join/actions/events).
- Optimistic concurrency (`expected_turn`) and idempotent replay (`action_id`).
- LLM JSON parsing resilience tests.

## CI

GitHub Actions workflow: `/Users/ajaynehra/Desktop/projects/city_of_agents/.github/workflows/ci.yml`

Pipeline jobs:
- `backend`: `uv sync`, `ruff`, `compileall`, `pytest`.
- `frontend`: `npm ci` + React build.
- `docker`: image build validation.

## Container

Build and run with Docker:

```bash
docker build -t city-of-agents:test .
docker run --rm -p 8000:8000 \
  -e LLM_PROVIDER=openai \
  -e OPENAI_API_KEY=your_key_here \
  city-of-agents:test
```

For local Ollama:

```bash
docker run --rm -p 8000:8000 \
  -e LLM_PROVIDER=ollama \
  -e OLLAMA_BASE_URL=http://host.docker.internal:11434/v1 \
  city-of-agents:test
```

Or use Compose:

```bash
docker compose up --build
```

## Architecture

```text
city_of_agents/
├── server.py               # stdlib HTTP server + SSE streaming endpoint
├── city_of_agents_ui/      # React + TypeScript UI (served from dist/ by server.py)
│   ├── src/
│   └── dist/
├── core/
│   ├── game_state.py       # Central simulation state
│   └── turn_manager.py     # Turn execution (step() + stream_step() generator)
├── agents/
│   └── agent_engine.py     # Agent population, happiness/radicalization updates
├── llm/
│   ├── llm_client.py       # Provider adapter (OpenAI/Anthropic/Ollama)
│   ├── context_builder.py  # GameState → natural language context for prompts
│   ├── dynamic_policy.py   # DynamicPolicy dataclass with LLM output validation
│   ├── mayor_advisor.py    # Generates 5 mayor policy options per turn (GPT-4o)
│   ├── opposition_agent.py # Opposition reasons and acts strategically (GPT-4o)
│   ├── citizen_debates.py  # Per-group street debates, streamed one by one (GPT-4o-mini)
│   └── event_generator.py  # Contextual crisis generation (GPT-4o-mini)
├── politics/
│   ├── policy_engine.py    # Applies policy effects to city stats and agent state
│   └── election_engine.py  # Vote share calculation
├── events/
│   └── event_engine.py     # Rule-based event escalation for active events
├── media/
│   └── media_engine.py     # Sensationalism, bias, rumor spread
├── config/
│   ├── cities/             # City-specific cached profiles (Delhi, NYC, London, Tokyo, Dubai)
│   ├── policies.json       # Static policy definitions (CLI mode)
│   └── events.json         # Static event definitions (rule-based escalation)
├── setup/
│   ├── profile_generator.py
│   ├── retrieval_adapter.py
│   ├── profile_prompt.py
│   └── profile_validator.py
└── main.py                 # Headless CLI simulation mode
```

## Environment variables

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `LLM_PROVIDER` | `openai` | LLM backend: `openai`, `anthropic`, or `ollama`. |
| `OPENAI_API_KEY` | — | OpenAI key (required when provider is `openai`). |
| `ANTHROPIC_API_KEY` | — | Anthropic key (required when provider is `anthropic`). |
| `LLM_API_KEY` | — | Optional shared key variable (can replace provider-specific key vars). |
| `LLM_MODEL` | `gpt-4o` | Model for mayor advisor and opposition agent. |
| `LLM_DEBATE_MODEL` | `gpt-4o-mini` | Model for citizen debates and event generation. |
| `LLM_TEMPERATURE` | `0.8` | Shared temperature for both providers. |
| `LLM_MAX_TOKENS` | `2500` | Max output tokens (used by Anthropic calls). |
| `OLLAMA_BASE_URL` | `http://localhost:11434/v1` | OpenAI-compatible endpoint used when provider is `ollama`. |
| `SETUP_LLM_PROVIDER` | `anthropic` | Provider for city-profile generation endpoints. |
| `SETUP_LLM_MODEL` | provider default | Model for city-profile generation. |
| `SETUP_RESEARCH_MODE` | `auto` | `auto`, `provider_web`, or `backend_fetch` for setup evidence mode. |

## Runtime modes

1. `main.py`: headless CLI simulation, fully formula/rule-based (no LLM turn loop).
2. `server.py`: local HTTP server + SSE streaming for interactive LLM-driven turns (used by UI).

## Versioned API (`v1`)

The backend now exposes a versioned contract under `/v1` for forward-compatible multiplayer/event-driven evolution.

- `POST /v1/games`
  - Creates a game session.
  - Body: `{ "seed"?: number, "turns"?: number, "election_turn"?: number }`
  - Returns: `{ "api_version": "v1", "game_id": string, "state": StateSnapshot }`
- `GET /v1/games/{game_id}/state`
  - Returns latest authoritative snapshot for a game.
- `GET /v1/games/{game_id}/policies`
  - Returns current mayor policy options for the next turn.
- `POST /v1/games/{game_id}/join`
  - Registers a participant for multiplayer-compatible session metadata.
  - Body: `{ "role"?: "mayor"|"opposition"|"spectator", "player_name"?: string }`
- `POST /v1/games/{game_id}/actions`
  - Submits an actor action.
  - Body:
    - `actor`: currently `mayor` (opposition reserved for future multiplayer phases)
    - `policy_id`: selected policy id
    - `participant_id` (optional): validates actor ownership
    - `expected_turn` (optional): optimistic concurrency check; returns `409` on mismatch
    - `action_id` (optional): idempotency key; duplicate submissions replay cached result
  - Runs a turn and appends structured events to that game's event buffer.
- `GET /v1/games/{game_id}/events`
  - SSE endpoint for event envelopes.
  - Query: `after_event_id` (default `0`), `follow` (`0/1`), `timeout` (seconds).
- `GET /v1/setup/options`
  - Returns setup defaults/limits + profile readiness metadata for each city.
- `GET /v1/setup/cities/{city_id}/status`
  - Returns city profile readiness/version and last error.
- `GET /v1/setup/cities/{city_id}/profile`
  - Returns validated city profile payload.
- `POST /v1/setup/cities/{city_id}/generate`
  - Generates or refreshes a city profile (cached when already ready unless `force_refresh=true`).
- `POST /v1/games/{game_id}/advisor/sessions`
  - Creates or returns advisor session for the current turn.
- `GET /v1/games/{game_id}/advisor/sessions/{session_id}`
  - Reads advisor session state + threads.
- `POST /v1/games/{game_id}/advisor/sessions/{session_id}/messages`
  - Advisor Q&A for global or option-scoped thread.
- `POST /v1/games/{game_id}/advisor/sessions/{session_id}/revise`
  - Revises one option (`mode=single`) or regenerates all five (`mode=full`).

Event envelope format (SSE `data:` payload):

```json
{
  "event_id": 12,
  "game_id": "f4c1...",
  "turn": 4,
  "type": "mayor_action",
  "actor": "mayor",
  "timestamp": 1739970000.123,
  "payload": { "...": "event-specific data" }
}
```

Legacy `/api/*` routes are still available for current UI compatibility and can be phased out after UI migration.

`TurnManager` now supports dependency-injected orchestration ports (mayor advisor, opposition agent, citizen debates, event generator), so agent orchestration can be scaled/replaced without changing turn math.

### CLI mode

Run the simulation headlessly (formula-based, no LLM calls):

```bash
python main.py
```

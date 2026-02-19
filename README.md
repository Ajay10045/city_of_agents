# 🏛️ City of Power

City of Power is an open-source political strategy simulation where a city evolves through policy, media pressure, social tension, and elections.

The long-term vision is a **city of LLM citizens**. The current version is a strong **rule-based simulation core** with a web UI and API, designed to be extended into provider-agnostic LLM agents.

---

## Current State (as of February 2026)

### ✅ Implemented and working

- Full simulation loop in Python (policy -> city stats -> agent updates -> events -> media -> popularity -> election)
- 90 agents with role + identity + relationships
- Rule-based agent state updates (happiness, radicalization, alignment)
- Event engine with probabilistic triggers and escalation
- Media engine with rumor pressure and popularity modifiers
- Election engine with undecided/swing dynamics and coalition outcomes
- FastAPI endpoint for running simulations (`POST /api/simulate`)
- React/Vite UI for running and visualizing outcomes
- CLI simulation entrypoint via `main.py`
- Deterministic seeds for reproducible runs

### 🚧 Not yet implemented

- Per-agent LLM cognition (each citizen calling an LLM)
- Agent-generated thoughts/dialogue surfaced in UI
- Human-vs-human turn input (currently automated policy selection)
- Provider-agnostic LLM adapter layer (Anthropic/OpenAI/local/etc.)

---

## Why this project exists

Most strategy games script outcomes. City of Power focuses on **emergence**:

- Identity-aware populations
- Feedback loops between trust, tension, corruption, and media
- Elections shaped by sentiment, narrative, and campaign effects
- Repeatable but non-identical city histories

---

## Repository Map

```text
city_of_agents/
├── main.py                      # CLI simulation entrypoint
├── api/
│   ├── main.py                  # FastAPI app + CORS
│   └── routes/simulation.py     # /api/simulate endpoint
├── agents/
│   ├── agent.py                 # Agent + AgentIdentity models
│   ├── agent_engine.py          # Population init + behavior updates
│   ├── identity_group.py        # IdentityGroup model + config loader
│   └── relationship.py          # Agent relationship edges
├── core/
│   ├── city_stats.py            # City stat model and clamped deltas
│   ├── game_state.py            # Canonical simulation state + snapshot
│   └── turn_manager.py          # Main turn orchestration
├── events/
│   ├── event.py                 # Event definitions + active events
│   └── event_engine.py          # Trigger, escalate, apply effects
├── media/
│   └── media_engine.py          # Bias/trust/sensationalism mechanics
├── politics/
│   ├── policy_engine.py         # Policy selection/effects
│   └── election_engine.py       # Vote share and outcomes
├── llm/                         # Provider-agnostic LLM abstraction (scaffold)
│   ├── base.py
│   ├── config.py
│   ├── factory.py
│   └── types.py
├── config/
│   ├── identities.json          # Groups, role distributions, initial stats
│   ├── policies.json            # Mayor + opposition action definitions
│   ├── events.json              # Event definitions and conditions
│   └── llm.json                 # LLM provider/model defaults
├── ui/                          # React + Vite frontend
├── tests/                       # Simulation tests
├── docs/
│   ├── city_of_power.md
│   ├── city_of_power_schema.md
│   ├── city_of_power_tech.md
│   ├── city_of_power_task_breakdown.md
│   └── TODO.md                  # Active roadmap (added for collaborators)
├── .env.example                 # LLM/runtime environment variables
├── pyproject.toml
└── Makefile
```

---

## Quickstart for collaborators

### Prerequisites

- Python 3.9+
- Node.js 18+
- [uv](https://github.com/astral-sh/uv)

### 1) Clone

```bash
git clone https://github.com/Ajay10045/city_of_agents.git
cd city_of_agents
```

### 2) Install Python dependencies

```bash
source .venv/bin/activate || uv venv && source .venv/bin/activate
uv sync
```

### 3) Install frontend dependencies

```bash
cd ui && npm install && cd ..
```

### 3.5) Configure environment (optional, for upcoming LLM mode)

```bash
cp .env.example .env
```

Set `LLM_PROVIDER`, `LLM_MODEL`, and `LLM_API_KEY` as needed.

### 4) Run backend + frontend

Terminal A:

```bash
source .venv/bin/activate
uvicorn api.main:app --reload --port 8000
```

Terminal B:

```bash
cd ui
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## CLI usage

```bash
source .venv/bin/activate
python main.py
python main.py --turns 100 --election-turn 75 --seed 42
python main.py --turns 50 --save-snapshot output.json
```

---

## API

### `POST /api/simulate`

Request:

```json
{
  "turns": 50,
  "election_turn": 50,
  "seed": 42
}
```

Response includes:

- per-turn timeline
- triggered and escalated events
- popularity shifts
- final city stats
- media state
- election result + histories

---

## Simulation model summary

### Core city stats

Economy, Employment, Law & Order, Infrastructure, Environment, Corruption, Social Tension, Media Freedom, Public Trust

### Event chance function

```text
EventChance = base_risk
            + social_tension * 0.3
            + corruption * 0.2
            + avg_radicalization * 0.2
            - law_and_order * 0.25
            - public_trust * 0.15
```

### Default identity groups

- River Union (43%)
- Merchant Bloc (31%)
- Campus Front (26%)

---

## Collaboration notes

- Start with [docs/TODO.md](docs/TODO.md) for active roadmap and priorities.
- Keep config-driven behavior in `config/*.json` where possible.
- Add tests for simulation mechanic changes in [tests/test_simulation_mvp.py](tests/test_simulation_mvp.py).
- Preserve deterministic behavior with seeds for reproducibility.

---

## Roadmap direction

Next major milestone: **provider-agnostic LLM agent integration** so every citizen can be powered by Anthropic/OpenAI/local models and surfaced in UI with thought/action traces.

---

## License

MIT

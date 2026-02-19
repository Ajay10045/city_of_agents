# 🏛️ City of Power

> **AI-driven political simulation** — Two players compete for control of a living city. The Mayor governs and passes policies. The Opposition challenges decisions, influences public opinion, and attempts to win elections. 90 autonomous AI agents react dynamically, generating emergent crises and political outcomes.

---

## What is this?

City of Power is an open-source political strategy simulation engine. It is **not a scripted game** — every run produces a unique emergent narrative driven by:

- **Identity-aware AI agents** with wealth, influence, happiness, radicalization, and political alignment
- **9 city stats** (Economy, Employment, Law & Order, Infrastructure, Environment, Corruption, Social Tension, Media Freedom, Public Trust)
- **Crisis events** that trigger based on city conditions (Social Conflict, Financial Fraud, Political Scandal, Economic Shock, Natural Disaster)
- **Media system** that amplifies rumors and shifts public opinion
- **Election engine** with undecided blocs, swing voters, and momentum mechanics

---

## Project Structure

```
city_of_agents/
├── api/                    # FastAPI backend
│   ├── main.py             # App entry point + CORS
│   └── routes/
│       └── simulation.py   # POST /api/simulate endpoint
├── agents/                 # Agent data model + engine
│   ├── agent.py
│   ├── agent_engine.py
│   ├── identity_group.py
│   └── relationship.py
├── config/                 # Simulation configuration (JSON)
│   ├── events.json         # 5 crisis event templates
│   ├── identities.json     # 3 identity groups + initial city stats
│   └── policies.json       # 12 policy actions (6 mayor, 6 opposition)
├── core/                   # Game state + turn loop
│   ├── city_stats.py
│   ├── game_state.py
│   └── turn_manager.py
├── events/                 # Crisis/event engine
├── media/                  # Media narrative engine
├── politics/               # Election + policy engines
├── tests/                  # Integration tests
├── ui/                     # React + Vite + Tailwind frontend
│   └── src/
│       ├── App.tsx
│       └── components/
│           ├── SimulationConfig.tsx
│           ├── ElectionBanner.tsx
│           ├── PopularityChart.tsx
│           ├── CityStatsChart.tsx
│           ├── TurnFeed.tsx
│           └── MetricCard.tsx
├── main.py                 # CLI entry point
├── requirements.txt        # Python dependencies
└── Makefile                # Dev shortcuts
```

---

## Quickstart

### Prerequisites

- Python 3.9+
- Node.js 18+
- [uv](https://github.com/astral-sh/uv) (fast Python package manager)

### 1. Clone & set up

```bash
git clone https://github.com/Ajay10045/city_of_agents.git
cd city_of_agents
```

### 2. Python environment

```bash
uv venv
source .venv/bin/activate
uv pip install -r requirements.txt
```

### 3. Frontend dependencies

```bash
cd ui && npm install && cd ..
```

### 4. Run locally (full stack)

Open **two terminals**:

**Terminal 1 — API:**
```bash
source .venv/bin/activate && uvicorn api.main:app --reload --port 8000
```

**Terminal 2 — UI:**
```bash
cd ui && npm run dev
```

Then open **http://localhost:5173** in your browser.

---

## CLI Usage (no UI)

```bash
source .venv/bin/activate
python main.py                                          # random seed, 50 turns
python main.py --turns 100 --election-turn 75 --seed 42
python main.py --turns 50 --save-snapshot output.json  # save full JSON snapshot
```

---

## Run Tests

```bash
source .venv/bin/activate
python -m pytest tests/
```

---

## How It Works

### Turn Loop (per turn)
1. Mayor selects 1 policy action
2. Opposition selects 1 action
3. City stats update based on policy effects
4. Agent happiness, radicalization, and alignment recalculate
5. Media narrative updates (rumor pressure, bias, sensationalism)
6. Crisis events trigger based on city conditions
7. Popularity recalculates from agent alignment × media modifiers
8. On election turn → election resolves

### Event Probability Formula
```
EventChance = base_risk
            + (social_tension × 0.3)
            + (corruption × 0.2)
            + (avg_radicalization × 0.2)
            − (law_and_order × 0.25)
            − (public_trust × 0.15)
```

### Identity Groups (default config)
| Group | Population | Grievance | Key sensitivities |
|---|---|---|---|
| River Union | 43% | High (0.58) | Economy, Social Tension |
| Merchant Bloc | 31% | Low (0.34) | Economy, Corruption |
| Campus Front | 26% | Medium (0.47) | Media Freedom, Law & Order |

---

## API

### `POST /api/simulate`

**Request:**
```json
{
  "turns": 50,
  "election_turn": 50,
  "seed": 42
}
```

**Response:** Full simulation result with per-turn structured data, final city stats, election result, agent averages, and history logs.

---

## License

MIT — free to use, modify, and build on.

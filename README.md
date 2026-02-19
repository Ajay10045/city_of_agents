# City of Agents

A political strategy simulation where you govern a city as Mayor, making policy decisions that affect identity groups, the economy, public trust, and your re-election chances. Every turn, LLM-powered agents react dynamically — the opposition plots against you, citizens debate in the streets, and crises emerge organically from city conditions.

## How it works

Each turn:
1. **You choose** a mayor policy (LLM-generated options tailored to the current city state)
2. **Opposition agent** (GPT-4o) reads the city state and your move, then decides its own counter-action
3. **Event oracle** (GPT-4o-mini) decides whether a crisis emerges based on city conditions
4. **Citizen groups** (GPT-4o-mini) debate internally — their conversations shift alignment, happiness, and radicalization
5. All of this streams to the UI in real time as each agent finishes

The simulation runs for 50 turns, culminating in an election.

## Setup

### Requirements

- Python 3.10+
- OpenAI API key

### Install

```bash
pip install openai
```

### Configure

```bash
cp .env.example .env
# Edit .env and set your OPENAI_API_KEY
```

### Run

```bash
python server.py
```

Open [http://localhost:8000](http://localhost:8000) in your browser.

## Architecture

```
city_of_agents/
├── server.py               # stdlib HTTP server + SSE streaming endpoint
├── core/
│   ├── game_state.py       # Central simulation state
│   └── turn_manager.py     # Turn execution (step() + stream_step() generator)
├── agents/
│   └── agent_engine.py     # Agent population, happiness/radicalization updates
├── llm/
│   ├── llm_client.py       # OpenAI wrapper (JSON mode)
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
│   ├── identities.json     # Identity groups, city starting stats
│   ├── policies.json       # Static policy definitions (CLI mode)
│   └── events.json         # Static event definitions (rule-based escalation)
└── ui/
    ├── index.html
    ├── app.js              # EventSource streaming, renders each agent step live
    └── style.css
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | — | Required. Your OpenAI API key. |
| `LLM_MODEL` | `gpt-4o` | Model for mayor advisor and opposition agent. |
| `LLM_DEBATE_MODEL` | `gpt-4o-mini` | Model for citizen debates and event generation. |

## CLI mode

Run the simulation headlessly (formula-based, no LLM calls):

```bash
python main.py
```

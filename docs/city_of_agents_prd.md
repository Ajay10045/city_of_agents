# city_of_agents — Product Requirements Document

## 1) Product Definition

`city_of_agents` is a political strategy simulation game where the player is Mayor and competes against an AI Opposition.

Core objective: stay in power by making effective, credible policies under social, economic, and media pressure.

---

## 2) Core Design Principles

- Systems-driven simulation, not scripted outcomes
- Player freedom with consequences (no hard blocking of risky choices)
- Opposition AI should capitalize on player mistakes
- Citizens and media should continuously reflect city sentiment
- Clear cause-and-effect visibility in UI

---

## 3) Non-Negotiable Gameplay Rules

### 3.1 Credibility is central

- Overpromising is allowed
- Overpromising is **not** hard-blocked
- Repeated promise-delivery gaps reduce credibility
- Low credibility must increase Opposition conversion effectiveness

### 3.2 Corruption/intimidation is dangerous

- Corruption/intimidation options are allowed
- They can provide short-term gains
- They must create long-term political and social risk
- Opposition should aggressively exploit these signals

---

## 4) Player Loop

Each turn:

1. Player selects Mayor action
2. AI Opposition selects counter-action
3. City stats and sentiment update
4. Events trigger/escalate
5. Media narrative updates
6. Citizen summary stream updates
7. Popularity/campaign update
8. Election resolution (on election turn)

Win condition: remain in power through elections while avoiding systemic collapse.

---

## 5) Baseline UI and Metrics to Preserve

Must preserve these dashboard blocks:

- City statistics
  - Economy
  - Employment
  - Law & Order
  - Infrastructure
  - Environment
  - Corruption
  - Social Tension
  - Media Freedom
  - Public Trust
- Popularity (Mayor/Opposition)
- Campaign strength (Mayor/Opposition)
- Media panel (Bias, Sensationalism, Trust)
- Identity groups panel
- Turn/event stream panel

Default baseline values for new game:

- Economy 54
- Employment 50
- Law & Order 52
- Infrastructure 50
- Environment 50
- Corruption 42
- Social Tension 44
- Media Freedom 58
- Public Trust 50
- Mayor Popularity 50.0%
- Opposition Popularity 50.0%
- Campaign Strength Mayor/Opposition 1.000
- Media: Bias neutral, Sensationalism 46, Trust 54

---

## 6) Required New Systems

### 6.1 Credibility Ledger

Track:

- Promise strength
- Delivery window
- Observed delivery
- Promise gap

Output:

- `credibility_score` (0–100)
- Turn-level credibility delta

### 6.2 Opposition Capitalization Logic

Opposition AI should prioritize:

- Credibility collapse narratives
- Corruption/scandal expose strategies
- Vulnerable groups with high grievance and low trust

### 6.3 Citizen and Media Streams

Near-term implementation:

- LLM citizen summary per turn
- LLM media bulletin per turn
- Group-level sentiment snapshots

---

## 7) LLM Simulation Scope (Phased)

### Phase A (summary-first)

- Not every citizen is fully orchestrated per turn
- Generate representative summaries and group signals

### Phase B (sampled citizens)

- Sample representative citizens per identity group
- Synthesize group demand vectors (jobs, safety, corruption, freedoms, etc.)

### Phase C (expanded simulation)

- Broader citizen reasoning with memory
- Identity groups derive demands from citizen concerns
- Media continuously summarizes city-wide thought trends

---

## 8) Architecture Direction (Naming Standard)

Use `city_of_agents` consistently across project assets.

Canonical naming:

- Project name: `city_of_agents`
- Backend logical module: `city_of_agents_backend`
- Frontend logical module: `city_of_agents_ui`
- Docs primary file: `docs/city_of_agents_prd.md`

Note: existing runtime paths can be migrated incrementally; naming consistency should be enforced for new files/modules from now onward.

---

## 9) Delivery Sequence

Approved sequence:

1. Build stable frontend foundation first (modular/scalable)
2. Implement credibility system
3. Implement Opposition capitalization mechanics
4. Implement citizen/media demand synthesis stream

---

## 10) Success Criteria

- Player can clearly see policy consequence chains
- Low credibility measurably harms reelection odds
- Corruption/intimidation has meaningful long-term downside
- Opposition behavior feels strategic and adaptive
- Citizen/media streams improve decision quality, not noise

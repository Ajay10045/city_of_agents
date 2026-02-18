# City of Power
## Product Requirements Document (PRD)

---

# 1. Product Overview

Genre: Political Strategy + AI Social Simulation  
Mode: 2 Player (Mayor vs Opposition)

Core Concept:
A living AI-driven city where two human players compete politically. The Mayor governs and passes policies. The Opposition challenges decisions, influences public opinion, and attempts to win elections. Autonomous AI agents react dynamically, generating emergent crises and political outcomes.

---

# 2. Game Vision

- Fully systemic political sandbox
- Emergent storytelling (not scripted)
- Identity-aware AI agents
- Crisis-driven evolution
- Election-based power transitions
- High replayability

Design Principles:
- Systems over scripts
- Trade-offs over perfect decisions
- Emergence over linear storytelling
- Balance over bias
- Player agency over randomness

---

# 3. Core Game Loop

Each Turn:

1. Mayor selects 1–2 actions
2. Opposition selects 1 action
3. Simulation Engine updates AI agents
4. Event Engine evaluates crisis probability
5. City stats update
6. Popularity recalculated

After N Turns → Election Phase

---

# 4. City Macro System

All stats range from 0–100.

Core Stats:
- Economy
- Employment
- Law & Order
- Infrastructure
- Environment
- Corruption
- Social Tension
- Media Freedom
- Public Trust

Derived Stats:
- Stability Index
- Crisis Probability
- Investment Confidence
- Protest Risk

---

# 5. AI Agent System

Agent Structure:

Agent {
  ID
  Role (Businessman, Worker, Politician, Journalist, Student, etc.)
  Wealth
  Influence
  Traits[] (greedy, idealistic, loyal, radical, corrupt, ambitious)

  Identity {
    Religion
    Caste / Social Group
    Language
  }

  Radicalization (0–100)
  Political Alignment (-100 to +100)
  Happiness (0–100)
  TrustInGovernment (0–100)

  Relationships[] {
      TargetAgentID
      Strength (0–100)
  }
}

---

# 6. Identity & Social Group System

Each Identity Group:

- Population Percentage
- Economic Modifier
- Education Modifier
- Historical Grievance Score
- Radicalization Base Rate
- Leader Agents

Important:
No identity has fixed behavior.
Outcomes emerge from:
- Economic conditions
- Policy impact
- Media narrative
- Crisis handling

---

# 7. Radicalization System

Each group contains:
- Moderate %
- Radical %
- Passive %

Radicalization increases when:
- Grievances ignored
- Crisis mishandled
- Economic inequality rises
- Media sensationalism high
- Identity-based rhetoric increases

High radicalization increases:
- Protest probability
- Social conflict probability
- Political polarization
- Election volatility

---

# 8. Universal Crisis & Event Engine

Event Template:

Event {
  Type (Social, Financial, Political, Disaster)
  TriggerConditions[]
  ProbabilityFormula
  AffectedGroups[]
  EscalationLevel (1–5)
  NarrativeSummary
  MayorResponseOptions[]
  OppositionResponseOptions[]
}

---

# 9. Event Probability Formula

EventChance =
BaseRisk
+ (SocialTension × 0.3)
+ (Corruption × 0.2)
+ (AverageRadicalization × 0.2)
- (LawAndOrder × 0.25)
- (PublicTrust × 0.15)

---

# 10. Event Categories

Social Conflict:
- Trigger: High polarization
- Effect: Happiness shift, radicalization rise

Financial Fraud:
- Trigger: High corruption + weak regulation
- Effect: Economy ↓, Trust ↓

Economic Shock:
- Trigger: Low reserves + high unemployment
- Effect: Worker unrest ↑

Political Scandal:
- Trigger: Investigation success
- Effect: Popularity drop

Natural Disaster:
- Trigger: Random low probability
- Effect: Infrastructure damage, emergency spending

---

# 11. Rumor Propagation System

SpreadChance =
NetworkDensity
× MediaSensationalism
× RadicalizationLevel
- MediaTrust

Rumors:
- Shift alignment
- Increase polarization
- Trigger crisis events

---

# 12. Media System

Media Variables:
- Bias (-50 to +50)
- Sensationalism (0–100)
- Public Trust (0–100)

Media impacts:
- Popularity multipliers
- Crisis amplification
- Undecided voters
- Rumor spread speed

---

# 13. Player Roles

Mayor Actions:
- Pass Policy
- Allocate Budget
- Emergency Action
- Investigate / Arrest
- Public Address
- Regulatory Reform

Mayor Resource:
- Executive Power Meter

Opposition Actions:
- Organize Protest
- Media Campaign
- Expose Scandal
- Form Coalition
- Policy Promise
- Public Rally

Opposition Resource:
- Influence Power Meter

---

# 14. Policy System

Each policy:
- Positively affects 2–3 stats
- Negatively affects 1–2 stats
- Affects identity groups differently
- Has short-term and long-term effects

Example:
Lower Business Tax:
+ Economy
+ Business Happiness
- Public Revenue
- Worker Sentiment

---

# 15. Election System

Occurs every N turns.

VoteShare =
GroupPopulation
× GroupHappiness
× AlignmentStrength
× CampaignStrength
× MediaModifier

Includes:
- Swing voters
- Undecided bloc
- Silent majority
- Coalition formation if no majority

Outcomes:
- Majority win
- Coalition government
- Hung council

---

# 16. Victory Conditions

Win:
- Win election
- Maintain long-term stability

Lose:
- Economic collapse
- Civil breakdown
- Bankruptcy
- Extreme instability takeover
- Permanent trust collapse

---

# 17. MVP Scope

Version 1:
- 3 Identity Groups
- 5 Agent Roles
- 6 Core City Stats
- 3 Crisis Types
- Basic Media System
- Basic Radicalization Model
- Basic Election System
- Turn-based UI (no map)

Focus: Simulation Core First

---

# 18. Technical Architecture

Backend:
- Simulation engine (Python or C#)

Frontend:
- Unity or Godot

Data Driven:
- JSON-based policies
- JSON-based events
- Configurable identity groups

AI Version 1:
- Deterministic rule-based system

AI Version 2:
- Hybrid rule + LLM agents

---

END OF FILE

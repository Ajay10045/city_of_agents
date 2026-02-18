# City of Power
## Technical Specification Document

---

# 1. System Architecture Overview

Architecture Style: Modular Simulation Engine

Core Modules:

- Turn Manager
- Simulation Engine
- Agent Engine
- Event Engine
- Media Engine
- Election Engine
- Policy Engine
- Data Loader (JSON configs)
- Persistence Layer (Save/Load)

---

# 2. Game State Model

GameState {
  TurnNumber
  MayorPopularity
  OppositionPopularity
  CityStats
  IdentityGroups[]
  Agents[]
  ActiveEvents[]
  MediaState
}

---

# 3. Simulation Flow Per Turn

1. Apply Mayor Action
2. Apply Opposition Action
3. Update City Stats
4. Update Agent Happiness
5. Update Radicalization
6. Propagate Rumors
7. Evaluate Crisis Triggers
8. Apply Event Effects
9. Recalculate Popularity
10. Check Election Trigger

---

# 4. Core Engines

## 4.1 Agent Engine

Responsibilities:
- Update agent happiness
- Update political alignment
- Manage relationships
- Calculate radicalization growth
- Influence spread

---

## 4.2 Event Engine

Responsibilities:
- Evaluate probability formula
- Trigger new events
- Escalate existing events
- Apply stat modifiers

---

## 4.3 Media Engine

Responsibilities:
- Adjust narrative modifiers
- Influence popularity multiplier
- Modify rumor spread rate

---

## 4.4 Election Engine

Responsibilities:
- Aggregate vote share
- Apply campaign modifiers
- Determine outcome
- Trigger government transition

---

# 5. Performance Considerations

- Agents simulated in batches
- Use weighted averages for large populations
- Cache derived stats per turn
- Avoid per-agent O(n²) operations

---

# 6. Save System

Persist:
- GameState JSON snapshot
- Agent list
- Identity group state
- Active events

---

# 7. Extensibility

All policies, identities, and events loaded from JSON config files.

Simulation engine must not hardcode:
- Identity behavior
- Event outcomes
- Policy effects

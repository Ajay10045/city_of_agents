from __future__ import annotations

import json
import random
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from agents.agent import Agent
from agents.identity_group import IdentityGroup
from agents.relationship import Relationship
from core.city_stats import CityStats
from events.event import ActiveEvent
from media.media_engine import MediaState


@dataclass
class TimedEffect:
    source_id: str
    actor: str
    remaining_turns: int
    city_effects: dict[str, float] = field(default_factory=dict)
    group_effects: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class GameState:
    turn_number: int
    total_turns: int
    election_turn: int
    mayor_popularity: float
    opposition_popularity: float
    city_stats: CityStats
    identity_groups: dict[str, IdentityGroup]
    agents: list[Agent]
    relationships: list[Relationship]
    active_events: list[ActiveEvent]
    media_state: MediaState
    rng: random.Random = field(repr=False)
    rng_seed: int | None = None
    campaign_strength: dict[str, float] = field(
        default_factory=lambda: {"mayor": 1.0, "opposition": 1.0}
    )
    event_cooldowns: dict[str, int] = field(default_factory=dict)
    long_term_effects: list[TimedEffect] = field(default_factory=list)
    election_results: list[dict[str, Any]] = field(default_factory=list)
    policy_history: list[str] = field(default_factory=list)
    event_history: list[str] = field(default_factory=list)
    credibility_score: float = 60.0
    last_credibility_delta: float = 0.0
    promise_ledger: list[dict[str, Any]] = field(default_factory=list)
    governing_party: str = "Mayor"
    simulation_profile: dict[str, Any] = field(default_factory=dict)

    def average_agent_field(self, field_name: str) -> float:
        total_weight = sum(agent.population_weight for agent in self.agents)
        if total_weight <= 0:
            return 0.0
        return (
            sum(getattr(agent, field_name) * agent.population_weight for agent in self.agents)
            / total_weight
        )

    def tick_cooldowns(self) -> None:
        next_values: dict[str, int] = {}
        for event_id, turns in self.event_cooldowns.items():
            if turns > 1:
                next_values[event_id] = turns - 1
        self.event_cooldowns = next_values

    def snapshot(self) -> dict[str, Any]:
        return {
            "turn_number": self.turn_number,
            "total_turns": self.total_turns,
            "election_turn": self.election_turn,
            "mayor_popularity": self.mayor_popularity,
            "opposition_popularity": self.opposition_popularity,
            "governing_party": self.governing_party,
            "city_stats": asdict(self.city_stats),
            "media_state": asdict(self.media_state),
            "campaign_strength": dict(self.campaign_strength),
            "identity_groups": {
                key: asdict(group) for key, group in self.identity_groups.items()
            },
            "agents": [asdict(agent) for agent in self.agents],
            "relationships": [asdict(rel) for rel in self.relationships],
            "active_events": [asdict(event) for event in self.active_events],
            "long_term_effects": [asdict(effect) for effect in self.long_term_effects],
            "policy_history": list(self.policy_history),
            "event_history": list(self.event_history),
            "election_results": list(self.election_results),
            "credibility_score": self.credibility_score,
            "last_credibility_delta": self.last_credibility_delta,
            "promise_ledger": list(self.promise_ledger),
            "simulation_profile": dict(self.simulation_profile),
        }

    def save_snapshot(self, path: str | Path) -> None:
        target = Path(path)
        target.write_text(json.dumps(self.snapshot(), indent=2), encoding="utf-8")

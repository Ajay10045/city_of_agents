from __future__ import annotations

import random
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from agents.agent_engine import AgentEngine
from core.game_state import GameState
from core.turn_manager import TurnManager
from events.event_engine import EventEngine
from main import build_game_state
from media.media_engine import MediaEngine
from politics.election_engine import ElectionEngine
from politics.policy_engine import PolicyEngine

router = APIRouter()
ROOT = Path(__file__).resolve().parents[2]
CONFIG_DIR = ROOT / "config"


# ── Request / Response models ────────────────────────────────────────────────

class SimulateRequest(BaseModel):
    turns: int = Field(50, ge=1, le=300)
    election_turn: int = Field(50, ge=1, le=300)
    seed: int | None = None


# ── Capturing TurnManager ─────────────────────────────────────────────────────

class CapturingTurnManager(TurnManager):
    """Subclass of TurnManager that captures turn data as structured dicts
    instead of printing to stdout."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.turn_log: list[dict[str, Any]] = []

    # Override logging methods so nothing gets printed
    def _log_turn(
        self,
        turn: int,
        mayor_action: str,
        opposition_action: str,
        pre_stats: dict[str, float],
        post_stats: dict[str, float],
        prev_mayor_pop: float,
        prev_opp_pop: float,
        rumor_pressure: float,
        event_result: Any,
    ) -> None:
        stat_changes: dict[str, float] = {}
        for key in sorted(post_stats.keys()):
            change = post_stats[key] - pre_stats[key]
            if abs(change) >= 0.35:
                stat_changes[key] = round(change, 2)

        if self.game_state.mayor_popularity > self.game_state.opposition_popularity:
            popularity_leader = "Mayor"
        elif self.game_state.opposition_popularity > self.game_state.mayor_popularity:
            popularity_leader = "Opposition"
        else:
            popularity_leader = "Tie"

        highest_crisis = None
        if event_result.event_chances:
            name, chance = max(event_result.event_chances.items(), key=lambda x: x[1])
            highest_crisis = {"name": name, "chance": round(chance, 3)}

        self.turn_log.append({
            "turn": turn,
            "in_power": self.game_state.governing_party,
            "popularity_leader": popularity_leader,
            "mayor_action": mayor_action,
            "opposition_action": opposition_action,
            "stat_changes": stat_changes,
            "rumor_pressure": round(rumor_pressure, 3),
            "triggered_events": list(event_result.triggered_events),
            "escalated_events": list(event_result.escalated_events),
            "highest_crisis": highest_crisis,
            "mayor_popularity": round(self.game_state.mayor_popularity, 2),
            "opposition_popularity": round(self.game_state.opposition_popularity, 2),
            "mayor_delta": round(self.game_state.mayor_popularity - prev_mayor_pop, 2),
            "opposition_delta": round(
                self.game_state.opposition_popularity - prev_opp_pop, 2
            ),
            "election": None,
        })

    def _run_election(self, media_modifiers: tuple[float, float]) -> None:
        metrics = self.agent_engine.group_metrics(self.game_state.agents)
        result = self.election_engine.run_election(
            self.game_state, metrics, media_modifiers
        )
        election_data = {
            "turn": self.game_state.turn_number,
            "mayor_vote_share": round(result.mayor_vote_share, 2),
            "opposition_vote_share": round(result.opposition_vote_share, 2),
            "outcome": result.outcome,
            "undecided_bloc": round(result.undecided_bloc * 100, 1),
            "swing_voters": round(result.swing_voters * 100, 1),
            "winner": self.game_state.governing_party,
        }
        if self.turn_log:
            self.turn_log[-1]["election"] = election_data

    def _log_final_summary(self) -> None:
        pass  # Captured via game_state after run()


# ── Simulation runner (runs in thread pool) ───────────────────────────────────

def _run_simulation(request: SimulateRequest) -> dict[str, Any]:
    seed = request.seed
    if seed is None:
        seed = random.SystemRandom().randrange(1, 10**9)

    turns = request.turns
    election_turn = max(1, min(request.election_turn, turns))

    game_state, agent_engine = build_game_state(
        seed=seed,
        turns=turns,
        election_turn=election_turn,
        identities_path=CONFIG_DIR / "identities.json",
    )

    tm = CapturingTurnManager(
        game_state=game_state,
        agent_engine=agent_engine,
        policy_engine=PolicyEngine(CONFIG_DIR / "policies.json"),
        event_engine=EventEngine(CONFIG_DIR / "events.json"),
        media_engine=MediaEngine(),
        election_engine=ElectionEngine(),
    )

    final_state: GameState = tm.run()

    city_stats = final_state.city_stats.as_dict()

    return {
        "seed": seed,
        "turns": tm.turn_log,
        "final": {
            "governing_party": final_state.governing_party,
            "mayor_popularity": round(final_state.mayor_popularity, 2),
            "opposition_popularity": round(final_state.opposition_popularity, 2),
            "city_stats": {k: round(v, 1) for k, v in city_stats.items()},
            "media_state": {
                "bias": round(final_state.media_state.bias, 2),
                "sensationalism": round(final_state.media_state.sensationalism, 2),
                "trust": round(final_state.media_state.trust, 2),
                "network_density": final_state.media_state.network_density,
            },
            "happiness": round(final_state.average_agent_field("happiness"), 2),
            "radicalization": round(
                final_state.average_agent_field("radicalization"), 2
            ),
            "alignment": round(final_state.average_agent_field("alignment"), 2),
            "election_results": final_state.election_results,
            "policy_history": final_state.policy_history,
            "event_history": final_state.event_history,
        },
    }


# ── Route ─────────────────────────────────────────────────────────────────────

@router.post("/simulate")
async def simulate(request: SimulateRequest) -> dict[str, Any]:
    try:
        return await run_in_threadpool(_run_simulation, request)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

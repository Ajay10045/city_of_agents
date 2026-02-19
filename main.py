from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

from agents.agent_engine import AgentEngine
from agents.identity_group import IdentityGroup
from core.city_stats import CityStats
from core.game_state import GameState
from core.turn_manager import TurnManager
from events.event_engine import EventEngine
from media.media_engine import MediaEngine, MediaState
from politics.election_engine import ElectionEngine
from politics.policy_engine import PolicyEngine


def load_identity_config(path: Path) -> tuple[list[IdentityGroup], dict[str, float], CityStats]:
    payload = json.loads(path.read_text(encoding="utf-8"))

    groups = [IdentityGroup.from_dict(item) for item in payload.get("identity_groups", [])]
    if not groups:
        raise ValueError("identities.json must define at least one identity group")

    role_distribution = {
        str(role): float(weight)
        for role, weight in payload.get("role_distribution", {}).items()
    }
    initial_city_stats = CityStats(**payload.get("initial_city_stats", {}))

    return groups, role_distribution, initial_city_stats


def build_game_state(
    seed: int,
    turns: int,
    election_turn: int,
    identities_path: Path,
) -> tuple[GameState, AgentEngine]:
    rng = random.Random(seed)

    identity_groups, role_distribution, city_stats = load_identity_config(identities_path)

    agent_engine = AgentEngine()
    agents, relationships = agent_engine.initialize_population(
        identity_groups,
        rng,
        role_distribution=role_distribution,
        representatives_per_cell=6,
    )

    game_state = GameState(
        turn_number=0,
        total_turns=turns,
        election_turn=election_turn,
        mayor_popularity=50.0,
        opposition_popularity=50.0,
        city_stats=city_stats,
        identity_groups={group.id: group for group in identity_groups},
        agents=agents,
        relationships=relationships,
        active_events=[],
        media_state=MediaState(),
        rng=rng,
        rng_seed=seed,
    )

    return game_state, agent_engine


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="City of Agents - Simulation MVP")
    parser.add_argument("--seed", type=int, default=None, help="Deterministic RNG seed")
    parser.add_argument("--turns", type=int, default=50, help="Number of simulation turns")
    parser.add_argument(
        "--election-turn",
        type=int,
        default=50,
        help="Turn on which election is executed",
    )
    parser.add_argument(
        "--save-snapshot",
        type=str,
        default=None,
        help="Optional path to write final snapshot JSON",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    turns = max(1, args.turns)
    election_turn = max(1, min(args.election_turn, turns))

    seed = args.seed
    if seed is None:
        seed = random.SystemRandom().randrange(1, 10**9)

    root = Path(__file__).resolve().parent
    config_dir = root / "config"

    game_state, agent_engine = build_game_state(
        seed=seed,
        turns=turns,
        election_turn=election_turn,
        identities_path=config_dir / "identities.json",
    )

    policy_engine = PolicyEngine(config_dir / "policies.json")
    event_engine = EventEngine(config_dir / "events.json")
    media_engine = MediaEngine()
    election_engine = ElectionEngine()

    print("City of Agents - MVP Simulation")
    print(f"Seed: {seed}")
    print(f"Turns: {turns}")
    print(f"Election Turn: {election_turn}\n")

    turn_manager = TurnManager(
        game_state=game_state,
        agent_engine=agent_engine,
        policy_engine=policy_engine,
        event_engine=event_engine,
        media_engine=media_engine,
        election_engine=election_engine,
    )
    final_state = turn_manager.run()

    if args.save_snapshot:
        snapshot_path = Path(args.save_snapshot)
        final_state.save_snapshot(snapshot_path)
        print(f"Snapshot written to: {snapshot_path}")


if __name__ == "__main__":
    main()

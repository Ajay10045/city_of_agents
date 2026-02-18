from __future__ import annotations

import io
import unittest
from contextlib import redirect_stdout
from pathlib import Path

from core.turn_manager import TurnManager
from events.event_engine import EventEngine
from main import build_game_state
from media.media_engine import MediaEngine
from politics.election_engine import ElectionEngine
from politics.policy_engine import PolicyEngine


ROOT = Path(__file__).resolve().parents[1]
CONFIG_DIR = ROOT / "config"


def run_simulation(seed: int, turns: int = 50, election_turn: int = 50):
    game_state, agent_engine = build_game_state(
        seed=seed,
        turns=turns,
        election_turn=election_turn,
        identities_path=CONFIG_DIR / "identities.json",
    )

    policy_engine = PolicyEngine(CONFIG_DIR / "policies.json")
    event_engine = EventEngine(CONFIG_DIR / "events.json")
    media_engine = MediaEngine()
    election_engine = ElectionEngine()

    turn_manager = TurnManager(
        game_state=game_state,
        agent_engine=agent_engine,
        policy_engine=policy_engine,
        event_engine=event_engine,
        media_engine=media_engine,
        election_engine=election_engine,
    )

    with redirect_stdout(io.StringIO()):
        final_state = turn_manager.run()

    return final_state


class SimulationMVPTests(unittest.TestCase):
    def test_runs_50_turns_with_election(self) -> None:
        state = run_simulation(seed=42, turns=50, election_turn=50)

        self.assertEqual(state.turn_number, 50)
        self.assertEqual(len(state.election_results), 1)
        self.assertAlmostEqual(
            state.mayor_popularity + state.opposition_popularity,
            100.0,
            places=6,
        )

        for value in state.city_stats.as_dict().values():
            self.assertGreaterEqual(value, 0.0)
            self.assertLessEqual(value, 100.0)

    def test_seed_reproducibility(self) -> None:
        first = run_simulation(seed=314159)
        second = run_simulation(seed=314159)

        self.assertEqual(first.governing_party, second.governing_party)
        self.assertEqual(first.election_results, second.election_results)
        self.assertEqual(first.event_history, second.event_history)
        self.assertAlmostEqual(first.mayor_popularity, second.mayor_popularity, places=9)
        self.assertAlmostEqual(first.opposition_popularity, second.opposition_popularity, places=9)

    def test_different_seeds_produce_different_outcomes(self) -> None:
        first = run_simulation(seed=101)
        second = run_simulation(seed=202)

        same_outcome = (
            first.governing_party == second.governing_party
            and first.election_results == second.election_results
            and abs(first.mayor_popularity - second.mayor_popularity) < 0.001
            and abs(first.opposition_popularity - second.opposition_popularity) < 0.001
            and first.event_history == second.event_history
        )
        self.assertFalse(same_outcome)

    def test_crisis_events_occur_in_most_sampled_runs(self) -> None:
        sampled_seeds = list(range(1, 11))
        runs_with_crisis = 0

        for seed in sampled_seeds:
            state = run_simulation(seed=seed)
            if state.event_history:
                runs_with_crisis += 1

        self.assertGreaterEqual(runs_with_crisis, 6)


if __name__ == "__main__":
    unittest.main(verbosity=2)

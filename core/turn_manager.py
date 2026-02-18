from __future__ import annotations

from typing import Any

from agents.agent_engine import AgentEngine
from core.game_state import GameState
from events.event_engine import EventEngine
from media.media_engine import MediaEngine
from politics.election_engine import ElectionEngine
from politics.policy_engine import PolicyEngine


class TurnManager:
    def __init__(
        self,
        game_state: GameState,
        agent_engine: AgentEngine,
        policy_engine: PolicyEngine,
        event_engine: EventEngine,
        media_engine: MediaEngine,
        election_engine: ElectionEngine,
    ) -> None:
        self.game_state = game_state
        self.agent_engine = agent_engine
        self.policy_engine = policy_engine
        self.event_engine = event_engine
        self.media_engine = media_engine
        self.election_engine = election_engine

    def run(self) -> GameState:
        for turn in range(1, self.game_state.total_turns + 1):
            self.game_state.turn_number = turn
            pre_stats = self.game_state.city_stats.as_dict()
            prev_mayor_pop = self.game_state.mayor_popularity
            prev_opp_pop = self.game_state.opposition_popularity

            mayor_policy = self.policy_engine.choose_action(
                "mayor",
                self.game_state.rng,
                self.game_state,
            )
            mayor_resolution = self.policy_engine.apply_action(self.game_state, mayor_policy)

            opposition_policy = self.policy_engine.choose_action(
                "opposition",
                self.game_state.rng,
                self.game_state,
            )
            opposition_resolution = self.policy_engine.apply_action(
                self.game_state,
                opposition_policy,
            )

            long_term_resolution = self.policy_engine.apply_long_term_effects(self.game_state)

            self.media_engine.update_narrative(
                self.game_state.media_state,
                mayor_resolution.media_effects,
                opposition_resolution.media_effects,
                {},
            )

            avg_rad = self.game_state.average_agent_field("radicalization")
            rumor_chance = self.media_engine.rumor_spread_chance(self.game_state.media_state, avg_rad)
            rumor_pressure = rumor_chance
            if self.game_state.rng.random() > rumor_chance:
                rumor_pressure *= 0.35

            combined_group_effects: list[dict[str, Any]] = []
            combined_group_effects.extend(mayor_resolution.group_effects)
            combined_group_effects.extend(opposition_resolution.group_effects)
            combined_group_effects.extend(long_term_resolution.group_effects)

            self.agent_engine.update_happiness(
                self.game_state,
                combined_group_effects,
                rumor_pressure,
            )
            self.agent_engine.update_radicalization(self.game_state, rumor_pressure)

            campaign_delta = mayor_resolution.campaign_strength - opposition_resolution.campaign_strength
            self.agent_engine.propagate_alignment(self.game_state, campaign_delta, rumor_pressure)

            event_result = self.event_engine.step(self.game_state)

            if event_result.group_effects:
                self.agent_engine.apply_group_effects(self.game_state.agents, event_result.group_effects)

            self.media_engine.update_narrative(
                self.game_state.media_state,
                {},
                {},
                event_result.media_effects,
            )

            media_modifiers = self.media_engine.popularity_modifiers(self.game_state.media_state)
            mayor_popularity, opposition_popularity = self.agent_engine.recalculate_popularity(
                self.game_state,
                media_modifiers,
            )
            self.game_state.mayor_popularity = mayor_popularity
            self.game_state.opposition_popularity = opposition_popularity

            post_stats = self.game_state.city_stats.as_dict()
            self._log_turn(
                turn=turn,
                mayor_action=mayor_policy.name,
                opposition_action=opposition_policy.name,
                pre_stats=pre_stats,
                post_stats=post_stats,
                prev_mayor_pop=prev_mayor_pop,
                prev_opp_pop=prev_opp_pop,
                rumor_pressure=rumor_pressure,
                event_result=event_result,
            )

            if turn == self.game_state.election_turn:
                self._run_election(media_modifiers)

        self._log_final_summary()
        return self.game_state

    def _run_election(self, media_modifiers: tuple[float, float]) -> None:
        metrics = self.agent_engine.group_metrics(self.game_state.agents)
        result = self.election_engine.run_election(self.game_state, metrics, media_modifiers)

        print("  Election Result:")
        print(
            "    Mayor {0:.2f}% | Opposition {1:.2f}% | Outcome: {2}".format(
                result.mayor_vote_share,
                result.opposition_vote_share,
                result.outcome,
            )
        )
        print(
            "    Undecided bloc: {0:.1f}% | Swing voters: {1:.1f}%".format(
                result.undecided_bloc * 100.0,
                result.swing_voters * 100.0,
            )
        )
        print(f"    Government In Power: {self.game_state.governing_party}")

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
        if self.game_state.mayor_popularity > self.game_state.opposition_popularity:
            popularity_leader = "Mayor"
        elif self.game_state.opposition_popularity > self.game_state.mayor_popularity:
            popularity_leader = "Opposition"
        else:
            popularity_leader = "Tie"

        print(f"Turn {turn:02d}")
        print(
            f"  In Power: {self.game_state.governing_party} | Popularity Leader: {popularity_leader}"
        )
        print(f"  Mayor Action: {mayor_action}")
        print(f"  Opposition Action: {opposition_action}")

        stat_changes: list[str] = []
        for key in sorted(post_stats.keys()):
            change = post_stats[key] - pre_stats[key]
            if abs(change) >= 0.35:
                stat_changes.append(f"{key} {change:+.2f}")

        if stat_changes:
            print("  Major Stat Changes: " + ", ".join(stat_changes))
        else:
            print("  Major Stat Changes: none")

        print(f"  Rumor Pressure: {rumor_pressure:.3f}")

        if event_result.triggered_events:
            print("  Triggered Events: " + ", ".join(event_result.triggered_events))
        else:
            print("  Triggered Events: none")

        if event_result.escalated_events:
            print("  Escalations: " + ", ".join(event_result.escalated_events))

        if event_result.event_chances:
            highest_event, highest_chance = max(
                event_result.event_chances.items(),
                key=lambda item: item[1],
            )
            print(f"  Highest Crisis Risk: {highest_event} ({highest_chance:.3f})")

        mayor_delta = self.game_state.mayor_popularity - prev_mayor_pop
        opposition_delta = self.game_state.opposition_popularity - prev_opp_pop
        print(
            "  Popularity Shift: Mayor {0:+.2f} -> {1:.2f}% | Opposition {2:+.2f} -> {3:.2f}%".format(
                mayor_delta,
                self.game_state.mayor_popularity,
                opposition_delta,
                self.game_state.opposition_popularity,
            )
        )

    def _log_final_summary(self) -> None:
        print("\nSimulation Complete")
        print(f"  Governing Party: {self.game_state.governing_party}")
        print(
            "  Final Popularity: Mayor {0:.2f}% | Opposition {1:.2f}%".format(
                self.game_state.mayor_popularity,
                self.game_state.opposition_popularity,
            )
        )
        print(
            "  Final Averages: Happiness {0:.2f}, Radicalization {1:.2f}, Alignment {2:.2f}".format(
                self.game_state.average_agent_field("happiness"),
                self.game_state.average_agent_field("radicalization"),
                self.game_state.average_agent_field("alignment"),
            )
        )

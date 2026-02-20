from __future__ import annotations

from dataclasses import asdict
from typing import Any, Iterable, Protocol

from agents.agent_engine import AgentEngine
from core.game_state import GameState
from events.event_engine import EventEngine
from events.event import ActiveEvent
from media.media_engine import MediaEngine
from politics.election_engine import ElectionEngine
from politics.policy_engine import PolicyEngine
from core.credibility import apply_credibility_turn
from llm.mayor_advisor import MayorAdvisor
from llm.opposition_agent import OppositionAgent
from llm.citizen_debates import CitizenDebates
from llm.event_generator import EventGenerator
from llm.dynamic_policy import DynamicPolicy


class MayorAdvisorPort(Protocol):
    def generate_options(self, game_state: GameState) -> list[DynamicPolicy]: ...


class OppositionAgentPort(Protocol):
    def decide_action(self, game_state: GameState, mayor_action: DynamicPolicy) -> DynamicPolicy: ...


class CitizenDebatesPort(Protocol):
    def run_debates(
        self,
        game_state: GameState,
        mayor_action: DynamicPolicy,
        opp_action: DynamicPolicy,
        triggered_events: list[str],
    ) -> list[Any]: ...

    def stream_debates(
        self,
        game_state: GameState,
        mayor_action: DynamicPolicy,
        opp_action: DynamicPolicy,
        triggered_events: list[str],
    ) -> Iterable[Any]: ...


class EventGeneratorPort(Protocol):
    def maybe_generate_event(self, game_state: GameState) -> Any | None: ...


class TurnManager:
    def __init__(
        self,
        game_state: GameState,
        agent_engine: AgentEngine,
        policy_engine: PolicyEngine,
        event_engine: EventEngine,
        media_engine: MediaEngine,
        election_engine: ElectionEngine,
        mayor_advisor: MayorAdvisorPort | None = None,
        opposition_agent: OppositionAgentPort | None = None,
        citizen_debates: CitizenDebatesPort | None = None,
        event_generator: EventGeneratorPort | None = None,
    ) -> None:
        self.game_state = game_state
        self.agent_engine = agent_engine
        self.policy_engine = policy_engine
        self.event_engine = event_engine
        self.media_engine = media_engine
        self.election_engine = election_engine

        self.mayor_advisor = mayor_advisor or MayorAdvisor()
        self.opposition_agent = opposition_agent or OppositionAgent()
        self.citizen_debates = citizen_debates or CitizenDebates()
        self.event_generator = event_generator or EventGenerator()

        # Cache of current turn's mayor options (id -> DynamicPolicy)
        self._cached_mayor_options: dict[str, DynamicPolicy] = {}

    def _run_agent_impact_pass(
        self,
        mayor_action: Any,
        opposition_action: Any,
        rumor_pressure: float,
    ) -> dict[str, Any]:
        return self.agent_engine.apply_policy_impact_pass(
            game_state=self.game_state,
            mayor_effects=mayor_action.effects,
            opposition_effects=opposition_action.effects,
            mayor_group_effects=mayor_action.group_effects,
            opposition_group_effects=opposition_action.group_effects,
            rumor_pressure=rumor_pressure,
        )

    # ── Public API ─────────────────────────────────────────────────────────

    def get_mayor_options(self) -> list[DynamicPolicy]:
        """Generate and cache dynamic mayor policy options for the upcoming turn."""
        options = self.mayor_advisor.generate_options(self.game_state)
        self._cached_mayor_options = {p.id: p for p in options}
        return options

    def step(self, mayor_policy_id: str) -> dict:
        """Run a single turn with the player-chosen mayor policy."""
        turn = self.game_state.turn_number + 1
        if turn > self.game_state.total_turns:
            return {"error": "Game is already over"}

        self.game_state.turn_number = turn
        pre_stats = self.game_state.city_stats.as_dict()

        # ── Mayor action (player's choice from LLM-generated options) ──────
        mayor_policy = self._cached_mayor_options.get(mayor_policy_id)
        if mayor_policy is None:
            return {"error": f"Unknown policy id: {mayor_policy_id!r}"}
        mayor_resolution = self.policy_engine.apply_dynamic_action(self.game_state, mayor_policy)

        # ── Opposition action (LLM agent reasons and decides) ───────────────
        opp_policy = self.opposition_agent.decide_action(self.game_state, mayor_policy)
        opp_resolution = self.policy_engine.apply_dynamic_action(self.game_state, opp_policy)

        # ── Long-term effects (carry-over from previous turns) ──────────────
        long_term_resolution = self.policy_engine.apply_long_term_effects(self.game_state)

        # ── Media update from actions ───────────────────────────────────────
        self.media_engine.update_narrative(
            self.game_state.media_state,
            mayor_resolution.media_effects,
            opp_resolution.media_effects,
            {},
        )

        # ── Formula-based agent updates ─────────────────────────────────────
        avg_rad = self.game_state.average_agent_field("radicalization")
        rumor_chance = self.media_engine.rumor_spread_chance(self.game_state.media_state, avg_rad)
        rumor_pressure = rumor_chance
        if self.game_state.rng.random() > rumor_chance:
            rumor_pressure *= 0.35

        combined_group_effects: list[dict[str, Any]] = []
        combined_group_effects.extend(mayor_resolution.group_effects)
        combined_group_effects.extend(opp_resolution.group_effects)
        combined_group_effects.extend(long_term_resolution.group_effects)

        self.agent_engine.update_happiness(self.game_state, combined_group_effects, rumor_pressure)
        self.agent_engine.update_radicalization(self.game_state, rumor_pressure)

        campaign_delta = mayor_resolution.campaign_strength - opp_resolution.campaign_strength
        self.agent_engine.propagate_alignment(self.game_state, campaign_delta, rumor_pressure)
        agent_impact = self._run_agent_impact_pass(mayor_policy, opp_policy, rumor_pressure)

        # ── LLM-generated event ─────────────────────────────────────────────
        generated_event = self.event_generator.maybe_generate_event(self.game_state)
        if generated_event is not None:
            active = ActiveEvent(
                definition_id=f"llm_{turn}",
                name=generated_event.name,
                type=generated_event.type,
                escalation_level=1,
                remaining_turns=generated_event.duration,
                escalation_chance=0.15,
                max_escalation=2,
                city_effects=generated_event.city_effects,
                group_effects=generated_event.group_effects,
                media_effects=generated_event.media_effects,
            )
            self.game_state.active_events.append(active)
            self.game_state.event_history.append(
                f"Turn {turn}: Triggered {generated_event.name}"
            )

        # ── Rule-based engine handles escalation + ongoing active event effects ──
        event_result = self.event_engine.step(self.game_state)

        if event_result.group_effects:
            self.agent_engine.apply_group_effects(self.game_state.agents, event_result.group_effects)

        self.media_engine.update_narrative(
            self.game_state.media_state, {}, {}, event_result.media_effects
        )

        # ── LLM citizen group debates ───────────────────────────────────────
        all_triggered = list(event_result.triggered_events)
        if generated_event:
            all_triggered.append(generated_event.name)

        debate_results = self.citizen_debates.run_debates(
            self.game_state, mayor_policy, opp_policy, all_triggered
        )
        # Apply debate deltas additively on top of formula-based updates
        for dr in debate_results:
            for agent in self.game_state.agents:
                if agent.group_id == dr.group_id:
                    agent.alignment += dr.alignment_delta
                    agent.happiness += dr.happiness_delta
                    agent.radicalization += dr.radicalization_delta
                    agent.trust_in_government += dr.trust_delta
                    agent.clamp_state()

        # ── Popularity recalculation ────────────────────────────────────────
        media_modifiers = self.media_engine.popularity_modifiers(self.game_state.media_state)
        mayor_pop, opp_pop = self.agent_engine.recalculate_popularity(
            self.game_state, media_modifiers
        )

        post_stats = self.game_state.city_stats.as_dict()
        credibility_result = apply_credibility_turn(
            self.game_state,
            mayor_policy,
            pre_stats,
            post_stats,
        )

        credibility_shift = (self.game_state.credibility_score - 50.0) / 50.0
        mayor_pop += credibility_shift * 2.0 + float(self.game_state.last_credibility_delta) * 0.55
        opp_pop -= credibility_shift * 2.0 + float(self.game_state.last_credibility_delta) * 0.55

        mayor_pop = max(0.0, min(100.0, mayor_pop))
        opp_pop = max(0.0, min(100.0, opp_pop))
        self.game_state.mayor_popularity = mayor_pop
        self.game_state.opposition_popularity = opp_pop

        # ── Build result dict ───────────────────────────────────────────────
        stat_changes = {
            k: round(post_stats[k] - pre_stats[k], 3)
            for k in post_stats
            if abs(post_stats[k] - pre_stats[k]) >= 0.01
        }

        election_result = None
        if turn == self.game_state.election_turn:
            metrics = self.agent_engine.group_metrics(self.game_state.agents)
            result = self.election_engine.run_election(self.game_state, metrics, media_modifiers)
            election_result = result.as_dict()

        group_metrics = self.agent_engine.group_metrics(self.game_state.agents)

        return {
            "turn": turn,
            "mayor_action": mayor_policy.to_dict(),
            "opposition_action": opp_policy.to_dict(),
            "stat_changes": stat_changes,
            "agent_impact": agent_impact,
            "triggered_events": all_triggered,
            "escalated_events": event_result.escalated_events,
            "event_chances": {k: round(v, 4) for k, v in event_result.event_chances.items()},
            "rumor_pressure": round(rumor_pressure, 4),
            "debate_results": [dr.to_dict() for dr in debate_results],
            "generated_event": generated_event.to_dict() if generated_event else None,
            "credibility": credibility_result,
            "election_result": election_result,
            "game_over": turn >= self.game_state.total_turns,
            "state": self._build_state_snapshot(group_metrics),
        }

    def _build_state_snapshot(self, group_metrics: dict | None = None) -> dict:
        if group_metrics is None:
            group_metrics = self.agent_engine.group_metrics(self.game_state.agents)

        active_events = [
            {
                "id": ev.definition_id,
                "name": ev.name,
                "type": ev.type,
                "escalation_level": ev.escalation_level,
                "max_escalation": ev.max_escalation,
                "remaining_turns": ev.remaining_turns,
            }
            for ev in self.game_state.active_events
        ]

        identity_groups = {
            gid: {
                "name": grp.name,
                "population_percent": grp.population_percent,
                "religion": grp.religion,
                "caste": grp.caste,
                "language": grp.language,
                "grievance_score": grp.grievance_score,
            }
            for gid, grp in self.game_state.identity_groups.items()
        }

        return {
            "turn_number": self.game_state.turn_number,
            "total_turns": self.game_state.total_turns,
            "election_turn": self.game_state.election_turn,
            "mayor_popularity": round(self.game_state.mayor_popularity, 2),
            "opposition_popularity": round(self.game_state.opposition_popularity, 2),
            "governing_party": self.game_state.governing_party,
            "rng_seed": self.game_state.rng_seed,
            "city_stats": {k: round(v, 2) for k, v in self.game_state.city_stats.as_dict().items()},
            "media_state": asdict(self.game_state.media_state),
            "campaign_strength": {k: round(v, 4) for k, v in self.game_state.campaign_strength.items()},
            "active_events": active_events,
            "group_metrics": group_metrics,
            "identity_groups": identity_groups,
            "policy_history": list(self.game_state.policy_history),
            "event_history": list(self.game_state.event_history),
            "election_results": list(self.game_state.election_results),
            "credibility_score": round(self.game_state.credibility_score, 2),
            "last_credibility_delta": round(self.game_state.last_credibility_delta, 3),
            "open_promises": len([p for p in self.game_state.promise_ledger if not p.get("resolved")]),
            "simulation_profile": dict(self.game_state.simulation_profile),
            "last_agent_impact": dict(self.game_state.last_agent_impact),
            "cohort_metrics": dict(self.game_state.cohort_metrics),
            "long_term_effects": [
                {"source_id": e.source_id, "actor": e.actor, "remaining_turns": e.remaining_turns}
                for e in self.game_state.long_term_effects
            ],
        }

    def stream_step(self, mayor_policy_id: str):
        """Generator: yields progress dicts after each LLM step for SSE streaming."""
        mayor_policy = self._cached_mayor_options.get(mayor_policy_id)
        if mayor_policy is None:
            yield {"type": "error", "message": f"Unknown policy id: {mayor_policy_id!r}"}
            return

        turn = self.game_state.turn_number + 1
        if turn > self.game_state.total_turns:
            yield {"type": "error", "message": "Game is already over"}
            return

        self.game_state.turn_number = turn
        pre_stats = self.game_state.city_stats.as_dict()

        # ── Mayor action (instant — from cache) ─────────────────────────────
        mayor_resolution = self.policy_engine.apply_dynamic_action(self.game_state, mayor_policy)
        yield {"type": "mayor_action", "action": mayor_policy.to_dict()}

        # ── Opposition action (LLM) ──────────────────────────────────────────
        opp_policy = self.opposition_agent.decide_action(self.game_state, mayor_policy)
        opp_resolution = self.policy_engine.apply_dynamic_action(self.game_state, opp_policy)
        yield {"type": "opposition_action", "action": opp_policy.to_dict()}

        # ── Long-term effects + media + formula agent updates ────────────────
        long_term_resolution = self.policy_engine.apply_long_term_effects(self.game_state)
        self.media_engine.update_narrative(
            self.game_state.media_state,
            mayor_resolution.media_effects,
            opp_resolution.media_effects,
            {},
        )
        avg_rad = self.game_state.average_agent_field("radicalization")
        rumor_chance = self.media_engine.rumor_spread_chance(self.game_state.media_state, avg_rad)
        rumor_pressure = rumor_chance
        if self.game_state.rng.random() > rumor_chance:
            rumor_pressure *= 0.35

        combined_group_effects: list[dict[str, Any]] = (
            mayor_resolution.group_effects
            + opp_resolution.group_effects
            + long_term_resolution.group_effects
        )
        self.agent_engine.update_happiness(self.game_state, combined_group_effects, rumor_pressure)
        self.agent_engine.update_radicalization(self.game_state, rumor_pressure)
        campaign_delta = mayor_resolution.campaign_strength - opp_resolution.campaign_strength
        self.agent_engine.propagate_alignment(self.game_state, campaign_delta, rumor_pressure)
        agent_impact = self._run_agent_impact_pass(mayor_policy, opp_policy, rumor_pressure)
        yield {"type": "agent_impact_assessed", "summary": agent_impact}
        if agent_impact.get("top_cohorts"):
            yield {
                "type": "cohort_shift_aggregated",
                "cohorts": agent_impact.get("top_cohorts", []),
            }

        # ── LLM event generation ─────────────────────────────────────────────
        generated_event = self.event_generator.maybe_generate_event(self.game_state)
        all_triggered: list[str] = []
        if generated_event is not None:
            active = ActiveEvent(
                definition_id=f"llm_{turn}",
                name=generated_event.name,
                type=generated_event.type,
                escalation_level=1,
                remaining_turns=generated_event.duration,
                escalation_chance=0.15,
                max_escalation=2,
                city_effects=generated_event.city_effects,
                group_effects=generated_event.group_effects,
                media_effects=generated_event.media_effects,
            )
            self.game_state.active_events.append(active)
            self.game_state.event_history.append(f"Turn {turn}: Triggered {generated_event.name}")
            all_triggered.append(generated_event.name)
        yield {"type": "generated_event", "event": generated_event.to_dict() if generated_event else None}

        # ── Rule-based event escalation ──────────────────────────────────────
        event_result = self.event_engine.step(self.game_state)
        if event_result.group_effects:
            self.agent_engine.apply_group_effects(self.game_state.agents, event_result.group_effects)
        self.media_engine.update_narrative(self.game_state.media_state, {}, {}, event_result.media_effects)
        all_triggered.extend(event_result.triggered_events)

        # ── Citizen debates — one yield per group ────────────────────────────
        for dr in self.citizen_debates.stream_debates(
            self.game_state, mayor_policy, opp_policy, all_triggered
        ):
            for agent in self.game_state.agents:
                if agent.group_id == dr.group_id:
                    agent.alignment += dr.alignment_delta
                    agent.happiness += dr.happiness_delta
                    agent.radicalization += dr.radicalization_delta
                    agent.trust_in_government += dr.trust_delta
                    agent.clamp_state()
            yield {"type": "debate", "debate": dr.to_dict()}

        # ── Popularity recalculation + final state ───────────────────────────
        media_modifiers = self.media_engine.popularity_modifiers(self.game_state.media_state)
        mayor_pop, opp_pop = self.agent_engine.recalculate_popularity(self.game_state, media_modifiers)

        post_stats = self.game_state.city_stats.as_dict()
        credibility_result = apply_credibility_turn(
            self.game_state,
            mayor_policy,
            pre_stats,
            post_stats,
        )

        credibility_shift = (self.game_state.credibility_score - 50.0) / 50.0
        mayor_pop += credibility_shift * 2.0 + float(self.game_state.last_credibility_delta) * 0.55
        opp_pop -= credibility_shift * 2.0 + float(self.game_state.last_credibility_delta) * 0.55

        mayor_pop = max(0.0, min(100.0, mayor_pop))
        opp_pop = max(0.0, min(100.0, opp_pop))
        self.game_state.mayor_popularity = mayor_pop
        self.game_state.opposition_popularity = opp_pop

        stat_changes = {
            k: round(post_stats[k] - pre_stats[k], 3)
            for k in post_stats
            if abs(post_stats[k] - pre_stats[k]) >= 0.01
        }

        election_result = None
        if turn == self.game_state.election_turn:
            metrics = self.agent_engine.group_metrics(self.game_state.agents)
            result = self.election_engine.run_election(self.game_state, metrics, media_modifiers)
            election_result = result.as_dict()

        group_metrics = self.agent_engine.group_metrics(self.game_state.agents)

        yield {
            "type": "done",
            "turn": turn,
            "stat_changes": stat_changes,
            "agent_impact": agent_impact,
            "triggered_events": all_triggered,
            "escalated_events": event_result.escalated_events,
            "event_chances": {k: round(v, 4) for k, v in event_result.event_chances.items()},
            "rumor_pressure": round(rumor_pressure, 4),
            "credibility": credibility_result,
            "election_result": election_result,
            "game_over": turn >= self.game_state.total_turns,
            "state": self._build_state_snapshot(group_metrics),
        }

    def run(self) -> GameState:
        """CLI mode: run all turns automatically (formula-based, no LLMs)."""
        for turn in range(1, self.game_state.total_turns + 1):
            self.game_state.turn_number = turn
            pre_stats = self.game_state.city_stats.as_dict()
            prev_mayor_pop = self.game_state.mayor_popularity
            prev_opp_pop = self.game_state.opposition_popularity

            mayor_policy = self.policy_engine.choose_action("mayor", self.game_state.rng, self.game_state)
            mayor_resolution = self.policy_engine.apply_action(self.game_state, mayor_policy)

            opposition_policy = self.policy_engine.choose_action("opposition", self.game_state.rng, self.game_state)
            opposition_resolution = self.policy_engine.apply_action(self.game_state, opposition_policy)

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

            self.agent_engine.update_happiness(self.game_state, combined_group_effects, rumor_pressure)
            self.agent_engine.update_radicalization(self.game_state, rumor_pressure)

            campaign_delta = mayor_resolution.campaign_strength - opposition_resolution.campaign_strength
            self.agent_engine.propagate_alignment(self.game_state, campaign_delta, rumor_pressure)
            agent_impact = self._run_agent_impact_pass(
                mayor_policy, opposition_policy, rumor_pressure
            )

            event_result = self.event_engine.step(self.game_state)

            if event_result.group_effects:
                self.agent_engine.apply_group_effects(self.game_state.agents, event_result.group_effects)

            self.media_engine.update_narrative(self.game_state.media_state, {}, {}, event_result.media_effects)

            media_modifiers = self.media_engine.popularity_modifiers(self.game_state.media_state)
            mayor_popularity, opposition_popularity = self.agent_engine.recalculate_popularity(
                self.game_state, media_modifiers
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
                agent_impact=agent_impact,
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
        print(f"    Government In Power: {self.game_state.governing_party}")

    def _log_turn(self, turn, mayor_action, opposition_action, pre_stats, post_stats,
                  prev_mayor_pop, prev_opp_pop, rumor_pressure, agent_impact, event_result) -> None:
        popularity_leader = (
            "Mayor" if self.game_state.mayor_popularity > self.game_state.opposition_popularity
            else "Opposition" if self.game_state.opposition_popularity > self.game_state.mayor_popularity
            else "Tie"
        )
        print(f"Turn {turn:02d}")
        print(f"  In Power: {self.game_state.governing_party} | Popularity Leader: {popularity_leader}")
        print(f"  Mayor Action: {mayor_action}")
        print(f"  Opposition Action: {opposition_action}")
        stat_changes = [
            f"{key} {post_stats[key] - pre_stats[key]:+.2f}"
            for key in sorted(post_stats)
            if abs(post_stats[key] - pre_stats[key]) >= 0.35
        ]
        print("  Major Stat Changes: " + (", ".join(stat_changes) if stat_changes else "none"))
        print(f"  Rumor Pressure: {rumor_pressure:.3f}")
        print(
            "  Agent Impact: Δh {0:+.3f}, Δr {1:+.3f}, Δa {2:+.3f} | fronts: {3}".format(
                float(agent_impact.get("avg_happiness_delta", 0.0)),
                float(agent_impact.get("avg_radicalization_delta", 0.0)),
                float(agent_impact.get("avg_alignment_delta", 0.0)),
                ", ".join(agent_impact.get("dominant_fronts", [])) or "none",
            )
        )
        if event_result.triggered_events:
            print("  Triggered Events: " + ", ".join(event_result.triggered_events))
        else:
            print("  Triggered Events: none")
        mayor_delta = self.game_state.mayor_popularity - prev_mayor_pop
        opp_delta = self.game_state.opposition_popularity - prev_opp_pop
        print(
            "  Popularity Shift: Mayor {0:+.2f} -> {1:.2f}% | Opposition {2:+.2f} -> {3:.2f}%".format(
                mayor_delta, self.game_state.mayor_popularity,
                opp_delta, self.game_state.opposition_popularity,
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

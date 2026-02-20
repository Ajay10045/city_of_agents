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


def _clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


class MayorAdvisorPort(Protocol):
    def generate_options(
        self, game_state: GameState, guidance: str | None = None
    ) -> list[DynamicPolicy]: ...


class OppositionAgentPort(Protocol):
    def decide_action(self, game_state: GameState, mayor_action: DynamicPolicy) -> DynamicPolicy: ...

    def predict_attack_line(self, game_state: GameState, mayor_action: DynamicPolicy) -> dict[str, object]: ...


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

    def get_counter_frame_options(self, mayor_policy_id: str) -> list[dict[str, Any]]:
        mayor_policy = self._cached_mayor_options.get(mayor_policy_id)
        if mayor_policy is None:
            return []

        predictor = getattr(self.opposition_agent, "predict_attack_line", None)
        predicted = (
            predictor(self.game_state, mayor_policy)
            if callable(predictor)
            else {
                "front": "public_trust",
                "allegation": (
                    f"Opposition will frame '{mayor_policy.name}' as optics-first without delivery guarantees."
                ),
                "risk": max(0.15, min(1.0, float(mayor_policy.opposition_counter_risk or 0.5))),
                "target_groups": list(mayor_policy.target_groups[:3]) or ["Undecided neighborhoods"],
            }
        )
        primary_front = str(predicted.get("front", "public_trust"))
        allegation = str(predicted.get("allegation", "")).strip() or (
            f"Opposition will frame '{mayor_policy.name}' as symbolic and weak on execution."
        )
        threat_intensity = max(0.15, min(1.0, float(predicted.get("risk", mayor_policy.opposition_counter_risk or 0.5))))
        target_groups = [
            str(item)
            for item in list(predicted.get("target_groups", []))[:3]
            if str(item).strip()
        ] or ["Undecided neighborhoods"]
        secondary_front = "services" if primary_front != "services" else "public_trust"

        return [
            {
                "id": "delivery_receipts",
                "label": "Delivery Receipts",
                "message": (
                    f"Pre-empt '{allegation}' with measurable delivery receipts on {primary_front}: weekly scorecards, audit checkpoints, and ward-level milestones."
                ),
                "target_groups": target_groups,
                "campaign_boost": 0.04,
                "effects": {"public_trust": 1.2, "social_tension": -0.5},
                "risk": "Backfires if next-turn delivery misses posted milestones.",
                "reacts_to": allegation,
                "attack_front": primary_front,
                "attack_intensity": round(threat_intensity, 3),
            },
            {
                "id": "empathy_relief",
                "label": "Empathy + Relief",
                "message": (
                    f"Counter '{allegation}' by acknowledging pain openly and delivering immediate relief on {secondary_front} pressure points."
                ),
                "target_groups": target_groups,
                "campaign_boost": 0.03,
                "effects": {"public_trust": 0.8, "social_tension": -1.0, "law_and_order": 0.4},
                "risk": "Can be framed as rhetoric if relief is not visible quickly.",
                "reacts_to": allegation,
                "attack_front": primary_front,
                "attack_intensity": round(threat_intensity, 3),
            },
            {
                "id": "accountability_pivot",
                "label": "Accountability Pivot",
                "message": (
                    f"Neutralize '{allegation}' with enforcement-first transparency: contract exposure, penalties, and grievance redress timelines."
                ),
                "target_groups": target_groups,
                "campaign_boost": 0.02,
                "effects": {"corruption": -1.0, "public_trust": 0.6, "social_tension": 0.2},
                "risk": "Raises expectations and gives opposition a checklist to attack.",
                "reacts_to": allegation,
                "attack_front": primary_front,
                "attack_intensity": round(threat_intensity, 3),
            },
        ]

    def _resolve_counter_frame(
        self,
        mayor_policy_id: str,
        counter_frame_id: str | None,
    ) -> dict[str, Any]:
        options = self.get_counter_frame_options(mayor_policy_id)
        if not options:
            return {
                "id": "default",
                "label": "Default Counter Frame",
                "message": "Mayor reframes the turn around delivery and stability.",
                "target_groups": [],
                "campaign_boost": 0.0,
                "effects": {},
                "risk": "",
            }
        if counter_frame_id:
            for option in options:
                if option["id"] == counter_frame_id:
                    return option
        return options[0]

    def _apply_counter_frame_effects(self, counter_frame: dict[str, Any]) -> None:
        effects = counter_frame.get("effects", {})
        if isinstance(effects, dict):
            safe_effects = {
                str(key): float(value)
                for key, value in effects.items()
                if isinstance(value, (int, float))
            }
            if safe_effects:
                self.game_state.city_stats.apply_delta(safe_effects)

        boost = float(counter_frame.get("campaign_boost", 0.0))
        current = self.game_state.campaign_strength.get("mayor", 1.0)
        self.game_state.campaign_strength["mayor"] = _clamp(
            current * 0.94 + (1.0 + boost) * 0.06,
            0.6,
            1.6,
        )

    def _stabilize_popularity(
        self,
        mayor_pop: float,
        opposition_pop: float,
        pre_stats: dict[str, float],
        post_stats: dict[str, float],
    ) -> tuple[float, float]:
        previous_mayor = float(self.game_state.mayor_popularity)

        service_delta = (
            (post_stats.get("employment", 50.0) - pre_stats.get("employment", 50.0))
            + (post_stats.get("infrastructure", 50.0) - pre_stats.get("infrastructure", 50.0))
            + (post_stats.get("economy", 50.0) - pre_stats.get("economy", 50.0))
        ) / 3.0
        trust_delta = post_stats.get("public_trust", 50.0) - pre_stats.get("public_trust", 50.0)
        tension_relief = pre_stats.get("social_tension", 50.0) - post_stats.get("social_tension", 50.0)
        delivery_bonus = _clamp(service_delta * 0.22 + trust_delta * 0.35 + tension_relief * 0.24, -3.2, 3.2)

        mayor_target = mayor_pop + delivery_bonus
        opposition_target = opposition_pop - delivery_bonus
        mayor_target = mayor_target * 0.84 + 50.0 * 0.16
        opposition_target = opposition_target * 0.84 + 50.0 * 0.16

        total = mayor_target + opposition_target
        if total <= 0:
            mayor_target = 50.0
            opposition_target = 50.0
        else:
            mayor_target = (mayor_target / total) * 100.0
            opposition_target = (opposition_target / total) * 100.0

        gap = mayor_target - opposition_target
        max_gap = 24.0
        if abs(gap) > max_gap:
            overflow = (abs(gap) - max_gap) * 0.5
            if gap > 0:
                mayor_target -= overflow
                opposition_target += overflow
            else:
                mayor_target += overflow
                opposition_target -= overflow

        mayor_smooth = previous_mayor * 0.62 + mayor_target * 0.38
        mayor_smooth = _clamp(mayor_smooth, previous_mayor - 7.0, previous_mayor + 7.0)
        mayor_smooth = _clamp(mayor_smooth, 0.0, 100.0)
        opposition_smooth = 100.0 - mayor_smooth
        return mayor_smooth, opposition_smooth

    def step(self, mayor_policy_id: str, counter_frame_id: str | None = None) -> dict:
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
        counter_frame = self._resolve_counter_frame(mayor_policy_id, counter_frame_id)
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
        self._apply_counter_frame_effects(counter_frame)

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

        media_cards = self.media_engine.build_narrative_cards(
            mayor_action=mayor_policy,
            opposition_action=opp_policy,
            triggered_events=all_triggered,
            dominant_fronts=list(agent_impact.get("dominant_fronts", [])),
            media_state=self.game_state.media_state,
        )

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

        mayor_pop, opp_pop = self._stabilize_popularity(
            mayor_pop,
            opp_pop,
            pre_stats,
            post_stats,
        )
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
            "media_cards": media_cards,
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

    def stream_step(self, mayor_policy_id: str, counter_frame_id: str | None = None):
        """Generator: yields progress dicts after each LLM step for SSE streaming."""
        mayor_policy = self._cached_mayor_options.get(mayor_policy_id)
        if mayor_policy is None:
            yield {"type": "error", "message": f"Unknown policy id: {mayor_policy_id!r}"}
            return
        counter_frame = self._resolve_counter_frame(mayor_policy_id, counter_frame_id)

        turn = self.game_state.turn_number + 1
        if turn > self.game_state.total_turns:
            yield {"type": "error", "message": "Game is already over"}
            return

        self.game_state.turn_number = turn
        pre_stats = self.game_state.city_stats.as_dict()

        # ── Duel step 1: Mayor action submitted ─────────────────────────────
        mayor_resolution = self.policy_engine.apply_dynamic_action(self.game_state, mayor_policy)
        yield {
            "type": "mayor_action_submitted",
            "turn": turn,
            "action": mayor_policy.to_dict(),
            "message": mayor_policy.rationale,
            "target_groups": list(mayor_policy.target_groups),
            "front_weights": dict(mayor_policy.narrative_fronts_impacted),
            "estimated_shift": dict(mayor_policy.expected_stat_delta),
        }
        # legacy compatibility event
        yield {"type": "mayor_action", "turn": turn, "action": mayor_policy.to_dict()}

        # ── Duel step 2: Opposition primary frame ───────────────────────────
        opp_policy = self.opposition_agent.decide_action(self.game_state, mayor_policy)
        opp_resolution = self.policy_engine.apply_dynamic_action(self.game_state, opp_policy)
        yield {
            "type": "opposition_frame_primary",
            "turn": turn,
            "action": opp_policy.to_dict(),
            "message": opp_policy.rationale,
            "target_groups": list(opp_policy.target_groups),
            "front_weights": dict(opp_policy.narrative_fronts_impacted),
            "estimated_shift": dict(opp_policy.expected_stat_delta),
        }
        # legacy compatibility event
        yield {"type": "opposition_action", "turn": turn, "action": opp_policy.to_dict()}

        # ── Core simulation effects + agent impact ───────────────────────────
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

        dominant_fronts = list(agent_impact.get("dominant_fronts", []))

        # ── Duel step 3: Mayor counter frame ────────────────────────────────
        self._apply_counter_frame_effects(counter_frame)
        yield {
            "type": "counter_frame_selected",
            "turn": turn,
            "counter_frame": dict(counter_frame),
        }
        mayor_counter_msg = str(counter_frame.get("message", "")).strip() or mayor_policy.counter_narrative_risk or (
            f"Mayor reframes turn around {', '.join(dominant_fronts) if dominant_fronts else 'stability'}."
        )
        yield {
            "type": "mayor_counter_frame",
            "turn": turn,
            "message": mayor_counter_msg,
            "front_weights": dict(mayor_policy.narrative_fronts_impacted),
            "target_groups": list(counter_frame.get("target_groups", mayor_policy.target_groups)),
            "estimated_shift": {
                "campaign_strength": round(mayor_resolution.campaign_strength, 4),
                "rumor_pressure": round(rumor_pressure, 4),
            },
        }

        # ── Duel step 4: Opposition follow-up frame ─────────────────────────
        opposition_followup = opp_policy.counter_narrative_risk or (
            f"Opposition doubles down on {', '.join(dominant_fronts) if dominant_fronts else 'trust concerns'}."
        )
        yield {
            "type": "opposition_frame_followup",
            "turn": turn,
            "message": opposition_followup,
            "front_weights": dict(opp_policy.narrative_fronts_impacted),
            "target_groups": list(opp_policy.target_groups),
            "estimated_shift": {
                "campaign_strength": round(opp_resolution.campaign_strength, 4),
                "counter_risk": round(opp_policy.opposition_counter_risk, 4),
            },
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
        chatter_lines: list[str] = []
        debate_results = []
        for dr in self.citizen_debates.stream_debates(
            self.game_state, mayor_policy, opp_policy, all_triggered
        ):
            debate_results.append(dr)
            for agent in self.game_state.agents:
                if agent.group_id == dr.group_id:
                    agent.alignment += dr.alignment_delta
                    agent.happiness += dr.happiness_delta
                    agent.radicalization += dr.radicalization_delta
                    agent.trust_in_government += dr.trust_delta
                    agent.clamp_state()
            chatter_lines.append(f"{dr.group_name}: {dr.debate_summary}")
            yield {"type": "debate", "debate": dr.to_dict()}

        # ── Duel step 5: Street chatter synthesized ─────────────────────────
        yield {
            "type": "street_chatter_synthesized",
            "turn": turn,
            "summary": chatter_lines[:3],
            "dominant_fronts": dominant_fronts,
            "triggered_events": list(all_triggered),
        }

        # ── Duel step 6: Media publish ──────────────────────────────────────
        media_cards = self.media_engine.build_narrative_cards(
            mayor_action=mayor_policy,
            opposition_action=opp_policy,
            triggered_events=all_triggered,
            dominant_fronts=dominant_fronts,
            media_state=self.game_state.media_state,
        )
        yield {
            "type": "media_narrative_published",
            "turn": turn,
            "cards": media_cards,
        }

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

        mayor_pop, opp_pop = self._stabilize_popularity(
            mayor_pop,
            opp_pop,
            pre_stats,
            post_stats,
        )
        self.game_state.mayor_popularity = mayor_pop
        self.game_state.opposition_popularity = opp_pop

        stat_changes = {
            k: round(post_stats[k] - pre_stats[k], 3)
            for k in post_stats
            if abs(post_stats[k] - pre_stats[k]) >= 0.01
        }

        # ── Duel step 7: Simulation stats applied ───────────────────────────
        yield {
            "type": "simulation_stats_applied",
            "turn": turn,
            "stat_deltas": stat_changes,
            "triggered_events": list(all_triggered),
            "escalated_events": list(event_result.escalated_events),
            "event_chances": {k: round(v, 4) for k, v in event_result.event_chances.items()},
        }

        election_result = None
        if turn == self.game_state.election_turn:
            metrics = self.agent_engine.group_metrics(self.game_state.agents)
            result = self.election_engine.run_election(self.game_state, metrics, media_modifiers)
            election_result = result.as_dict()

        group_metrics = self.agent_engine.group_metrics(self.game_state.agents)

        # ── Duel step 8: Popularity recalculated ─────────────────────────────
        yield {
            "type": "popularity_recalculated",
            "turn": turn,
            "mayor_popularity": round(self.game_state.mayor_popularity, 3),
            "opposition_popularity": round(self.game_state.opposition_popularity, 3),
            "governing_party": self.game_state.governing_party,
            "credibility": credibility_result,
        }

        # ── Duel step 9: Turn closed ────────────────────────────────────────
        turn_closed_payload = {
            "type": "turn_closed",
            "turn": turn,
            "turn_summary": {
                "mayor_action": mayor_policy.name,
                "opposition_action": opp_policy.name,
                "dominant_fronts": dominant_fronts,
                "events_triggered": list(all_triggered),
            },
            "stat_deltas": stat_changes,
            "popularity_delta": {
                "mayor": round(self.game_state.mayor_popularity, 3),
                "opposition": round(self.game_state.opposition_popularity, 3),
            },
            "key_events": list(all_triggered),
            "state": self._build_state_snapshot(group_metrics),
            "media_cards": media_cards,
            "election_result": election_result,
            "game_over": turn >= self.game_state.total_turns,
        }
        yield turn_closed_payload

        # Backward-compatible done envelope for old clients
        yield {
            "type": "done",
            "turn": turn,
            "stat_changes": stat_changes,
            "agent_impact": agent_impact,
            "triggered_events": all_triggered,
            "escalated_events": event_result.escalated_events,
            "event_chances": {k: round(v, 4) for k, v in event_result.event_chances.items()},
            "rumor_pressure": round(rumor_pressure, 4),
            "debate_results": [dr.to_dict() for dr in debate_results],
            "generated_event": generated_event.to_dict() if generated_event else None,
            "media_cards": media_cards,
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
            mayor_popularity, opposition_popularity = self._stabilize_popularity(
                mayor_popularity,
                opposition_popularity,
                pre_stats,
                self.game_state.city_stats.as_dict(),
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

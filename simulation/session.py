"""GameSession — the authoritative in-memory game state manager.

Owns:
  - GameState (serialisable snapshot)
  - RNG instance (deterministic from prng_seed)
  - Minister consultation transcript buffer
  - Last policy options (LLM-generated, held until player picks one)

Exposes:
  - start_new()          — factory: generate profile → citizens → ministers
  - open_consultation()  — begin a minister chat
  - consult_minister()   — send a message, get minister response
  - close_consultation() — seal transcript, return summary token
  - get_policy_options() — call LLM to draft 3 policy options
  - execute_turn()       — run the full 12-phase turn loop
  - compute_final_score()
"""
from __future__ import annotations

import random
import time
from typing import Any

from engine.budget import (
    apply_corruption_consequences,
    apply_maintenance_decay,
    apply_minor_action_budget,
    compute_tax_revenue,
    debt_political_effects,
    process_auto_repayment,
    process_interest_payment,
)
from engine.citizen import generate_citizens, select_minister_candidates, select_opposition_leader
from engine.events import (
    check_stochastic_events,
    check_threshold_events,
    step_events,
    update_communal_tension,
)
from engine.implementation import run_implementation
from engine.media import apply_media_drift, check_scandal_break, init_media_outlets
from engine.models import (
    CityProfile,
    DeliveryTarget,
    GameState,
    GovernanceScorecard,
    Minister,
    MinisterState,
    MinorAction,
    Policy,
    TurnResult,
    WardReportEntry,
)
from engine.opposition import (
    compute_opposition_effectiveness,
    counter_effectiveness,
    opposition_alignment_push,
    pick_attack_strategy,
    update_opposition_credibility,
)
from engine.political import (
    compute_interim_approval,
    political_engagement,
    update_mayor_alignment,
)
from engine.scoring import check_loss_conditions, compute_scorecard
from engine.wellbeing import update_citizen_wellbeing
from llm.llm_client import LLMClient
from simulation.llm_calls import (
    generate_citizen_names,
    generate_delivery_narrative,
    generate_media_headlines,
    generate_policy_options,
    minister_response,
    sample_citizen_reactions,
)


class GameSession:
    """All mutable game state for one play-through."""

    def __init__(self, llm: LLMClient):
        self.llm = llm
        self.state: GameState | None = None
        # Minister consultation state
        self._active_minister_id: str | None = None
        self._consultation_history: list[dict[str, str]] = []
        self._sealed_transcripts: list[str] = []     # one per turn (joined before policy call)
        # Held policy options from last LLM call
        self._pending_policy_options: list[dict[str, Any]] = []
        # Cumulative game-level counters (for scorecard)
        self._total_scandals: int = 0
        self._total_defections: int = 0
        self._total_stolen: float = 0.0
        self._crises_triggered: int = 0
        self._escalations: int = 0
        self._resolutions: int = 0
        self._initial_gov_params: dict[str, float] = {}

    # ------------------------------------------------------------------
    # Factory: start a new game
    # ------------------------------------------------------------------

    @classmethod
    def start_new(
        cls,
        llm: LLMClient,
        profile: CityProfile,
        seed: int | None = None,
    ) -> "GameSession":
        """Create a fully initialised GameSession from a CityProfile."""
        session = cls(llm)
        rng_seed = seed if seed is not None else int(time.time())

        # Generate citizen names via LLM
        agent_count = profile.game_config.agent_count
        names = generate_citizen_names(llm, profile, agent_count)

        # Generate citizens
        rng = random.Random(rng_seed)
        citizens = generate_citizens(profile, names, rng)

        # Select ministers (player will later pick from candidates)
        candidate_pool = select_minister_candidates(
            citizens, profile.game_config.minister_count, rng
        )

        # Default: auto-assign top candidates as ministers (player can reshuffle later)
        portfolios = [
            "Infrastructure",
            "Health & Education",
            "Finance & Economy",
            "Home Affairs",
            "Housing & Community",
        ]
        if profile.game_config.minister_count > 5:
            portfolios += ["Environment", "Governance Reform"][:profile.game_config.minister_count - 5]

        minister_ids: set[str] = set()
        ministers: list[Minister] = []
        for i, candidate in enumerate(candidate_pool[: profile.game_config.minister_count]):
            portfolio = portfolios[i % len(portfolios)]
            ministers.append(Minister(
                citizen=candidate,
                portfolio=portfolio,
                state=MinisterState(),
            ))
            minister_ids.add(candidate.id)

        opposition_leader = select_opposition_leader(citizens, minister_ids, rng)
        media_outlets = init_media_outlets(profile.media_outlets)

        state = GameState(
            city_profile=profile,
            city_params=profile.city_parameters,
            citizens=citizens,
            ministers=ministers,
            opposition_leader=opposition_leader,
            media_outlets=media_outlets,
            treasury=profile.budget.starting_treasury,
            communal_tension=profile.communal_config.tension_baseline,
            prng_seed=rng_seed,
        )

        session.state = state
        session._initial_gov_params = {
            "admin_efficiency": profile.city_parameters.admin_efficiency,
            "anti_corruption": profile.city_parameters.anti_corruption,
            "media_freedom": profile.city_parameters.media_freedom,
        }
        return session

    # ------------------------------------------------------------------
    # Cabinet management
    # ------------------------------------------------------------------

    def get_minister_candidates(self) -> list[dict[str, Any]]:
        """Return serialisable candidate pool (3× minister_count)."""
        assert self.state
        rng = random.Random(self.state.prng_seed + 999)
        minister_count = self.state.city_profile.game_config.minister_count
        candidates = select_minister_candidates(self.state.citizens, minister_count, rng)
        return [self._citizen_summary(c) for c in candidates]

    def assign_cabinet(self, assignments: list[dict[str, str]]) -> None:
        """assignments: [{"citizen_id": str, "portfolio": str}]"""
        assert self.state
        citizen_map = {c.id: c for c in self.state.citizens}

        # Group portfolios by citizen so each citizen becomes one Minister
        citizen_portfolios: dict[str, list[str]] = {}
        for a in assignments:
            cid = a["citizen_id"]
            citizen_portfolios.setdefault(cid, []).append(a["portfolio"])

        ministers = []
        minister_ids: set[str] = set()
        for cid, portfolios in citizen_portfolios.items():
            citizen = citizen_map.get(cid)
            if citizen is None:
                continue
            ministers.append(Minister(
                citizen=citizen,
                portfolio=portfolios[0],
                extra_portfolios=portfolios[1:],
                state=MinisterState(),
            ))
            minister_ids.add(cid)
        self.state.ministers = ministers
        # Re-pick opposition leader from non-ministers
        rng = random.Random(self.state.prng_seed + 777)
        self.state.opposition_leader = select_opposition_leader(
            self.state.citizens, minister_ids, rng
        )

    # ------------------------------------------------------------------
    # Minister consultation
    # ------------------------------------------------------------------

    def open_consultation(self, minister_id: str) -> str:
        """Start a consultation with a specific minister.

        Returns the minister's opening statement.
        """
        assert self.state
        minister = self._get_minister(minister_id)
        if minister is None:
            raise ValueError(f"No minister with id {minister_id}")
        self._active_minister_id = minister_id
        self._consultation_history = []
        # Opening: LLM generates an unprompted opening comment
        opening_prompt = (
            "The Mayor has opened a consultation. Offer 1-2 sentences on the most pressing issue "
            "in your portfolio right now, unprompted."
        )
        response = minister_response(
            self.llm,
            minister,
            self.state.city_profile.city_name,
            self.state.city_params,
            [],
            opening_prompt,
        )
        self._consultation_history.append({"role": "user", "content": opening_prompt})
        self._consultation_history.append({"role": "assistant", "content": response})
        return response

    def consult_minister(self, message: str) -> str:
        """Send a message to the active minister, get response."""
        assert self.state
        if not self._active_minister_id:
            raise ValueError("No active consultation. Call open_consultation first.")
        minister = self._get_minister(self._active_minister_id)
        assert minister
        response = minister_response(
            self.llm,
            minister,
            self.state.city_profile.city_name,
            self.state.city_params,
            self._consultation_history,
            message,
        )
        self._consultation_history.append({"role": "user", "content": message})
        self._consultation_history.append({"role": "assistant", "content": response})
        return response

    def close_consultation(self) -> str:
        """Seal the consultation transcript for this turn. Returns the transcript text."""
        if not self._active_minister_id or not self._consultation_history:
            return ""
        minister = self._get_minister(self._active_minister_id)
        minister_name = minister.citizen.name if minister else "Unknown"
        turns = []
        history = self._consultation_history
        for i in range(0, len(history), 2):
            if i + 1 < len(history):
                user_msg = history[i]["content"]
                asst_msg = history[i + 1]["content"]
                turns.append(f"Mayor: {user_msg}\n{minister_name}: {asst_msg}")
        transcript = "\n\n".join(turns)
        self._sealed_transcripts.append(transcript)
        self._active_minister_id = None
        self._consultation_history = []
        return transcript

    # ------------------------------------------------------------------
    # Policy option generation
    # ------------------------------------------------------------------

    def get_policy_options(self) -> list[dict[str, Any]]:
        """Generate 3 policy options using the full consultation transcript."""
        assert self.state
        # Seal any open consultation
        self.close_consultation()
        full_transcript = "\n\n---\n\n".join(self._sealed_transcripts) if self._sealed_transcripts else ""
        budget = self.state.city_profile.budget.max_policy_budget
        options = generate_policy_options(self.llm, self.state, full_transcript, budget)
        self._pending_policy_options = options
        return options

    # ------------------------------------------------------------------
    # Main turn executor
    # ------------------------------------------------------------------

    def execute_turn(
        self,
        policy_index: int,
        minor_action: dict[str, Any],
        counter_frame_strategy: str = "Delivery Receipts",
    ) -> TurnResult:
        """Run the full turn loop for phase ① through ⑫.

        policy_index: 0-2, index into last get_policy_options() result
        minor_action: dict matching MinorAction schema
        counter_frame_strategy: which counter-frame the mayor uses
        """
        assert self.state
        state = self.state
        rng = random.Random(state.prng_seed + state.current_turn * 1000)

        # ① Resolve minor action
        m_action = MinorAction(**minor_action)
        treasury = state.treasury
        treasury = apply_minor_action_budget(
            treasury, m_action,
            bonus_banking=20.0,
        )
        params = state.city_params

        # Handle governance upkeep
        if m_action.type == "governance_upkeep":
            params = params.apply_delta({
                "admin_efficiency": 1.0,
                "anti_corruption": 1.0,
                "media_freedom": 1.0,
            })

        # Handle maintenance (prevent decay for target param)
        targeted_this_turn: set[str] = set()
        if m_action.type == "maintenance" and m_action.target:
            targeted_this_turn.add(m_action.target)

        # ② Parse chosen policy
        if not self._pending_policy_options:
            raise ValueError("No policy options available. Call get_policy_options first.")
        raw_policy = self._pending_policy_options[policy_index % len(self._pending_policy_options)]
        policy = Policy(**{k: v for k, v in raw_policy.items() if k in Policy.model_fields})

        # Tag targeted params
        for k in policy.target_effects:
            targeted_this_turn.add(k)

        # ③ Interest payment + tax revenue
        interest_paid = process_interest_payment(state.outstanding_debt, state.city_profile.budget.interest_rate)
        treasury -= interest_paid
        tax_rev = compute_tax_revenue(state.city_params, state.city_profile.budget.base_tax_revenue)
        treasury += tax_rev

        # ④ Policy implementation
        # Find minister for this portfolio
        minister = self._find_minister_for_portfolio(policy.portfolio)
        if minister is None:
            raise ValueError("No ministers in cabinet. Call assign_cabinet first.")
        crisis_active = bool(state.active_events)
        impl = run_implementation(
            policy, minister,
            state.city_params,
            state.city_profile.budget.max_policy_budget,
            rng,
            crisis_active,
        )

        # Deduct budget (full policy cost; stolen is leakage within that)
        treasury -= policy.budget_cost

        # Track corruption; exposure grows proportional to leakage rate
        self._total_stolen += impl.corruption.budget_stolen
        minister.state.scandal_exposure = min(
            100.0, minister.state.scandal_exposure + impl.corruption.leakage_rate * 20.0
        )

        # ⑤ Apply immediate deltas (turn_0 fraction)
        time_profile = policy.time_profile or {"turn_0": 1.0}
        t0_frac = time_profile.get("turn_0", 1.0)
        immediate_deltas = {k: v * t0_frac for k, v in impl.actual_deltas.items()}
        # Queue future deltas
        for key, frac in time_profile.items():
            if key == "turn_0":
                continue
            turn_offset = int(key.replace("turn_", ""))
            apply_turn = state.current_turn + turn_offset
            carry = state.pending_deltas.setdefault(apply_turn, {})
            for param, val in impl.actual_deltas.items():
                carry[param] = carry.get(param, 0.0) + val * frac

        # Apply immediate deltas + side effects + event deltas
        params = state.city_params.apply_delta(immediate_deltas)
        params = params.apply_delta(impl.side_effect_deltas)

        # Apply any carry-over deltas due this turn
        pending = state.pending_deltas.pop(state.current_turn, {})
        params = params.apply_delta(pending)

        # ⑥ Events: tick existing, check for new
        remaining_events, event_deltas = step_events(state.active_events, rng)
        params = params.apply_delta(event_deltas)

        # Track escalations/resolutions
        new_remaining = len(remaining_events)
        old_count = len(state.active_events)
        self._escalations += sum(1 for e in remaining_events if e.escalation_level > 0)
        self._resolutions += max(0, old_count - new_remaining)

        # New threshold events
        existing_names = {e.name for e in remaining_events}
        new_threshold = check_threshold_events(params, existing_names)
        new_stochastic = check_stochastic_events(params, len(remaining_events), rng)
        newly_triggered = new_threshold + new_stochastic
        self._crises_triggered += sum(1 for e in newly_triggered if e.type == "crisis")
        state.active_events = remaining_events + newly_triggered

        # ⑦ Maintenance decay
        params = apply_maintenance_decay(
            params,
            targeted_this_turn,
            state.targeted_last_turn,
            params.admin_efficiency,
        )

        # Corruption consequences
        params = apply_corruption_consequences(
            params,
            impl.corruption.budget_stolen,
            state.city_profile.budget.max_policy_budget,
        )

        # ⑧ Debt effects
        debt_fx = debt_political_effects(state.outstanding_debt, state.city_profile.budget.max_debt)
        if debt_fx["fiscal_crisis"]:
            params = params.apply_delta({"admin_efficiency": -debt_fx["admin_drain"]})

        # Auto-repayment
        treasury, outstanding_debt = process_auto_repayment(treasury, state.outstanding_debt)

        # ⑨ Wellbeing update for all citizens
        all_deltas = {}
        all_deltas.update(immediate_deltas)
        all_deltas.update(impl.side_effect_deltas)
        all_deltas.update(event_deltas)
        for citizen in state.citizens:
            citizen.wellbeing = update_citizen_wellbeing(citizen, all_deltas, state.city_profile)

        # ⑩ Scandal check (opposition_pressure estimated as inverse of execution score)
        scandal_broke = check_scandal_break(
            minister,
            state.media_outlets,
            1.0 - impl.execution_score,  # lower execution → more opposition pressure
            params.media_freedom,
            rng,
        )
        scandal_minister_name: str | None = None
        if scandal_broke:
            self._total_scandals += 1
            scandal_minister_name = minister.citizen.name

        # ⑪ Opposition attack + media
        interim_approval = compute_interim_approval(state.citizens, params.media_freedom)
        avg_wb = sum(c.wellbeing.score() for c in state.citizens) / max(len(state.citizens), 1)
        turns_to_election = max(0, state.city_profile.game_config.election_turn - state.current_turn)

        attack_strategy = pick_attack_strategy(
            leader=state.opposition_leader,
            params_before=state.city_params.as_dict(),
            params_after=params.as_dict(),
            execution_score=impl.execution_score,
            scandal_broke=scandal_broke,
            active_crisis=bool(state.active_events),
            outstanding_debt=outstanding_debt,
            max_debt=state.city_profile.budget.max_debt,
            turns_to_election=turns_to_election,
        )

        opp_effectiveness = compute_opposition_effectiveness(
            state.opposition_leader,
            attack_strategy,
            impl.execution_score,
            state.media_outlets,
            avg_wb,
            attack_credibility=0.5,
            credibility_score=state.opposition_credibility,
        )

        # Counter-frame effectiveness
        counter_eff = counter_effectiveness(
            strategy=counter_frame_strategy,
            execution_score=impl.execution_score,
            avg_wellbeing_of_target=avg_wb,
            anti_corruption=params.anti_corruption,
            media_freedom=params.media_freedom,
            opp_integrity=state.opposition_leader.personality.integrity,
            turns_since_last_populist=3,  # simplified for now
            outlets=state.media_outlets,
        )

        net_opp_impact = opp_effectiveness - counter_eff

        # Update opposition credibility
        state.opposition_credibility = update_opposition_credibility(
            state.opposition_credibility,
            attack_landed=net_opp_impact > 0,
            attack_fabricated=(attack_strategy == "Corruption Accusation" and not scandal_broke),
            media_freedom=params.media_freedom,
            attack_credibility=0.5,
            attack_relevant=True,
        )

        # Update mayor alignment for each citizen
        for citizen in state.citizens:
            eng = political_engagement(citizen, params.media_freedom)
            opp_push = opposition_alignment_push(net_opp_impact, eng)
            # update_mayor_alignment takes (citizen, new_wellbeing, outlets, media_freedom, opp_push)
            # and returns the new alignment value
            citizen.mayor_alignment = update_mayor_alignment(
                citizen,
                citizen.wellbeing,   # already updated by update_citizen_wellbeing above
                state.media_outlets,
                params.media_freedom,
                opp_push,
            )

        # ⑫ Communal tension update
        delta_community = all_deltas.get("community_and_spaces", 0.0)
        delta_police = all_deltas.get("police_and_emergency", 0.0)
        minority_sensitive = state.city_profile.communal_config.dominant_fault_line in ("ethnic", "religious")
        communal_crisis = any(
            "communal" in e.name.lower() or "tension" in e.name.lower()
            for e in state.active_events
        )
        communal_severity = max((e.severity for e in state.active_events), default=0)
        opp_identity_mobilized = (attack_strategy == "Identity Mobilization")
        new_tension = update_communal_tension(
            state.communal_tension,
            state.city_profile.communal_config.tension_baseline,
            festival_boost=0.0,  # simplified
            delta_community=delta_community,
            delta_police=delta_police,
            minority_police_sensitive=minority_sensitive,
            crisis_communal=communal_crisis,
            crisis_severity=communal_severity,
            opposition_identity_mobilized=opp_identity_mobilized,
            opposition_effectiveness=opp_effectiveness,
        )

        # Update interim approval after alignment changes
        interim_approval = compute_interim_approval(state.citizens, params.media_freedom)

        # Media drift
        delta_p13 = params.media_freedom - state.city_params.media_freedom
        state.media_outlets = apply_media_drift(
            state.media_outlets,
            interim_approval,
            delta_p13,
            rng,
        )

        # Minister loyalty changes
        minister_loyalty_changes: dict[str, float] = {}
        for m in state.ministers:
            loyalty_delta = 0.0
            if interim_approval > 60:
                loyalty_delta += 2.0
            elif interim_approval < 40:
                loyalty_delta -= 2.0
            if debt_fx["fiscal_crisis"]:
                loyalty_delta += debt_fx["loyalty_drain"]
            m.state.loyalty = max(0.0, min(100.0, m.state.loyalty + loyalty_delta))
            minister_loyalty_changes[m.citizen.id] = loyalty_delta

        # ⑬ LLM-generated narrative and flavour
        delivery_narrative = generate_delivery_narrative(
            self.llm, policy, impl.execution_score, impl.actual_deltas,
            state.city_profile.city_name, state.current_turn
        )

        media_headlines = generate_media_headlines(
            self.llm,
            state.media_outlets,
            policy,
            impl.execution_score,
            scandal_broke,
            scandal_minister_name,
            state.active_events,
        )

        # Sample 5 citizens for reactions
        sampled = rng.sample(state.citizens, min(5, len(state.citizens)))
        sampled_dicts = [self._citizen_for_reaction(c) for c in sampled]
        citizen_voices = sample_citizen_reactions(
            self.llm, policy, impl.execution_score, sampled_dicts,
            state.city_profile.city_name
        )

        # Ward report (aggregate wellbeing changes by group)
        ward_report = self._compute_ward_report(state.citizens, all_deltas)

        # Commit state
        turn_result = TurnResult(
            turn=state.current_turn,
            major_policy=policy,
            minor_action=m_action,
            execution_score=impl.execution_score,
            actual_deltas=impl.actual_deltas,
            side_effect_deltas=impl.side_effect_deltas,
            budget_stolen=impl.corruption.budget_stolen,
            delivery_targets=[DeliveryTarget(**d) for d in impl.delivery_details],
            delivery_narrative=delivery_narrative,
            city_params_before=state.city_params.as_dict(),
            city_params_after=params.as_dict(),
            media_headlines=media_headlines,
            citizen_voices=citizen_voices,
            opposition_attack=attack_strategy,
            counter_frame=counter_frame_strategy,
            interim_approval=interim_approval,
            ward_report=ward_report,
            events_triggered=newly_triggered,
            communal_tension_after=new_tension,
            minister_loyalty_changes=minister_loyalty_changes,
            treasury_after=treasury,
            outstanding_debt_after=outstanding_debt,
            interest_paid=interest_paid,
            tax_revenue=tax_rev,
        )

        # Persist to game state
        state.city_params = params
        state.treasury = treasury
        state.outstanding_debt = outstanding_debt
        state.communal_tension = new_tension
        state.targeted_last_turn = state.targeted_this_turn
        state.targeted_this_turn = targeted_this_turn
        state.turn_history.append(turn_result)
        state.current_turn += 1

        # Clear turn's consultation transcripts
        self._sealed_transcripts = []
        self._pending_policy_options = []

        # Phase transition
        if state.current_turn > state.city_profile.game_config.election_turn and state.phase == "pre_election":
            state.phase = "legacy"

        return turn_result

    # ------------------------------------------------------------------
    # End-of-game
    # ------------------------------------------------------------------

    def compute_final_score(self) -> GovernanceScorecard:
        assert self.state
        return compute_scorecard(
            self.state,
            self._initial_gov_params,
            self._total_scandals,
            self._total_defections,
            self._total_stolen,
            self._crises_triggered,
            self._escalations,
            self._resolutions,
        )

    def check_loss(self) -> str | None:
        assert self.state
        return check_loss_conditions(self.state)

    # ------------------------------------------------------------------
    # Serialisation helpers
    # ------------------------------------------------------------------

    def get_state_snapshot(self) -> dict[str, Any]:
        """Return a serialisable snapshot of current game state."""
        assert self.state
        state = self.state
        return {
            "game_id": state.game_id,
            "city_name": state.city_profile.city_name,
            "current_turn": state.current_turn,
            "total_turns": state.city_profile.game_config.total_turns,
            "election_turn": state.city_profile.game_config.election_turn,
            "phase": state.phase,
            "treasury": state.treasury,
            "outstanding_debt": state.outstanding_debt,
            "communal_tension": state.communal_tension,
            "opposition_credibility": state.opposition_credibility,
            "city_params": state.city_params.as_dict(),
            "ministers": [self._minister_summary(m) for m in state.ministers],
            "active_events": [e.model_dump() for e in state.active_events],
            "media_outlets": [o.model_dump() for o in state.media_outlets],
            "interim_approval": compute_interim_approval(state.citizens, state.city_params.media_freedom),
            "avg_wellbeing": sum(c.wellbeing.score() for c in state.citizens) / max(len(state.citizens), 1),
            "turn_history_count": len(state.turn_history),
            "last_turn": state.turn_history[-1].model_dump() if state.turn_history else None,
        }

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _get_minister(self, minister_id: str) -> Minister | None:
        assert self.state
        for m in self.state.ministers:
            if m.citizen.id == minister_id:
                return m
        return None

    def _find_minister_for_portfolio(self, portfolio: str) -> Minister | None:
        assert self.state
        for m in self.state.ministers:
            if m.portfolio == portfolio or portfolio in m.extra_portfolios:
                return m
        # Fallback: any minister
        return self.state.ministers[0] if self.state.ministers else None

    def _citizen_summary(self, citizen) -> dict[str, Any]:
        return {
            "id": citizen.id,
            "name": citizen.name,
            "demographics": {
                "age_group": citizen.demographics.age_group,
                "income_bracket": citizen.demographics.income_bracket,
                "profession": citizen.demographics.profession,
                "location": citizen.demographics.location,
                "ideology_economic": citizen.demographics.ideology_economic,
                "ideology_social": citizen.demographics.ideology_social,
            },
            "personality": citizen.personality.model_dump(),
            "capability": citizen.capability.model_dump(),
            "wellbeing": citizen.wellbeing.score(),
            "mayor_alignment": citizen.mayor_alignment,
        }

    def _minister_summary(self, minister: Minister) -> dict[str, Any]:
        s = self._citizen_summary(minister.citizen)
        s.update({
            "portfolio": minister.portfolio,
            "extra_portfolios": minister.extra_portfolios,
            "loyalty": minister.state.loyalty,
            "scandal_exposure": minister.state.scandal_exposure,
            "political_capital": minister.state.political_capital,
        })
        return s

    def _citizen_for_reaction(self, citizen) -> dict[str, Any]:
        d = citizen.demographics
        return {
            "id": citizen.id,
            "name": citizen.name,
            "demographics": f"{d.age_group}, {d.religion}, {d.profession}, {d.location}",
            "ideology": f"{d.ideology_economic} / {d.ideology_social}",
            "wellbeing": citizen.wellbeing.score(),
        }

    def _compute_ward_report(self, citizens, param_deltas: dict[str, float]) -> list[WardReportEntry]:
        """Aggregate wellbeing direction by demographic group."""
        from collections import defaultdict

        groups: dict[tuple[str, str], list[float]] = defaultdict(list)
        for c in citizens:
            d = c.demographics
            wb = c.wellbeing.score()
            groups[("income", d.income_bracket)].append(wb)
            groups[("location", d.location)].append(wb)
            groups[("profession", d.profession)].append(wb)

        # Compute average deltas approximated from param_deltas (simplified)
        total_delta = sum(abs(v) for v in param_deltas.values())
        report = []
        for (group_type, group_name), wellbeings in groups.items():
            avg_wb = sum(wellbeings) / len(wellbeings)
            # Approximate: groups with low wellbeing get more effect from positive deltas
            delta_sign = 1.0 if sum(param_deltas.values()) > 0 else -1.0
            avg_delta = delta_sign * min(2.0, total_delta * 0.1)
            trend: str
            if avg_delta > 0.5:
                trend = "up"
            elif avg_delta < -0.5:
                trend = "down"
            else:
                trend = "flat"
            report.append(WardReportEntry(
                group_type=group_type,
                group_name=group_name,
                trend=trend,  # type: ignore[arg-type]
                avg_wellbeing_delta=avg_delta,
                hotspot=avg_wb < 30.0,
                bright_spot=avg_wb > 70.0,
            ))
        return report[:12]  # cap to avoid huge payloads

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
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

# ─── Debug Logger ─────────────────────────────────────────────────────────────
_RESET = "\033[0m"
_COLOURS = {
    "phase": "\033[1;36m",   # bold cyan  — phase headers
    "calc":  "\033[0;33m",   # yellow     — calculation values
    "good":  "\033[0;32m",   # green      — positive outcomes
    "bad":   "\033[0;31m",   # red        — warnings / losses
    "info":  "\033[0;37m",   # grey       — neutral info
    "llm":   "\033[0;35m",   # magenta    — LLM call markers
}

def _log(tag: str, msg: str) -> None:
    colour = _COLOURS.get(tag, "")
    print(f"{colour}[{tag.upper():5s}] {msg}{_RESET}", flush=True)

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
    amend_policy_option,
    evaluate_policy_implementation,
    generate_advisor_summary,
    generate_citizen_names,
    generate_delivery_narrative,
    generate_media_headlines,
    generate_mayor_briefing_summary,
    generate_minister_briefing_lines,
    generate_policy_options,
    minister_response,
    poll_citizen_approval,
    sample_citizen_reactions,
    generate_situational_headlines,
    generate_situational_chatter,
    generate_policy_options_stream,
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
        self._mayor_elected_on_summary: str | None = None

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

    def open_consultation(self, minister_id: str, silent: bool = False) -> str:
        """Start a consultation with a specific minister.

        If silent=True, skip the LLM opening statement (used for broadcast @all
        where each minister replies directly to the mayor's question without a
        separate greeting LLM call). Returns empty string in silent mode.
        """
        assert self.state
        minister = self._get_minister(minister_id)
        if minister is None:
            raise ValueError(f"No minister with id {minister_id}")
        self._active_minister_id = minister_id
        self._consultation_history = []
        if silent:
            return ""
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

    def amend_single_policy(self, index: int, transcript: str) -> dict[str, Any]:
        """Regenerate one pending policy option informed by a discussion transcript."""
        assert self.state
        if not self._pending_policy_options:
            raise ValueError("No pending policy options. Call get_policy_options first.")
        if index < 0 or index >= len(self._pending_policy_options):
            raise ValueError(f"Invalid policy index {index}.")
        existing = self._pending_policy_options[index]
        budget = self.state.city_profile.budget.max_policy_budget
        amended = amend_policy_option(self.llm, self.state, existing, transcript, budget)
        self._pending_policy_options[index] = amended
        return amended

    # ------------------------------------------------------------------
    # Turn briefing (situational media + city chatter)
    # ------------------------------------------------------------------

    def generate_turn_briefing_stream(self):
        """Yield SSE events as briefing components are generated."""
        assert self.state
        state = self.state
        rng = random.Random(state.prng_seed + state.current_turn * 500)

        # ① City snapshot
        params = state.city_params.as_dict()
        sorted_params = sorted(params.items(), key=lambda x: x[1])
        yield {
            "type": "city_snapshot",
            "city_name": state.city_profile.city_name,
            "turn": state.current_turn,
            "treasury": state.treasury,
            "params": params,
            "worst_3": [{"key": k, "value": round(v, 1)} for k, v in sorted_params[:3]],
            "best_3": [{"key": k, "value": round(v, 1)} for k, v in sorted_params[-3:]],
            "active_events": [e.model_dump() for e in state.active_events],
        }

        _log("llm", "→ generate_mayor_briefing_summary() ...")
        mayor_summary = generate_mayor_briefing_summary(
            self.llm,
            state,
            self._mayor_elected_on_summary,
        )
        if mayor_summary:
            if not self._mayor_elected_on_summary:
                self._mayor_elected_on_summary = mayor_summary["elected_on"]
                _log("info", "Mayor mandate summary cached from fresh output.")
            else:
                mayor_summary["elected_on"] = self._mayor_elected_on_summary
                _log("info", "Mayor mandate summary reused from cache.")
            yield {
                "type": "mayor_summary",
                "elected_on": mayor_summary["elected_on"],
                "people_like": mayor_summary["people_like"],
                "people_dislike": mayor_summary["people_dislike"],
                "media_like": mayor_summary["media_like"],
                "media_dislike": mayor_summary["media_dislike"],
            }
            _log("llm", "✓ mayor_briefing_summary emitted")
        else:
            _log("bad", "Mayor briefing summary unavailable this turn; continuing stream.")

        # ② Media headlines
        yield {"type": "status", "message": "Scanning media outlets..."}
        headlines = generate_situational_headlines(
            self.llm, state.media_outlets, state.city_profile.city_name,
            params, state.treasury,
            state.active_events, state.current_turn,
        )
        yield {
            "type": "headlines",
            "headlines": [h.model_dump() for h in headlines],
        }

        # ③ City chatter
        yield {"type": "status", "message": "Listening to city chatter..."}
        minister_ids = {m.citizen.id for m in state.ministers}
        eligible = [c for c in state.citizens if c.id not in minister_ids]
        sampled = rng.sample(eligible, min(5, len(eligible)))
        sampled_dicts = [self._citizen_for_reaction(c) for c in sampled]
        voices = generate_situational_chatter(
            self.llm, sampled_dicts, state.city_profile.city_name,
            params, state.city_profile.languages,
        )
        yield {
            "type": "voices",
            "voices": [v.model_dump() for v in voices],
        }

        # ③b Minister briefing lines (cinematic scene)
        briefing_lines = generate_minister_briefing_lines(
            self.llm,
            ministers=[{"name": m.citizen.name, "portfolio": m.portfolio} for m in state.ministers[:3]],
            city_name=state.city_profile.city_name,
            worst_3=[{"key": k, "value": round(v, 1)} for k, v in sorted_params[:3]],
            best_3=[{"key": k, "value": round(v, 1)} for k, v in sorted_params[-3:]],
            mayor_summary=mayor_summary,
            headlines=[h.model_dump() for h in headlines],
            voices=[v.model_dump() for v in voices],
            active_events=[e.model_dump() for e in state.active_events],
        )
        if briefing_lines:
            yield {"type": "minister_briefing", "lines": briefing_lines}

        # ④ Policy options (streaming with thinking)
        yield {"type": "status", "message": "Drafting policy options..."}
        full_transcript = "\n\n---\n\n".join(self._sealed_transcripts) if self._sealed_transcripts else ""
        budget = state.city_profile.budget.max_policy_budget
        for event in generate_policy_options_stream(self.llm, state, full_transcript, budget):
            if event["type"] == "thinking":
                yield {"type": "thinking", "chunk": event["chunk"]}
            elif event["type"] == "policy_start":
                yield {"type": "policy_progress", "current": event["index"]}
            elif event["type"] == "policies":
                self._pending_policy_options = event["options"]
                yield {
                    "type": "policies",
                    "options": event["options"],
                    "turn": state.current_turn,
                }

        # ⑤ Done
        yield {"type": "complete"}

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

        # ─── Turn header ───────────────────────────────────────────────────────
        city = state.city_profile.city_name
        _log("phase", "═" * 54)
        _log("phase", f"TURN {state.current_turn}  |  City of {city}  |  Seed: {state.prng_seed + state.current_turn * 1000}")
        _log("phase", "═" * 54)
        approval_now = compute_overall_approval(state.citizens)
        _log("info",  f"Treasury: ₹{state.treasury:.0f} Cr  |  Debt: ₹{state.outstanding_debt:.0f} Cr  |  Approx approval: {approval_now:.1f}%")

        # ① Resolve minor action
        m_action = MinorAction(**minor_action)
        treasury = state.treasury
        _log("phase", f"① MINOR ACTION — {m_action.type}")
        treasury_before_minor = treasury
        treasury = apply_minor_action_budget(
            treasury, m_action,
            bonus_banking=20.0,
        )
        _log("calc",  f"Treasury after minor action: ₹{treasury:.0f} Cr  (Δ {treasury - treasury_before_minor:+.0f})")
        params = state.city_params
        targeted_this_turn: set[str] = set()

        # Handle governance upkeep
        _GOVERNANCE_PARAMS = {"admin_efficiency", "anti_corruption", "media_freedom"}
        if m_action.type == "governance_upkeep":
            gov_target = m_action.target if m_action.target in _GOVERNANCE_PARAMS else "admin_efficiency"
            params = params.apply_delta({gov_target: 1.0})
            targeted_this_turn.add(gov_target)
            _log("good", f"Governance upkeep: {gov_target} +1.0")
        elif m_action.type == "maintenance" and m_action.target:
            targeted_this_turn.add(m_action.target)
            _log("info", f"Maintenance: protecting {m_action.target} from decay")
        elif m_action.type == "banking":
            _log("info", "Banking: +₹20 Cr bonus invested")

        # ② Parse chosen policy
        if not self._pending_policy_options:
            raise ValueError("No policy options available. Call get_policy_options first.")
        raw_policy = self._pending_policy_options[policy_index % len(self._pending_policy_options)]
        policy = Policy(**{k: v for k, v in raw_policy.items() if k in Policy.model_fields})

        # Tag targeted params
        for k in policy.target_effects:
            targeted_this_turn.add(k)

        _log("phase", f"② POLICY SELECTED — \"{policy.name}\" ({policy.portfolio})")
        _log("calc",  f"Budget cost: ₹{policy.budget_cost:.0f} Cr  |  Time profile: {policy.time_profile or {'turn_0': 1.0}}")
        _log("info",  f"Targeted params: {', '.join(targeted_this_turn)}")
        if policy.target_effects:
            for p, v in policy.target_effects.items():
                _log("info",  f"  target_effect: {p} {v:+.1f}")
        if policy.side_effects:
            for p, v in policy.side_effects.items():
                _log("info",  f"  side_effect:   {p} {v:+.1f}")

        # ③ Interest payment + tax revenue
        _log("phase", "③ BUDGET & REVENUE")
        interest_paid = process_interest_payment(state.outstanding_debt, state.city_profile.budget.interest_rate)
        _log("calc",  f"Interest paid: ₹{interest_paid:.1f} Cr  (debt=₹{state.outstanding_debt:.0f}, rate={state.city_profile.budget.interest_rate:.2%})")
        treasury -= interest_paid
        tax_rev = compute_tax_revenue(state.city_params, state.city_profile.budget.base_tax_revenue)
        _log("calc",  f"Tax revenue: ₹{tax_rev:.1f} Cr")
        treasury += tax_rev
        _log("calc",  f"Policy cost: -₹{policy.budget_cost:.0f} Cr")
        _log("calc",  f"Treasury after budget phase: ₹{treasury - policy.budget_cost:.0f} Cr  (before policy deduction)")

        # ④ Policy implementation
        # Find minister for this portfolio
        minister = self._find_minister_for_portfolio(policy.portfolio)
        if minister is None:
            raise ValueError("No ministers in cabinet. Call assign_cabinet first.")
        _log("phase", "④ IMPLEMENTATION ENGINE")
        _log("info",  f"Assigned minister: {minister.citizen.name}  "
                      f"(competence={minister.citizen.capability.competence:.0f}, "
                      f"managerial={minister.citizen.capability.managerial_skill:.0f}, "
                      f"portfolios={1 + len(minister.extra_portfolios)})")
        crisis_active = bool(state.active_events)
        impl = run_implementation(
            policy, minister,
            state.city_params,
            state.city_profile.budget.max_policy_budget,
            rng,
            crisis_active,
        )
        # Log implementation results (engine/implementation.py logs the sub-scores)
        _log("calc",  f"Final execution score: {impl.execution_score:.3f}")
        for param, actual in impl.actual_deltas.items():
            intended = policy.target_effects.get(param, actual)
            tag = "good" if actual >= 0 else "bad"
            _log(tag,   f"  {param}: intended {intended:+.1f}  →  actual {actual:+.2f}  (×{impl.execution_score:.3f})")
        for param, delta in impl.side_effect_deltas.items():
            tag = "good" if delta >= 0 else "bad"
            _log(tag,   f"  side-effect {param}: {delta:+.2f}")
        stolen = impl.corruption.budget_stolen
        _log("bad" if stolen > 0 else "info",
             f"Corruption: intent={impl.corruption.intent:.3f}, window={impl.corruption.window:.3f}  "
             f"→  ₹{stolen:.1f} Cr stolen")

        # Deduct budget (full policy cost; stolen is leakage within that)
        treasury -= policy.budget_cost
        _log("calc",  f"Treasury after policy deduction: ₹{treasury:.0f} Cr")

        # Track corruption; exposure grows proportional to leakage rate
        self._total_stolen += impl.corruption.budget_stolen
        minister.state.scandal_exposure = min(
            100.0, minister.state.scandal_exposure + impl.corruption.leakage_rate * 20.0
        )

        # ⑤ Apply immediate deltas (turn_0 fraction) — both target and side effects share time_profile
        _log("phase", "⑤ APPLY DELTAS")
        time_profile = policy.time_profile or {"turn_0": 1.0}
        t0_frac = time_profile.get("turn_0", 1.0)

        # Merge target + side effects into one combined delta map for time-splitting
        all_policy_deltas: dict[str, float] = {}
        for param, val in impl.actual_deltas.items():
            all_policy_deltas[param] = all_policy_deltas.get(param, 0.0) + val
        for param, val in impl.side_effect_deltas.items():
            all_policy_deltas[param] = all_policy_deltas.get(param, 0.0) + val

        immediate_deltas = {k: v * t0_frac for k, v in all_policy_deltas.items()}
        imm_summary = ", ".join(f"{k} {v:+.2f}" for k, v in immediate_deltas.items())
        _log("info",  f"Immediate (turn_0={t0_frac:.1f}): {imm_summary}")

        # Queue future fractions for both target + side effects
        queued_summary = []
        for key, frac in time_profile.items():
            if key == "turn_0":
                continue
            turn_offset = int(key.replace("turn_", ""))
            apply_turn = state.current_turn + turn_offset
            carry = state.pending_deltas.setdefault(apply_turn, {})
            for param, val in all_policy_deltas.items():
                carry[param] = carry.get(param, 0.0) + val * frac
                queued_summary.append(f"{param} {val * frac:+.2f} (turn {apply_turn})")
                targeted_this_turn.add(param)  # prevent decay on params with queued delivery
        if queued_summary:
            _log("info",  f"Queued future deltas: {', '.join(queued_summary)}")

        # Apply immediate combined deltas (target + side effects)
        params = state.city_params.apply_delta(immediate_deltas)

        # Apply any carry-over deltas due this turn
        pending = state.pending_deltas.pop(state.current_turn, {})
        if pending:
            carry_summary = ", ".join(f"{k} {v:+.2f}" for k, v in pending.items())
            _log("info",  f"Carry-over from previous turns: {carry_summary}")
        else:
            _log("info",  "Carry-over from previous turns: (none)")
        params = params.apply_delta(pending)

        # ⑥ Events: tick existing, check for new
        _log("phase", f"⑥ EVENT SYSTEM  ({len(state.active_events)} active)")
        remaining_events, event_deltas = step_events(state.active_events, rng)
        if event_deltas:
            ev_d_str = ", ".join(f"{k} {v:+.2f}" for k, v in event_deltas.items())
            _log("bad",   f"Event deltas applied: {ev_d_str}")
        params = params.apply_delta(event_deltas)

        # Track escalations/resolutions
        new_remaining = len(remaining_events)
        old_count = len(state.active_events)
        resolutions = max(0, old_count - new_remaining)
        self._escalations += sum(1 for e in remaining_events if e.escalation_level > 0)
        self._resolutions += resolutions
        if resolutions:
            _log("good",  f"{resolutions} event(s) resolved this turn")

        # New threshold events
        existing_names = {e.name for e in remaining_events}
        new_threshold = check_threshold_events(params, existing_names)
        new_stochastic = check_stochastic_events(params, len(remaining_events), rng)
        newly_triggered = new_threshold + new_stochastic
        self._crises_triggered += sum(1 for e in newly_triggered if e.type == "crisis")
        for ev in newly_triggered:
            tag = "bad" if ev.type == "crisis" else "good"
            kind = "THRESHOLD" if ev in new_threshold else "STOCHASTIC"
            _log(tag,    f"TRIGGERED [{kind}]: \"{ev.name}\" ({ev.type}, sev={ev.severity}, {ev.turns_remaining} turns)")
        if not newly_triggered:
            _log("info",  "No new events triggered")
        state.active_events = remaining_events + newly_triggered
        _log("info",  f"Active events after: {len(state.active_events)}  (crises: {sum(1 for e in state.active_events if e.type == 'crisis')})")

        # ⑦ Maintenance decay
        _log("phase", "⑦ MAINTENANCE DECAY & CORRUPTION CONSEQUENCES")
        protected = targeted_this_turn | state.targeted_last_turn
        all_param_keys = set(params.as_dict().keys())
        decaying = all_param_keys - protected
        decay_rate = 1.5 * (1 - params.admin_efficiency / 200.0)
        _log("info",  f"Protected from decay ({len(protected)}): {', '.join(sorted(protected))}")
        if decaying:
            _log("bad",   f"Decaying ({len(decaying)}): {', '.join(sorted(decaying))}  (rate: -{decay_rate:.2f}/param)")
        params = apply_maintenance_decay(
            params,
            targeted_this_turn,
            state.targeted_last_turn,
            params.admin_efficiency,
        )

        # Corruption consequences
        stolen = impl.corruption.budget_stolen
        if stolen > 0:
            max_b = state.city_profile.budget.max_policy_budget
            ratio = stolen / max(max_b, 1.0)
            _log("bad",   f"Corruption consequences: anti_corruption -{ratio * 3.0:.2f}, admin_efficiency -{ratio * 1.5:.2f}  (₹{stolen:.1f} Cr stolen)")
        params = apply_corruption_consequences(
            params,
            impl.corruption.budget_stolen,
            state.city_profile.budget.max_policy_budget,
        )

        # ⑧ Debt effects
        _log("phase", "⑧ DEBT EFFECTS")
        debt_fx = debt_political_effects(state.outstanding_debt, state.city_profile.budget.max_debt)
        debt_ratio = state.outstanding_debt / max(state.city_profile.budget.max_debt, 1.0)
        _log("calc",  f"Debt ratio: {debt_ratio:.3f}  (₹{state.outstanding_debt:.0f} / ₹{state.city_profile.budget.max_debt:.0f} max)")
        if debt_fx["fiscal_crisis"]:
            _log("bad",   f"FISCAL CRISIS — admin_efficiency drain: {debt_fx['admin_drain']:.1f}")
            params = params.apply_delta({"admin_efficiency": -debt_fx["admin_drain"]})
        elif debt_fx["fiscal_warning"]:
            _log("bad",   "Fiscal WARNING — debt > 50% of max")
        else:
            _log("info",  "No fiscal stress")

        # Auto-repayment
        treasury, outstanding_debt = process_auto_repayment(treasury, state.outstanding_debt)
        repaid = state.outstanding_debt - outstanding_debt
        if repaid > 0:
            _log("good",  f"Auto-repayment: -₹{repaid:.0f} Cr debt  →  outstanding: ₹{outstanding_debt:.0f} Cr")
        else:
            _log("info",  f"No auto-repayment (treasury ≤ 200 or no debt)  |  outstanding: ₹{outstanding_debt:.0f} Cr")

        # ⑨ Wellbeing update for all citizens
        _log("phase", f"⑨ CITIZEN WELLBEING  ({len(state.citizens)} citizens)")
        all_deltas = dict(immediate_deltas)
        all_deltas.update(event_deltas)
        delta_summary = ", ".join(f"{k} {v:+.2f}" for k, v in sorted(all_deltas.items(), key=lambda x: abs(x[1]), reverse=True)[:6])
        _log("calc",  f"Combined param deltas (top 6): {delta_summary}")
        avg_wb_before = sum(c.wellbeing.score() for c in state.citizens) / max(len(state.citizens), 1)
        # Log one sample citizen's breakdown
        sample_citizen = state.citizens[0] if state.citizens else None
        for citizen in state.citizens:
            citizen.wellbeing = update_citizen_wellbeing(citizen, all_deltas, state.city_profile)
        avg_wb_after = sum(c.wellbeing.score() for c in state.citizens) / max(len(state.citizens), 1)
        wb_delta = avg_wb_after - avg_wb_before
        _log("calc",  f"Avg wellbeing: {avg_wb_before:.2f} → {avg_wb_after:.2f}  (Δ {wb_delta:+.2f})")
        if sample_citizen:
            d = sample_citizen.demographics
            _log("info",  f"Sample citizen: {sample_citizen.name}  "
                          f"({d.income_bracket}, {d.location}, {d.religion})")

        # ⑩ Scandal check (opposition_pressure estimated as inverse of execution score)
        _log("phase", f"⑩ SCANDAL CHECK — {minister.citizen.name}  "
                      f"(exposure={minister.state.scandal_exposure:.0f}, media_freedom={params.media_freedom:.0f})")
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
            _log("bad",   f"SCANDAL BROKE for {minister.citizen.name}!")
        else:
            _log("info",  "No scandal this turn")

        # ⑪ Opposition attack + media
        _log("phase", "⑪ OPPOSITION ATTACK & COUNTER-FRAME")
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
        _log("info",  f"Attack strategy: \"{attack_strategy}\"  "
                      f"(scandal={scandal_broke}, crisis={bool(state.active_events)}, "
                      f"debt_ratio={outstanding_debt / max(state.city_profile.budget.max_debt, 1):.2f}, "
                      f"turns_to_election={turns_to_election})")

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
        _log("calc",  f"Opp effectiveness: {opp_effectiveness:.3f}  |  Counter-frame \"{counter_frame_strategy}\": {counter_eff:.3f}")
        if net_opp_impact > 0:
            _log("bad",   f"Net opp impact: {net_opp_impact:+.3f}  →  opposition wins this cycle")
        else:
            _log("good",  f"Net opp impact: {net_opp_impact:+.3f}  →  counter-frame wins")

        # Update opposition credibility
        old_cred = state.opposition_credibility
        state.opposition_credibility = update_opposition_credibility(
            state.opposition_credibility,
            attack_landed=net_opp_impact > 0,
            attack_fabricated=(attack_strategy == "Corruption Accusation" and not scandal_broke),
            media_freedom=params.media_freedom,
            attack_credibility=0.5,
            attack_relevant=True,
        )
        _log("info",  f"Opposition credibility: {old_cred:.1f} → {state.opposition_credibility:.1f}")

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
        _log("phase", "⑫ COMMUNAL TENSION")
        delta_community = all_deltas.get("community_and_spaces", 0.0)
        delta_police = all_deltas.get("police_and_emergency", 0.0)
        minority_sensitive = state.city_profile.communal_config.dominant_fault_line in ("ethnic", "religious")
        communal_crisis = any(
            "communal" in e.name.lower() or "tension" in e.name.lower()
            for e in state.active_events
        )
        communal_severity = max((e.severity for e in state.active_events), default=0)
        opp_identity_mobilized = (attack_strategy == "Identity Mobilization")
        _log("calc",  f"delta_community={delta_community:+.2f}, delta_police={delta_police:+.2f}, "
                      f"minority_sensitive={minority_sensitive}, communal_crisis={communal_crisis}, "
                      f"opp_identity_mobilized={opp_identity_mobilized}")
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
        tag = "bad" if new_tension > state.communal_tension else "good" if new_tension < state.communal_tension else "info"
        _log(tag,     f"Communal tension: {state.communal_tension:.1f} → {new_tension:.1f}  "
                      f"(baseline: {state.city_profile.communal_config.tension_baseline:.1f})")

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
        _log("phase", "⑬ LLM NARRATIVE")
        _log("llm",   "→ generate_delivery_narrative() ...")
        delivery_narrative = generate_delivery_narrative(
            self.llm, policy, impl.execution_score, impl.actual_deltas,
            state.city_profile.city_name, state.current_turn
        )
        _log("llm",   f"✓ delivery_narrative: {len(delivery_narrative.split())} words")

        _log("llm",   f"→ generate_media_headlines() ({len(state.media_outlets)} outlets) ...")
        media_headlines = generate_media_headlines(
            self.llm,
            state.media_outlets,
            policy,
            impl.execution_score,
            scandal_broke,
            scandal_minister_name,
            state.active_events,
        )
        _log("llm",   f"✓ media_headlines: {len(media_headlines)} headlines")

        # Sample 5 citizens for reactions (exclude ministers)
        minister_ids = {m.citizen.id for m in state.ministers}
        eligible_citizens = [c for c in state.citizens if c.id not in minister_ids]
        sampled = rng.sample(eligible_citizens, min(5, len(eligible_citizens)))
        sampled_dicts = [self._citizen_for_reaction(c) for c in sampled]
        _log("llm",   f"→ sample_citizen_reactions() ({len(sampled)} citizens) ...")
        city_languages = state.city_profile.languages
        citizen_voices = sample_citizen_reactions(
            self.llm, policy, impl.execution_score, sampled_dicts,
            state.city_profile.city_name, city_languages
        )
        _log("llm",   f"✓ citizen_voices: {len(citizen_voices)} reactions")

        _log("llm",   "→ generate_advisor_summary() ...")
        worst_side = min(impl.side_effect_deltas.items(), key=lambda x: x[1], default=(None, 0))
        advisor_summary = generate_advisor_summary(
            self.llm,
            policy_name=policy.name,
            execution_score=impl.execution_score,
            budget_stolen=impl.corruption.budget_stolen,
            approval_before=approval_now,
            approval_after=interim_approval,
            events_triggered=[e.name for e in newly_triggered],
            worst_side_effect=worst_side[0],
            treasury=treasury,
            city_name=state.city_profile.city_name,
        )
        _log("llm",   f"✓ advisor_summary: {len(advisor_summary.split())} words")

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
            approval_before=approval_now,
            interim_approval=interim_approval,
            ward_report=ward_report,
            events_triggered=newly_triggered,
            communal_tension_after=new_tension,
            minister_loyalty_changes=minister_loyalty_changes,
            treasury_after=treasury,
            outstanding_debt_after=outstanding_debt,
            interest_paid=interest_paid,
            tax_revenue=tax_rev,
            advisor_summary=advisor_summary,
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

        # ─── Turn summary footer ──────────────────────────────────────────────
        approval_delta = interim_approval - approval_now
        _log("phase", f"══════ TURN {turn_result.turn} COMPLETE ═══════════════════════════════")
        tag_appr = "good" if approval_delta >= 0 else "bad"
        _log(tag_appr, f"Approval:      {approval_now:.1f}% → {interim_approval:.1f}%  ({approval_delta:+.1f})")
        tag_wb = "good" if avg_wb_after >= avg_wb_before else "bad"
        _log(tag_wb,   f"Avg wellbeing: {avg_wb_before:.2f} → {avg_wb_after:.2f}  ({avg_wb_after - avg_wb_before:+.2f})")
        _log("calc",   f"Treasury:      ₹{state.treasury:.0f} Cr  |  Debt: ₹{state.outstanding_debt:.0f} Cr")
        _log("info",   f"Exec score: {impl.execution_score:.3f}  |  Stolen: ₹{impl.corruption.budget_stolen:.1f} Cr  |  Events: {len(state.active_events)} active")
        _log("phase",  "═" * 54)

        return turn_result

    # ------------------------------------------------------------------
    # Streaming turn executor (SSE generator)
    # ------------------------------------------------------------------

    def execute_turn_streaming(
        self,
        policy_index: int,
        minor_action: dict[str, Any],
        counter_frame_strategy: str = "Delivery Receipts",
    ):
        """Generator version of execute_turn — yields milestone dicts between phases.

        Each yielded dict has a "type" key. Types emitted:
          policy_start, implementation, events, politics,
          narrative_chunk (key=delivery|headlines|voices|advisor),
          complete, error
        """
        assert self.state
        state = self.state
        rng = random.Random(state.prng_seed + state.current_turn * 1000)

        city = state.city_profile.city_name
        _log("phase", "═" * 54)
        _log("phase", f"TURN {state.current_turn}  |  City of {city}  |  STREAMING")
        _log("phase", "═" * 54)
        approval_now = compute_overall_approval(state.citizens)

        # ① Minor action
        m_action = MinorAction(**minor_action)
        treasury = state.treasury
        treasury = apply_minor_action_budget(treasury, m_action, bonus_banking=20.0)
        params = state.city_params
        targeted_this_turn: set[str] = set()

        _GOVERNANCE_PARAMS = {"admin_efficiency", "anti_corruption", "media_freedom"}
        if m_action.type == "governance_upkeep":
            gov_target = m_action.target if m_action.target in _GOVERNANCE_PARAMS else "admin_efficiency"
            params = params.apply_delta({gov_target: 1.0})
            targeted_this_turn.add(gov_target)
        elif m_action.type == "maintenance" and m_action.target:
            targeted_this_turn.add(m_action.target)

        # ② Parse chosen policy
        if not self._pending_policy_options:
            raise ValueError("No policy options available. Call get_policy_options first.")
        raw_policy = self._pending_policy_options[policy_index % len(self._pending_policy_options)]
        policy = Policy(**{k: v for k, v in raw_policy.items() if k in Policy.model_fields})
        for k in policy.target_effects:
            targeted_this_turn.add(k)

        yield {
            "type": "policy_start",
            "policy_name": policy.name,
            "portfolio": policy.portfolio,
            "budget_cost": policy.budget_cost,
            "target_effects": policy.target_effects,
            "time_profile": policy.time_profile or {"turn_0": 1.0},
        }

        # ③ Interest + tax
        interest_paid = process_interest_payment(state.outstanding_debt, state.city_profile.budget.interest_rate)
        treasury -= interest_paid
        tax_rev = compute_tax_revenue(state.city_params, state.city_profile.budget.base_tax_revenue)
        treasury += tax_rev

        # ④ Implementation
        minister = self._find_minister_for_portfolio(policy.portfolio)
        if minister is None:
            raise ValueError("No ministers in cabinet.")
        crisis_active = bool(state.active_events)
        impl = run_implementation(
            policy, minister, state.city_params,
            state.city_profile.budget.max_policy_budget, rng, crisis_active,
        )
        self._total_stolen += impl.corruption.budget_stolen
        minister.state.scandal_exposure = min(
            100.0, minister.state.scandal_exposure + impl.corruption.leakage_rate * 20.0
        )

        yield {
            "type": "implementation",
            "execution_score": impl.execution_score,
            "minister_name": minister.citizen.name,
            "budget_stolen": impl.corruption.budget_stolen,
            "actual_deltas": impl.actual_deltas,
            "side_effect_deltas": impl.side_effect_deltas,
        }

        yield {
            "type": "phase_reaction",
            "phase": "implementation",
            "exec_pct": round(impl.execution_score * 100),
            "minister_name": minister.citizen.name,
            "portfolio": policy.portfolio,
            "policy_name": policy.name,
            "budget_stolen": round(impl.corruption.budget_stolen, 1),
        }

        # ⑤ Apply deltas
        treasury -= policy.budget_cost
        time_profile = policy.time_profile or {"turn_0": 1.0}
        t0_frac = time_profile.get("turn_0", 1.0)
        all_policy_deltas: dict[str, float] = {}
        for param, val in impl.actual_deltas.items():
            all_policy_deltas[param] = all_policy_deltas.get(param, 0.0) + val
        for param, val in impl.side_effect_deltas.items():
            all_policy_deltas[param] = all_policy_deltas.get(param, 0.0) + val
        immediate_deltas = {k: v * t0_frac for k, v in all_policy_deltas.items()}
        for key, frac in time_profile.items():
            if key == "turn_0":
                continue
            turn_offset = int(key.replace("turn_", ""))
            apply_turn = state.current_turn + turn_offset
            carry = state.pending_deltas.setdefault(apply_turn, {})
            for param, val in all_policy_deltas.items():
                carry[param] = carry.get(param, 0.0) + val * frac
                targeted_this_turn.add(param)
        params = state.city_params.apply_delta(immediate_deltas)
        pending = state.pending_deltas.pop(state.current_turn, {})
        params = params.apply_delta(pending)

        # ⑥ Events
        remaining_events, event_deltas = step_events(state.active_events, rng)
        params = params.apply_delta(event_deltas)
        new_remaining = len(remaining_events)
        old_count = len(state.active_events)
        resolutions = max(0, old_count - new_remaining)
        self._escalations += sum(1 for e in remaining_events if e.escalation_level > 0)
        self._resolutions += resolutions
        existing_names = {e.name for e in remaining_events}
        new_threshold = check_threshold_events(params, existing_names)
        new_stochastic = check_stochastic_events(params, len(remaining_events), rng)
        newly_triggered = new_threshold + new_stochastic
        self._crises_triggered += sum(1 for e in newly_triggered if e.type == "crisis")
        state.active_events = remaining_events + newly_triggered

        yield {
            "type": "events",
            "events_triggered": [e.model_dump() for e in newly_triggered],
            "treasury_after": treasury,
        }

        yield {
            "type": "phase_reaction",
            "phase": "events",
            "events_count": len(newly_triggered),
            "event_names": [e.name for e in newly_triggered[:2]],
            "event_types": [e.type for e in newly_triggered[:2]],
        }

        # ⑦ Decay
        params = apply_maintenance_decay(
            params, targeted_this_turn, state.targeted_last_turn, params.admin_efficiency,
        )
        stolen = impl.corruption.budget_stolen
        params = apply_corruption_consequences(
            params, stolen, state.city_profile.budget.max_policy_budget,
        )

        # ⑧ Debt
        debt_fx = debt_political_effects(state.outstanding_debt, state.city_profile.budget.max_debt)
        if debt_fx["fiscal_crisis"]:
            params = params.apply_delta({"admin_efficiency": -debt_fx["admin_drain"]})
        treasury, outstanding_debt = process_auto_repayment(treasury, state.outstanding_debt)

        # ⑨ Wellbeing
        all_deltas = dict(immediate_deltas)
        all_deltas.update(event_deltas)
        avg_wb_before = sum(c.wellbeing.score() for c in state.citizens) / max(len(state.citizens), 1)
        for citizen in state.citizens:
            citizen.wellbeing = update_citizen_wellbeing(citizen, all_deltas, state.city_profile)
        avg_wb_after = sum(c.wellbeing.score() for c in state.citizens) / max(len(state.citizens), 1)

        # ⑩ Scandal
        scandal_broke = check_scandal_break(
            minister, state.media_outlets, 1.0 - impl.execution_score,
            params.media_freedom, rng,
        )
        scandal_minister_name: str | None = None
        if scandal_broke:
            self._total_scandals += 1
            scandal_minister_name = minister.citizen.name

        # ⑪ Opposition
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
            state.opposition_leader, attack_strategy, impl.execution_score,
            state.media_outlets, avg_wb, attack_credibility=0.5,
            credibility_score=state.opposition_credibility,
        )
        counter_eff = counter_effectiveness(
            strategy=counter_frame_strategy, execution_score=impl.execution_score,
            avg_wellbeing_of_target=avg_wb, anti_corruption=params.anti_corruption,
            media_freedom=params.media_freedom,
            opp_integrity=state.opposition_leader.personality.integrity,
            turns_since_last_populist=3, outlets=state.media_outlets,
        )
        net_opp_impact = opp_effectiveness - counter_eff
        state.opposition_credibility = update_opposition_credibility(
            state.opposition_credibility,
            attack_landed=net_opp_impact > 0,
            attack_fabricated=(attack_strategy == "Corruption Accusation" and not scandal_broke),
            media_freedom=params.media_freedom,
            attack_credibility=0.5,
            attack_relevant=True,
        )
        for citizen in state.citizens:
            eng = political_engagement(citizen, params.media_freedom)
            opp_push = opposition_alignment_push(net_opp_impact, eng)
            citizen.mayor_alignment = update_mayor_alignment(
                citizen, citizen.wellbeing, state.media_outlets,
                params.media_freedom, opp_push,
            )

        # ⑫ Communal tension
        delta_community = all_deltas.get("community_and_spaces", 0.0)
        delta_police = all_deltas.get("police_and_emergency", 0.0)
        minority_sensitive = state.city_profile.communal_config.dominant_fault_line in ("ethnic", "religious")
        communal_crisis = any("communal" in e.name.lower() or "tension" in e.name.lower() for e in state.active_events)
        communal_severity = max((e.severity for e in state.active_events), default=0)
        opp_identity_mobilized = (attack_strategy == "Identity Mobilization")
        new_tension = update_communal_tension(
            state.communal_tension, state.city_profile.communal_config.tension_baseline,
            festival_boost=0.0, delta_community=delta_community, delta_police=delta_police,
            minority_police_sensitive=minority_sensitive, crisis_communal=communal_crisis,
            crisis_severity=communal_severity, opposition_identity_mobilized=opp_identity_mobilized,
            opposition_effectiveness=opp_effectiveness,
        )
        interim_approval = compute_interim_approval(state.citizens, params.media_freedom)
        delta_p13 = params.media_freedom - state.city_params.media_freedom
        state.media_outlets = apply_media_drift(state.media_outlets, interim_approval, delta_p13, rng)
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

        yield {
            "type": "politics",
            "attack": attack_strategy,
            "counter": counter_frame_strategy,
            "approval_before": approval_now,
            "approval_after": interim_approval,
            "opposition_credibility": state.opposition_credibility,
        }

        yield {
            "type": "phase_reaction",
            "phase": "politics",
            "approval_before": approval_now,
            "approval_after": interim_approval,
            "attack": attack_strategy,
            "counter": counter_frame_strategy,
        }

        # ⑬ LLM narrative — yield each chunk individually as it completes
        _log("llm", "→ [stream] generate_delivery_narrative() ...")
        delivery_narrative = generate_delivery_narrative(
            self.llm, policy, impl.execution_score, impl.actual_deltas,
            state.city_profile.city_name, state.current_turn
        )
        yield {"type": "narrative_chunk", "key": "delivery", "value": delivery_narrative}

        _log("llm", "→ [stream] generate_media_headlines() ...")
        media_headlines = generate_media_headlines(
            self.llm, state.media_outlets, policy, impl.execution_score,
            scandal_broke, scandal_minister_name, state.active_events,
        )
        yield {"type": "narrative_chunk", "key": "headlines", "value": [h.model_dump() for h in media_headlines]}

        minister_ids = {m.citizen.id for m in state.ministers}
        eligible_citizens = [c for c in state.citizens if c.id not in minister_ids]
        sampled = rng.sample(eligible_citizens, min(5, len(eligible_citizens)))
        sampled_dicts = [self._citizen_for_reaction(c) for c in sampled]
        _log("llm", "→ [stream] sample_citizen_reactions() ...")
        city_languages = state.city_profile.languages
        citizen_voices = sample_citizen_reactions(
            self.llm, policy, impl.execution_score, sampled_dicts,
            state.city_profile.city_name, city_languages
        )
        yield {"type": "narrative_chunk", "key": "voices", "value": [v.model_dump() for v in citizen_voices]}

        worst_side = min(impl.side_effect_deltas.items(), key=lambda x: x[1], default=(None, 0))
        _log("llm", "→ [stream] generate_advisor_summary() ...")
        advisor_summary = generate_advisor_summary(
            self.llm, policy_name=policy.name, execution_score=impl.execution_score,
            budget_stolen=impl.corruption.budget_stolen, approval_before=approval_now,
            approval_after=interim_approval, events_triggered=[e.name for e in newly_triggered],
            worst_side_effect=worst_side[0], treasury=treasury, city_name=state.city_profile.city_name,
        )
        yield {"type": "narrative_chunk", "key": "advisor", "value": advisor_summary}

        # Assemble TurnResult and commit state
        ward_report = self._compute_ward_report(state.citizens, all_deltas)
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
            approval_before=approval_now,
            interim_approval=interim_approval,
            ward_report=ward_report,
            events_triggered=newly_triggered,
            communal_tension_after=new_tension,
            minister_loyalty_changes=minister_loyalty_changes,
            treasury_after=treasury,
            outstanding_debt_after=outstanding_debt,
            interest_paid=interest_paid,
            tax_revenue=tax_rev,
            advisor_summary=advisor_summary,
        )

        state.city_params = params
        state.treasury = treasury
        state.outstanding_debt = outstanding_debt
        state.communal_tension = new_tension
        state.targeted_last_turn = state.targeted_this_turn
        state.targeted_this_turn = targeted_this_turn
        state.turn_history.append(turn_result)
        state.current_turn += 1
        self._sealed_transcripts = []
        self._pending_policy_options = []
        if state.current_turn > state.city_profile.game_config.election_turn and state.phase == "pre_election":
            state.phase = "legacy"

        # Loss check
        loss_reason = check_loss_conditions(state)
        if loss_reason:
            state.phase = "game_over"
        is_final = state.phase == "game_over" or (
            state.current_turn > state.city_profile.game_config.total_turns
        )
        scorecard = None
        if is_final:
            try:
                scorecard = self.compute_final_score().model_dump()
            except Exception:
                pass

        _log("phase", f"══════ TURN {turn_result.turn} COMPLETE (streamed) ══")

        yield {
            "type": "complete",
            "turn_result": turn_result.model_dump(),
            "state": self.get_state_snapshot(),
            "game_over": is_final,
            **({"loss_reason": loss_reason} if loss_reason else {}),
            **({"scorecard": scorecard} if scorecard else {}),
        }

    # ------------------------------------------------------------------
    # Agentic turn execution (v2 — AI-driven evaluation + citizen poll)
    # ------------------------------------------------------------------

    def execute_turn_agentic(
        self,
        policy_index: int,
        minister_id: str,
        minor_action: dict[str, Any],
    ):
        """Fully agentic turn — AI evaluates policy, citizens vote on approval.

        Yields SSE event dicts for each phase. Frontend connects to /turn/stream/v2.
        """
        assert self.state
        state = self.state
        rng = random.Random(state.prng_seed + state.current_turn * 1000)
        llm = self.llm

        # ── Validate inputs ───────────────────────────────────────────
        if not self._pending_policy_options:
            raise ValueError("No policy options pending — call get_policy_options first")
        if policy_index < 0 or policy_index >= len(self._pending_policy_options):
            raise ValueError(f"Invalid policy_index {policy_index}")

        policy_dict = self._pending_policy_options[policy_index]
        policy = Policy(**policy_dict) if isinstance(policy_dict, dict) else policy_dict

        minor = MinorAction(**minor_action) if isinstance(minor_action, dict) else minor_action

        # Find player-chosen minister
        minister = self._get_minister(minister_id)
        if minister is None:
            # Fallback to portfolio match
            minister = self._find_minister_for_portfolio(policy.portfolio)
        if minister is None:
            raise ValueError(f"Minister {minister_id} not found")

        city_name = state.city_profile.city_name
        languages = state.city_profile.languages
        params = state.city_params
        current_turn = state.current_turn

        # ── Phase 1: Announcement ─────────────────────────────────────
        _log("phase", f"[agentic] Phase 1 — Announcement: {policy.name}")
        yield {
            "type": "announcement",
            "policy": policy.model_dump(),
            "minister_name": minister.citizen.name,
            "minister_portfolio": minister.portfolio,
        }

        # 2–3 immediate citizen reactions to the announcement
        minister_ids = {m.citizen.id for m in state.ministers}
        eligible = [c for c in state.citizens if c.id not in minister_ids]
        sample_3 = rng.sample(eligible, min(3, len(eligible)))
        sample_3_dicts = [self._citizen_for_reaction(c) for c in sample_3]
        announcement_voices = sample_citizen_reactions(
            llm, policy, 1.0, sample_3_dicts, city_name, languages
        )
        yield {
            "type": "announcement_voices",
            "voices": [v.model_dump() for v in announcement_voices],
        }

        # ── Phase 2: Assignment confirmed ─────────────────────────────
        _log("phase", f"[agentic] Phase 2 — Assignment: {minister.citizen.name}")
        yield {
            "type": "assignment",
            "minister_id": minister.citizen.id,
            "minister_name": minister.citizen.name,
            "portfolio": minister.portfolio,
            "competence": round(minister.citizen.capability.competence),
            "loyalty": round(minister.state.loyalty),
            "scandal_exposure": round(minister.state.scandal_exposure),
        }

        # ── Phase 3: AI Policy Evaluation ────────────────────────────
        _log("phase", "[agentic] Phase 3 — AI evaluation")
        ward_report = self._compute_ward_report(state.citizens, {})
        recent_history = [
            {
                "turn": tr.turn,
                "policy": tr.major_policy.name if tr.major_policy else "?",
                "exec_pct": round(tr.execution_score * 100),
                "approval_before": round(tr.approval_before or 0),
                "approval_after": round(tr.interim_approval),
            }
            for tr in state.turn_history[-2:]
        ]
        eval_result = evaluate_policy_implementation(
            llm, policy, minister, params, ward_report, recent_history, city_name
        )
        execution_score = eval_result["execution_pct"] / 100.0
        budget_stolen = eval_result["leakage_cr"]
        actual_deltas = eval_result["city_param_deltas"]
        side_effect_deltas = eval_result["side_effect_deltas"]

        yield {"type": "evaluation", **eval_result}

        # Apply param deltas to city
        all_deltas = {**actual_deltas, **side_effect_deltas}
        params = params.apply_delta(all_deltas)

        # Deterministic wellbeing update per citizen
        wb_before_map = {c.id: c.wellbeing for c in state.citizens}
        for c in state.citizens:
            c.wellbeing = update_citizen_wellbeing(c, all_deltas, state.city_profile)

        # Recompute ward report with updated wellbeing
        updated_ward_report = self._compute_ward_report(state.citizens, actual_deltas)
        yield {
            "type": "wellbeing_update",
            "ward_report": [e.model_dump() for e in updated_ward_report],
        }

        # 3–5 implementation reactions
        sample_5 = rng.sample(eligible, min(5, len(eligible)))
        sample_5_dicts = [self._citizen_for_reaction(c) for c in sample_5]
        impl_voices = sample_citizen_reactions(
            llm, policy, execution_score, sample_5_dicts, city_name, languages
        )
        yield {
            "type": "implementation_voices",
            "voices": [v.model_dump() for v in impl_voices],
        }

        # ── Phase 4: Citizen Approval Poll ───────────────────────────
        _log("phase", "[agentic] Phase 4 — Citizen approval poll")
        poll_sample = rng.sample(eligible, min(32, len(eligible)))
        params_before_dict = state.city_params.as_dict()
        params_after_dict = params.as_dict()

        approval_votes: list[dict] = []

        def _poll_one(citizen):
            return poll_citizen_approval(
                llm=llm,
                citizen=citizen,
                wellbeing_before=wb_before_map[citizen.id],
                wellbeing_after=citizen.wellbeing,
                policy=policy,
                execution_pct=eval_result["execution_pct"],
                city_params_before=params_before_dict,
                city_params_after=params_after_dict,
                city_name=city_name,
            )

        with ThreadPoolExecutor(max_workers=12) as pool:
            futures = {pool.submit(_poll_one, c): c for c in poll_sample}
            for future in as_completed(futures):
                try:
                    voice = future.result()
                    citizen = futures[future]
                    yield {
                        "type": "approval_vote",
                        "voice": voice.model_dump(),
                        "population_weight": citizen.population_weight,
                    }
                    approval_votes.append({
                        "sentiment": voice.sentiment,
                        "weight": citizen.population_weight,
                    })
                except Exception as exc:
                    _log("bad", f"[agentic] poll error: {exc}")

        # Compute weighted approval from votes
        approve_w = sum(v["weight"] for v in approval_votes if v["sentiment"] == "approve")
        disapprove_w = sum(v["weight"] for v in approval_votes if v["sentiment"] == "disapprove")
        total_w = sum(v["weight"] for v in approval_votes)
        if total_w > 0:
            interim_approval = (approve_w / total_w) * 100.0
        else:
            interim_approval = compute_interim_approval(state.citizens, params.media_freedom)

        approval_before = compute_interim_approval(state.citizens, state.city_params.media_freedom)

        yield {
            "type": "approval_final",
            "approval": round(interim_approval, 1),
            "approval_before": round(approval_before, 1),
            "breakdown": {
                "approve": len([v for v in approval_votes if v["sentiment"] == "approve"]),
                "disapprove": len([v for v in approval_votes if v["sentiment"] == "disapprove"]),
                "undecided": 0,
                "total": len(approval_votes),
            },
        }

        # Update citizen alignments based on wellbeing changes
        for c in state.citizens:
            opp_push = 0.0
            c.mayor_alignment = update_mayor_alignment(
                c, c.wellbeing, state.media_outlets, params.media_freedom, opp_push
            )

        # ── Events (deterministic) ────────────────────────────────────
        threshold_events = check_threshold_events(params, {e.name for e in state.active_events})
        stochastic_events = check_stochastic_events(params, len(state.active_events), rng)
        newly_triggered = threshold_events + stochastic_events
        state.active_events.extend(newly_triggered)
        state.active_events, event_deltas = step_events(state.active_events, rng)
        params = params.apply_delta(event_deltas)

        if newly_triggered:
            yield {
                "type": "events",
                "events_triggered": [e.model_dump() for e in newly_triggered],
            }

        # ── Budget ────────────────────────────────────────────────────
        tax_rev = compute_tax_revenue(params, state.city_profile.budget.base_tax_revenue)
        treasury = state.treasury + tax_rev
        treasury -= policy.budget_cost
        treasury -= budget_stolen
        interest_paid = process_interest_payment(state.outstanding_debt, state.city_profile.budget.interest_rate)
        treasury -= interest_paid
        treasury, outstanding_debt = process_auto_repayment(treasury, state.outstanding_debt)
        treasury = apply_minor_action_budget(treasury, minor)
        params = apply_corruption_consequences(params, budget_stolen, policy.budget_cost)
        params = apply_maintenance_decay(
            params, state.targeted_this_turn, state.targeted_last_turn, params.admin_efficiency
        )

        # ── Media + opposition ────────────────────────────────────────
        scandal_broke = check_scandal_break(
            minister, state.media_outlets, 1 - execution_score, params.media_freedom, rng
        )
        attack_strategy = pick_attack_strategy(
            state.opposition_leader, state.city_params.as_dict(), params.as_dict(),
            execution_score, scandal_broke, bool(state.active_events),
            state.outstanding_debt, state.city_profile.budget.max_debt,
            max(1, state.city_profile.game_config.election_turn - current_turn),
        )
        counter_frame = "Delivery Receipts"

        state.media_outlets = apply_media_drift(state.media_outlets, interim_approval, 0.0, rng)

        # Communal tension update
        delta_community = all_deltas.get("community_and_spaces", 0.0)
        delta_police = all_deltas.get("police_and_emergency", 0.0)
        minority_sensitive = state.city_profile.communal_config.dominant_fault_line in ("ethnic", "religious")
        communal_crisis = any("communal" in e.name.lower() or "tension" in e.name.lower() for e in state.active_events)
        communal_severity = max((e.severity for e in state.active_events), default=0)
        opp_identity_mobilized = (attack_strategy == "Identity Mobilization")
        avg_wb = sum(c.wellbeing.score() for c in state.citizens) / max(len(state.citizens), 1)
        opp_effectiveness = compute_opposition_effectiveness(
            state.opposition_leader, attack_strategy, execution_score,
            state.media_outlets, avg_wb,
            attack_credibility=0.5, credibility_score=state.opposition_credibility,
        )
        new_tension = update_communal_tension(
            state.communal_tension, state.city_profile.communal_config.tension_baseline,
            festival_boost=0.0, delta_community=delta_community, delta_police=delta_police,
            minority_police_sensitive=minority_sensitive, crisis_communal=communal_crisis,
            crisis_severity=communal_severity, opposition_identity_mobilized=opp_identity_mobilized,
            opposition_effectiveness=opp_effectiveness,
        )

        # ── Delivery narrative ──────────────────────────────────────────
        _log("llm", "[agentic] → generate_delivery_narrative()")
        delivery_narrative = generate_delivery_narrative(
            llm, policy, execution_score, actual_deltas, city_name, current_turn
        )
        yield {"type": "narrative_chunk", "key": "delivery", "value": delivery_narrative}

        # ── Media headlines ───────────────────────────────────────────
        _log("llm", "[agentic] → generate_media_headlines()")
        media_headlines = generate_media_headlines(
            llm, state.media_outlets, policy, execution_score,
            scandal_broke, minister.citizen.name if scandal_broke else None,
            state.active_events,
        )
        yield {
            "type": "narrative_chunk",
            "key": "headlines",
            "value": [h.model_dump() for h in media_headlines],
        }

        # ── Advisor debrief ───────────────────────────────────────────
        _log("llm", "[agentic] → generate_advisor_summary()")
        worst_side = min(side_effect_deltas.items(), key=lambda x: x[1], default=(None, 0))
        advisor_summary = generate_advisor_summary(
            llm, policy.name, execution_score, budget_stolen,
            approval_before, interim_approval,
            [e.name for e in newly_triggered],
            worst_side[0], treasury, city_name,
        )
        yield {"type": "narrative_chunk", "key": "advisor", "value": advisor_summary}

        # ── Assemble TurnResult ───────────────────────────────────────
        delivery_targets = [
            DeliveryTarget(
                key=t.key, label=t.label, unit=t.unit,
                proposed=t.proposed,
                delivered=actual_deltas.get(t.key, 0.0),
                completion_ratio=min(1.0, abs(actual_deltas.get(t.key, 0.0)) / max(0.01, abs(t.proposed))),
            )
            for t in (policy.targets or [])
        ]

        turn_result = TurnResult(
            turn=current_turn,
            major_policy=policy,
            minor_action=minor,
            execution_score=execution_score,
            actual_deltas=actual_deltas,
            side_effect_deltas=side_effect_deltas,
            budget_stolen=budget_stolen,
            delivery_targets=delivery_targets,
            delivery_narrative=delivery_narrative,
            evaluator_reasoning=eval_result.get("reasoning", ""),
            city_params_before=state.city_params.as_dict(),
            city_params_after=params.as_dict(),
            media_headlines=media_headlines,
            citizen_voices=list(impl_voices) + list(announcement_voices),
            opposition_attack=attack_strategy,
            counter_frame=counter_frame,
            approval_before=approval_before,
            interim_approval=interim_approval,
            ward_report=updated_ward_report,
            events_triggered=newly_triggered,
            communal_tension_after=new_tension,
            minister_loyalty_changes={},
            treasury_after=treasury,
            outstanding_debt_after=outstanding_debt,
            interest_paid=interest_paid,
            tax_revenue=tax_rev,
            advisor_summary=advisor_summary,
        )

        # ── Commit state ──────────────────────────────────────────────
        state.city_params = params
        state.treasury = treasury
        state.outstanding_debt = outstanding_debt
        state.communal_tension = new_tension
        state.targeted_last_turn = state.targeted_this_turn
        state.targeted_this_turn = set(actual_deltas.keys())
        state.turn_history.append(turn_result)
        state.current_turn += 1
        self._sealed_transcripts = []
        self._pending_policy_options = []

        if state.current_turn > state.city_profile.game_config.election_turn and state.phase == "pre_election":
            state.phase = "legacy"

        loss_reason = check_loss_conditions(state)
        if loss_reason:
            state.phase = "game_over"
        is_final = state.phase == "game_over" or state.current_turn > state.city_profile.game_config.total_turns
        scorecard = None
        if is_final:
            try:
                scorecard = self.compute_final_score().model_dump()
            except Exception:
                pass

        _log("phase", f"[agentic] ══ TURN {turn_result.turn} COMPLETE ══")
        yield {
            "type": "complete",
            "turn_result": turn_result.model_dump(),
            "state": self.get_state_snapshot(),
            "game_over": is_final,
            **({"loss_reason": loss_reason} if loss_reason else {}),
            **({"scorecard": scorecard} if scorecard else {}),
        }

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
            "ward_report": [e.model_dump() for e in self._compute_ward_report(state.citizens, {})],
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
            "demographics": f"{d.age_group}, {d.income_bracket}, {d.religion}, {d.profession}, {d.location}",
            "ideology": f"{d.ideology_economic} / {d.ideology_social}",
            "wellbeing": citizen.wellbeing.score(),
            "personality": (
                f"integrity {round(citizen.personality.integrity)}, "
                f"empathy {round(citizen.personality.empathy)}, "
                f"corruption_tolerance {round(citizen.personality.corruption_tolerance)}"
            ),
        }

    def _compute_ward_report(self, citizens, param_deltas: dict[str, float]) -> list[WardReportEntry]:
        """Aggregate wellbeing direction by demographic group."""
        from collections import defaultdict

        total_citizens = len(citizens)
        # Each group accumulates (wellbeing_scores, mayor_alignments)
        groups: dict[tuple[str, str], tuple[list[float], list[float]]] = defaultdict(lambda: ([], []))
        for c in citizens:
            d = c.demographics
            wb = c.wellbeing.score()
            alignment = c.mayor_alignment
            keys = [
                ("income", str(d.income_bracket)),
                ("location", d.location),
                ("profession", d.profession),
            ]
            if getattr(d, "religion", None):
                keys.append(("religion", d.religion))
            if getattr(d, "ideology_social", None):
                keys.append(("ideology", str(d.ideology_social)))
            for key in keys:
                wbs, aligns = groups[key]
                wbs.append(wb)
                aligns.append(alignment)

        total_delta = sum(abs(v) for v in param_deltas.values())
        delta_sign = 1.0 if sum(param_deltas.values()) > 0 else -1.0
        report = []
        for (group_type, group_name), (wellbeings, alignments) in groups.items():
            avg_wb = sum(wellbeings) / len(wellbeings)
            pop = len(wellbeings)
            pop_pct = round((pop / total_citizens) * 100, 1) if total_citizens > 0 else 0.0
            avg_approval = sum((a + 100) / 2.0 for a in alignments) / len(alignments)
            avg_delta = delta_sign * min(2.0, total_delta * 0.1)
            trend: str
            if avg_delta > 0.5:
                trend = "up"
            elif avg_delta < -0.5:
                trend = "down"
            else:
                trend = "flat"
                
            pulse = ""
            if total_delta == 0:
                pulse = "Baseline conditions established; awaiting initial mayoral actions."
            elif avg_delta > 0.5:
                if avg_approval > 60:
                    pulse = "Tangible improvements are reinforcing this group's strong baseline support."
                elif avg_approval < 40:
                    pulse = "Conditions have improved, but historical skepticism keeps overall approval muted."
                else:
                    pulse = "Noticeable gains have generated cautious optimism among these citizens."
            elif avg_delta < -0.5:
                if avg_approval > 60:
                    pulse = "Recent setbacks caused some friction, though goodwill towards the mayor persists."
                elif avg_approval < 40:
                    pulse = "Worsening conditions are severely compounding existing frustrations here."
                else:
                    pulse = "The recent decline in welfare has begun to erode this group's trust."
            else:
                if avg_approval > 60:
                    pulse = "Policies had minimal impact, but the group remains generally supportive."
                elif avg_approval < 40:
                    pulse = "Marginal changes failed to move the needle on this group's low approval."
                else:
                    pulse = "Status quo maintained; sentiment remains neutral and stable."

            report.append(WardReportEntry(
                group_type=group_type,
                group_name=group_name,
                trend=trend,  # type: ignore[arg-type]
                avg_wellbeing_delta=avg_delta,
                avg_wellbeing=round(avg_wb, 1),
                hotspot=avg_wb < 30.0,
                bright_spot=avg_wb > 70.0,
                population=pop,
                population_pct=pop_pct,
                approval=round(avg_approval, 1),
                pulse_summary=pulse,
            ))
        return report

"""PhoneSession — core game engine for The Mayor's Phone.

Orchestrates: game initialization, day tick, message generation,
response handling, escalation chains, and game state management.

All deterministic mechanics reuse the existing engine/ modules.
LLM is used ONLY for generating conversational messages.
"""

from __future__ import annotations

import logging
import random
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from llm.llm_client import LLMClient
from engine.models import (
    Citizen,
    CityProfile,
    MediaOutletState,
    Minister,
)
from engine.citizen import generate_citizens, select_minister_candidates
from engine.budget import compute_tax_revenue, process_interest_payment
from engine.events import check_threshold_events, check_stochastic_events, step_events
from engine.political import compute_interim_approval
from engine.wellbeing import update_citizen_wellbeing
from simulation.llm_calls import generate_citizen_names

from phone.models import (
    COMPLAINT_THRESHOLDS,
    ESCALATION_DAYS,
    EXPRESSION_DISTRIBUTION,
    EXPRESSION_WEIGHTS,
    PARAM_CASCADES,
    PARAM_LABELS,
    ActiveAction,
    ActiveProblem,
    CitizenThread,
    InboxMessage,
    PhoneGameState,
    Promise,
    SurveyResult,
    ThreadMessage,
)
from phone.prompts import (
    generate_citizen_complaint,
    generate_citizen_reaction,
    generate_media_headline,
    generate_minister_response,
    generate_opposition_attack,
    generate_secretary_options,
    generate_survey_summary,
    parse_mayor_response,
)

log = logging.getLogger("phone.session")

# Daily param decay for un-targeted params
DAILY_DECAY = 0.8  # points per day for neglected params


class PhoneSession:
    """Manages a single Mayor's Phone game session."""

    def __init__(self, llm: LLMClient, city_profile: CityProfile):
        self.llm = llm
        self.city_profile = city_profile
        self.state: PhoneGameState | None = None
        self._rng = random.Random(42)

    # ------------------------------------------------------------------
    # Initialization
    # ------------------------------------------------------------------

    def new_game(self) -> PhoneGameState:
        """Create a new game from a city profile."""
        profile = self.city_profile
        cfg = profile.game_config

        rng = random.Random(42)
        agent_count = cfg.agent_count

        # Generate citizen names via LLM, then create citizens
        names = generate_citizen_names(self.llm, profile, agent_count)
        citizens = generate_citizens(profile, names, rng)

        # Select ministers using engine's leadership scoring
        candidates = select_minister_candidates(citizens, cfg.minister_count, rng)
        portfolios = [
            "Infrastructure",
            "Health",
            "Finance",
            "Education",
            "Law & Order",
        ]
        ministers = []
        minister_ids = set()
        for i, portfolio in enumerate(
            portfolios[: min(cfg.minister_count, len(candidates))]
        ):
            c = candidates[i]
            minister_ids.add(c.id)
            ministers.append(Minister(citizen=c, portfolio=portfolio))

        # Create media outlet states
        media_outlets = [
            MediaOutletState(
                name=m.name,
                lean=m.lean,
                bias_intensity=m.bias_intensity,
                sensationalism=m.sensationalism,
                trust_rating=m.trust_rating,
                reach=m.reach,
                initial_trust=m.trust_rating,
                initial_reach=m.reach,
            )
            for m in profile.media_outlets
        ]

        # Assign expression types to citizens
        expression_types = self._assign_expression_types(citizens)

        # Build citizen threads
        citizen_threads: dict[str, CitizenThread] = {}
        for c in citizens:
            if c.id in minister_ids:
                continue
            citizen_threads[c.id] = CitizenThread(
                citizen_id=c.id,
                citizen_name=c.name,
                citizen_occupation=c.demographics.profession,
                citizen_area=c.demographics.location,
                citizen_summary=self._citizen_summary(c),
                expression_type=expression_types.get(c.id, "silent"),
            )

        state = PhoneGameState(
            city_profile=profile,
            city_params=profile.city_parameters,
            citizens=citizens,
            ministers=ministers,
            media_outlets=media_outlets,
            treasury=profile.budget.starting_treasury,
            citizen_threads=citizen_threads,
        )

        self.state = state
        self._rng = random.Random(state.prng_seed)
        return state

    # ------------------------------------------------------------------
    # Day Tick — advance the game by one day
    # ------------------------------------------------------------------

    def end_day(self) -> list[InboxMessage]:
        """Advance to next day and generate the new inbox.

        Returns the list of new inbox messages for the next day.
        This is a generator-friendly method — yields messages as they're created.
        """
        assert self.state
        s = self.state

        # --- Step 1: Complete finished actions ---
        completions = self._complete_actions()

        # --- Step 2: Decay params ---
        self._decay_params()

        # --- Step 3: Check thresholds & escalate ---
        new_problems = self._check_thresholds()
        self._escalate_problems()

        # --- Step 4: Update wellbeing & approval ---
        self._update_wellbeing_and_approval()

        # --- Step 5: Budget ---
        self._process_budget()

        # --- Step 6: Check broken promises ---
        broken = self._check_broken_promises()

        # --- Step 7: Events (deterministic) ---
        self._process_events()

        # --- Step 8: Check loss conditions ---
        loss = self._check_loss()
        if loss:
            s.phase = "game_over"
            s.loss_reason = loss

        # --- Advance day ---
        approval = compute_interim_approval(s.citizens, s.city_params.media_freedom)
        s.approval_history.append(approval)
        s.current_day += 1

        if s.current_day > s.total_days:
            s.phase = "election"

        # --- Step 9: Generate inbox (LLM calls) ---
        inbox = self._generate_inbox(completions, new_problems, broken)
        s.current_inbox = inbox

        # --- Step 10: Deliver pending survey ---
        if s.pending_survey:
            survey = self._run_survey()
            s.surveys.append(survey)
            s.pending_survey = False

        return inbox

    # ------------------------------------------------------------------
    # Player Response — handle a reply to an inbox message
    # ------------------------------------------------------------------

    def respond_to_message(
        self, message_id: str, response_text: str, option_index: int | None = None
    ) -> dict[str, Any]:
        """Process the player's response to an inbox message.

        Args:
            message_id: ID of the inbox message being replied to
            response_text: The mayor's response text
            option_index: If using secretary draft, the index (0-2)

        Returns dict with:
            - citizen_reply: generated response text
            - cost: ₹ Cr deducted
            - action_created: ActiveAction if applicable
            - promise_created: Promise if applicable
        """
        assert self.state
        s = self.state

        # Find the message
        msg = next((m for m in s.current_inbox if m.id == message_id), None)
        if not msg:
            return {"error": "Message not found"}

        msg.read = True

        # If secretary option, use pre-parsed data
        cost = 0.0
        action_hint = ""
        if option_index is not None and msg.secretary_options:
            opt = msg.secretary_options[
                min(option_index, len(msg.secretary_options) - 1)
            ]
            response_text = opt.text
            cost = opt.cost
            action_hint = opt.action_hint

        # Parse free-text response for intent
        parsed = {}
        if not action_hint:
            parsed = parse_mayor_response(
                self.llm,
                response_text,
                msg.text,
                msg.topic or "general",
                s.treasury,
            )
            cost = parsed.get("cost_estimate", 0)
            action_hint = parsed.get("action_type", "empathize")

        # Deduct cost
        if cost > 0:
            s.treasury -= cost

        # Create action if applicable
        action = None
        if action_hint not in (
            "deflect",
            "empathize",
            "refuse",
            "defer",
            "investigate",
        ):
            days = parsed.get("days_to_complete", 3) if parsed else 3
            delta = parsed.get("completion_delta", 2.0) if parsed else 2.0
            action = ActiveAction(
                action_type=action_hint
                if action_hint
                in ("repair", "build", "allocate", "policy", "hire", "reform")
                else "other",
                param_affected=msg.topic or "",
                area=self._get_sender_area(msg.sender_id),
                cost=cost,
                days_to_complete=max(1, days),
                started_on=s.current_day,
                triggered_by=msg.sender_id,
                mayor_quote=response_text,
                completion_delta=delta,
            )
            s.active_actions.append(action)

        # Create promise if applicable
        promise = None
        is_promise = parsed.get("is_promise", False) if parsed else (cost > 0)
        if is_promise:
            deadline = parsed.get("deadline_hint", 5) if parsed else 5
            promise = Promise(
                citizen_id=msg.sender_id,
                topic=msg.topic or "general",
                mayor_said=response_text,
                day_made=s.current_day,
                deadline_day=s.current_day + max(1, deadline),
            )
            s.promises.append(promise)

        # Mark problem as responded
        if msg.problem_id:
            for p in s.active_problems:
                if p.id == msg.problem_id:
                    p.mayor_responded = True
                    p.action_taken = action_hint
                    if action:
                        p.related_action_id = action.id

        # Update citizen thread
        if msg.sender_id in s.citizen_threads:
            thread = s.citizen_threads[msg.sender_id]
            thread.messages.append(
                ThreadMessage(
                    day=s.current_day,
                    sender="mayor",
                    text=response_text,
                    topic=msg.topic,
                    cost_committed=cost,
                    tone="neutral",
                )
            )
            thread.last_contact_day = s.current_day
            thread.relationship = min(100, thread.relationship + 5)
            if msg.topic and msg.topic in thread.open_complaints:
                thread.open_complaints.remove(msg.topic)

        # Generate citizen reply (1 LLM call)
        reply_text = ""
        if msg.sender_role == "citizen" and msg.sender_id in s.citizen_threads:
            thread = s.citizen_threads[msg.sender_id]
            reply_text = generate_citizen_reaction(
                self.llm,
                citizen_name=thread.citizen_name,
                citizen_summary=thread.citizen_summary,
                original_complaint=msg.text,
                mayor_response=response_text,
                outcome=f"action_{action_hint}" if action else "acknowledged",
                city_name=s.city_profile.city_name,
            )
            thread.messages.append(
                ThreadMessage(
                    day=s.current_day,
                    sender="citizen",
                    text=reply_text,
                    topic=msg.topic,
                    tone="grateful" if cost > 0 else "neutral",
                )
            )

        return {
            "citizen_reply": reply_text,
            "cost": cost,
            "action_created": action.model_dump() if action else None,
            "promise_created": promise.model_dump() if promise else None,
            "treasury": s.treasury,
        }

    # ------------------------------------------------------------------
    # Minister Chat — proactive conversation with a minister
    # ------------------------------------------------------------------

    def message_minister(self, minister_id: str, text: str) -> str:
        """Send a message to a minister and get their response."""
        assert self.state
        s = self.state

        minister = next((m for m in s.ministers if m.citizen.id == minister_id), None)
        if not minister:
            return "Minister not found."

        # Get relevant params for their portfolio
        portfolio_params = self._portfolio_params(minister.portfolio)
        relevant = {k: getattr(s.city_params, k, 50) for k in portfolio_params}

        reply = generate_minister_response(
            self.llm,
            minister_name=minister.citizen.name,
            minister_portfolio=minister.portfolio,
            competence=minister.citizen.capability.competence,
            loyalty=minister.state.loyalty,
            mayor_question=text,
            relevant_params=relevant,
            city_name=s.city_profile.city_name,
        )

        # Track in minister thread
        thread = s.minister_threads.setdefault(minister_id, [])
        thread.append(ThreadMessage(day=s.current_day, sender="mayor", text=text))
        thread.append(ThreadMessage(day=s.current_day, sender="citizen", text=reply))

        return reply

    # ------------------------------------------------------------------
    # Survey
    # ------------------------------------------------------------------

    def request_survey(self) -> bool:
        """Request a citizen survey. Costs ₹20 Cr, delivered next day."""
        assert self.state
        if self.state.treasury < 20:
            return False
        self.state.treasury -= 20
        self.state.pending_survey = True
        return True

    # ------------------------------------------------------------------
    # State Snapshot — what the frontend needs
    # ------------------------------------------------------------------

    def get_snapshot(self) -> dict[str, Any]:
        """Return minimal game state for the frontend status bar."""
        assert self.state
        s = self.state
        approval = compute_interim_approval(s.citizens, s.city_params.media_freedom)
        prev_approval = s.approval_history[-1] if s.approval_history else approval
        return {
            "game_id": s.game_id,
            "current_day": s.current_day,
            "total_days": s.total_days,
            "treasury": round(s.treasury, 1),
            "approval": round(approval, 1),
            "approval_delta": round(approval - prev_approval, 1),
            "phase": s.phase,
            "active_crises": len([e for e in s.active_events]),
            "loss_reason": s.loss_reason,
            "unread_cabinet": len(
                [m for m in s.current_inbox if m.tab == "cabinet" and not m.read]
            ),
            "unread_media": len(
                [m for m in s.current_inbox if m.tab == "media" and not m.read]
            ),
            "unread_public": len(
                [m for m in s.current_inbox if m.tab == "public" and not m.read]
            ),
            "unread_crises": len(
                [m for m in s.current_inbox if m.tab == "crises" and not m.read]
            ),
        }

    # ==================================================================
    # PRIVATE — Day tick sub-steps
    # ==================================================================

    def _complete_actions(self) -> list[ActiveAction]:
        """Complete actions whose timer has expired."""
        s = self.state
        completed = []
        for a in s.active_actions:
            if not a.completed and s.current_day >= a.started_on + a.days_to_complete:
                a.completed = True
                # Apply param delta
                if a.param_affected:
                    delta = {a.param_affected: a.completion_delta}
                    s.city_params = s.city_params.apply_delta(delta)
                    s.targeted_params.add(a.param_affected)
                completed.append(a)
        # Remove completed actions
        s.active_actions = [
            a for a in s.active_actions if not a.completed or a in completed
        ]
        return completed

    def _decay_params(self):
        """Decay untargeted params by DAILY_DECAY."""
        s = self.state
        all_params = set(PARAM_LABELS.keys())
        untargeted = all_params - s.targeted_params
        decay_deltas = {
            p: -DAILY_DECAY for p in untargeted if hasattr(s.city_params, p)
        }
        if decay_deltas:
            s.city_params = s.city_params.apply_delta(decay_deltas)
        s.targeted_params.clear()

    def _check_thresholds(self) -> list[ActiveProblem]:
        """Check params against complaint thresholds, create new problems."""
        s = self.state
        new_problems = []
        existing_params = {p.param for p in s.active_problems}

        for param, thresholds in COMPLAINT_THRESHOLDS.items():
            if param in existing_params:
                continue  # already tracking this problem
            value = getattr(s.city_params, param, 50)
            for t in thresholds:
                if value < t["below"]:
                    problem = ActiveProblem(
                        param=param,
                        area=self._random_area_for_param(param),
                        severity=t["severity"],
                        day_started=s.current_day,
                    )
                    s.active_problems.append(problem)
                    new_problems.append(problem)
                    break  # only the first matching threshold

        return new_problems

    def _escalate_problems(self):
        """Escalate unresolved problems based on time."""
        s = self.state
        severity_order = [
            "whisper",
            "growing",
            "media",
            "crisis",
            "cascade",
            "political",
        ]

        for p in s.active_problems:
            if p.mayor_responded:
                continue
            p.days_at_current_stage += 1
            threshold = ESCALATION_DAYS.get(p.severity, 999)
            if p.days_at_current_stage >= threshold:
                idx = severity_order.index(p.severity)
                if idx < len(severity_order) - 1:
                    old = p.severity
                    p.severity = severity_order[idx + 1]
                    p.days_at_current_stage = 0
                    p.escalation_history.append(
                        f"Day {s.current_day}: {old} → {p.severity}"
                    )

                    # Cascade: spawn related problem
                    if p.severity == "cascade" and p.param in PARAM_CASCADES:
                        cascade_param = PARAM_CASCADES[p.param]
                        if not any(
                            pp.param == cascade_param for pp in s.active_problems
                        ):
                            cascade_problem = ActiveProblem(
                                param=cascade_param,
                                area=p.area,
                                severity="growing",
                                day_started=s.current_day,
                            )
                            s.active_problems.append(cascade_problem)

    def _update_wellbeing_and_approval(self):
        """Deterministic wellbeing + approval recalc."""
        s = self.state
        # Use a zero-delta — wellbeing updates from current city params
        for c in s.citizens:
            c.wellbeing = update_citizen_wellbeing(c, {}, s.city_profile)

    def _process_budget(self):
        """Daily budget: tax revenue in, ongoing costs out."""
        s = self.state
        # Daily tax is monthly tax / 30
        daily_tax = (
            compute_tax_revenue(s.city_params, s.city_profile.budget.base_tax_revenue)
            / 30.0
        )
        s.treasury += daily_tax

        # Interest on debt
        if s.outstanding_debt > 0:
            daily_interest = (
                process_interest_payment(
                    s.outstanding_debt, s.city_profile.budget.interest_rate
                )
                / 30.0
            )
            s.treasury -= daily_interest

    def _check_broken_promises(self) -> list[Promise]:
        """Find promises past their deadline."""
        s = self.state
        broken = []
        for p in s.promises:
            if (
                not p.fulfilled
                and not p.broken_notified
                and s.current_day > p.deadline_day
            ):
                p.broken_notified = True
                broken.append(p)
        return broken

    def _process_events(self):
        """Run deterministic event checks."""
        s = self.state
        rng = self._rng
        s.active_events, event_deltas = step_events(s.active_events, rng)
        s.city_params = s.city_params.apply_delta(event_deltas)

        existing = {e.name for e in s.active_events}
        new_threshold = check_threshold_events(s.city_params, existing)
        new_stochastic = check_stochastic_events(
            s.city_params, len(s.active_events), rng
        )
        s.active_events.extend(new_threshold + new_stochastic)

    def _check_loss(self) -> str | None:
        """Check loss conditions."""
        s = self.state
        approval = compute_interim_approval(s.citizens, s.city_params.media_freedom)
        if approval < 20:
            return "Approval dropped below 20% — emergency recall!"
        if s.treasury <= 0:
            return "City is bankrupt — treasury at ₹0!"
        crisis_count = len(
            [
                p
                for p in s.active_problems
                if p.severity in ("crisis", "cascade", "political")
            ]
        )
        if crisis_count >= 3:
            return f"{crisis_count} simultaneous crises — city in chaos!"
        return None

    # ==================================================================
    # PRIVATE — Inbox generation (LLM calls happen here)
    # ==================================================================

    def _generate_inbox(
        self,
        completions: list[ActiveAction],
        new_problems: list[ActiveProblem],
        broken_promises: list[Promise],
    ) -> list[InboxMessage]:
        """Generate the day's inbox messages. Uses LLM for content."""
        s = self.state
        messages: list[InboxMessage] = []

        # 1. Completion reactions (citizens thanking the mayor)
        for action in completions:
            msg = self._generate_completion_message(action)
            if msg:
                messages.append(msg)

        # 2. New complaints from new problems
        for problem in new_problems:
            msgs = self._generate_complaint_messages(problem)
            messages.extend(msgs)

        # 3. Escalation messages from existing problems
        for problem in s.active_problems:
            if not problem.mayor_responded and problem.days_at_current_stage == 0:
                # Just escalated — generate new messages
                if problem.severity in ("growing", "media", "crisis"):
                    msgs = self._generate_escalation_messages(problem)
                    messages.extend(msgs)

        # 4. Broken promise follow-ups
        for promise in broken_promises:
            msg = self._generate_broken_promise_message(promise)
            if msg:
                messages.append(msg)

        # 5. Media headlines (1-2 per day)
        headlines = self._generate_daily_headlines()
        messages.extend(headlines)

        # 6. Opposition attack (probabilistic)
        opp = self._maybe_generate_opposition()
        if opp:
            messages.append(opp)

        # 7. Crisis tab updates
        for event in s.active_events:
            messages.append(
                InboxMessage(
                    day=s.current_day,
                    tab="crises",
                    sender_id=f"event_{event.id}",
                    sender_name="City Alert System",
                    sender_role="system",
                    text=f"⚠️ {event.name} — Severity: {event.severity}/5. "
                    f"{'Escalating!' if event.escalation_level > 0 else f'{event.turns_remaining} days remaining.'}",
                    topic=event.portfolio or "general",
                    requires_response=False,
                    urgency="critical" if event.severity >= 3 else "high",
                )
            )

        # 8. Generate secretary options for actionable messages
        self._add_secretary_options(messages)

        # Cap at 7 messages
        messages = messages[:7]

        return messages

    def _generate_completion_message(self, action: ActiveAction) -> InboxMessage | None:
        """Generate a thank-you message when an action completes."""
        s = self.state
        if action.triggered_by not in s.citizen_threads:
            return None

        thread = s.citizen_threads[action.triggered_by]
        original = next(
            (m.text for m in reversed(thread.messages) if m.sender == "citizen"),
            "earlier complaint",
        )

        text = generate_citizen_reaction(
            self.llm,
            citizen_name=thread.citizen_name,
            citizen_summary=thread.citizen_summary,
            original_complaint=original,
            mayor_response=action.mayor_quote,
            outcome="repair_completed",
            city_name=s.city_profile.city_name,
        )

        thread.messages.append(
            ThreadMessage(
                day=s.current_day,
                sender="citizen",
                text=text,
                topic=action.param_affected,
                tone="grateful",
            )
        )
        thread.relationship = min(100, thread.relationship + 15)

        return InboxMessage(
            day=s.current_day,
            tab="public",
            sender_id=action.triggered_by,
            sender_name=thread.citizen_name,
            sender_role="citizen",
            text=text,
            topic=action.param_affected,
            requires_response=False,
            urgency="low",
            thread_id=action.triggered_by,
        )

    def _generate_complaint_messages(
        self, problem: ActiveProblem
    ) -> list[InboxMessage]:
        """Generate citizen complaint messages for a new problem."""
        s = self.state
        param_label = PARAM_LABELS.get(problem.param, problem.param)
        param_value = getattr(s.city_params, problem.param, 50)
        count = self._msg_count_for_severity(problem.severity)
        messages = []

        complainants = self._pick_complainants(problem.param, problem.area, count)
        for citizen_id in complainants:
            thread = s.citizen_threads.get(citizen_id)
            if not thread:
                continue

            prev_msgs = [m.text for m in thread.messages if m.sender == "citizen"]
            text = generate_citizen_complaint(
                self.llm,
                citizen_name=thread.citizen_name,
                citizen_summary=thread.citizen_summary,
                param_label=param_label,
                param_value=param_value,
                severity=problem.severity,
                city_name=s.city_profile.city_name,
                previous_messages=prev_msgs if prev_msgs else None,
            )

            thread.messages.append(
                ThreadMessage(
                    day=s.current_day,
                    sender="citizen",
                    text=text,
                    topic=problem.param,
                    tone="complaint",
                )
            )
            thread.open_complaints.append(problem.param)
            problem.triggered_citizens.append(citizen_id)

            messages.append(
                InboxMessage(
                    day=s.current_day,
                    tab="public",
                    sender_id=citizen_id,
                    sender_name=thread.citizen_name,
                    sender_role="citizen",
                    text=text,
                    topic=problem.param,
                    requires_response=True,
                    thread_id=citizen_id,
                    problem_id=problem.id,
                    urgency="medium" if problem.severity == "whisper" else "high",
                )
            )

        return messages

    def _generate_escalation_messages(
        self, problem: ActiveProblem
    ) -> list[InboxMessage]:
        """Generate messages when a problem escalates."""
        s = self.state
        param_label = PARAM_LABELS.get(problem.param, problem.param)

        if problem.severity == "media":
            # Journalist asks for comment
            outlet = self._rng.choice(s.media_outlets) if s.media_outlets else None
            if outlet:
                text = f"We're reporting on the {param_label} situation in {problem.area}. Multiple citizens affected. Mayor's office, any comment?"
                return [
                    InboxMessage(
                        day=s.current_day,
                        tab="media",
                        sender_id=f"media_{outlet.name}",
                        sender_name=outlet.name,
                        sender_role="journalist",
                        text=text,
                        topic=problem.param,
                        requires_response=True,
                        problem_id=problem.id,
                        urgency="high",
                    )
                ]

        # For growing or crisis: more citizen complaints
        return self._generate_complaint_messages(problem)

    def _generate_broken_promise_message(self, promise: Promise) -> InboxMessage | None:
        """Generate angry follow-up for a broken promise."""
        s = self.state
        if promise.citizen_id not in s.citizen_threads:
            return None

        thread = s.citizen_threads[promise.citizen_id]
        text = generate_citizen_complaint(
            self.llm,
            citizen_name=thread.citizen_name,
            citizen_summary=thread.citizen_summary,
            param_label=f"broken promise about {promise.topic}",
            param_value=0,
            severity="growing",
            city_name=s.city_profile.city_name,
            previous_messages=[f"You promised: '{promise.mayor_said}'"],
        )

        thread.messages.append(
            ThreadMessage(
                day=s.current_day,
                sender="citizen",
                text=text,
                topic=promise.topic,
                tone="angry",
            )
        )
        thread.relationship = max(-100, thread.relationship - 20)

        return InboxMessage(
            day=s.current_day,
            tab="public",
            sender_id=promise.citizen_id,
            sender_name=thread.citizen_name,
            sender_role="citizen",
            text=text,
            topic=promise.topic,
            requires_response=True,
            urgency="high",
            thread_id=promise.citizen_id,
        )

    def _generate_daily_headlines(self) -> list[InboxMessage]:
        """Generate 1-2 media headlines per day."""
        s = self.state
        if not s.media_outlets:
            return []

        messages = []
        # Pick 1-2 outlets
        outlets = self._rng.sample(s.media_outlets, min(2, len(s.media_outlets)))

        for outlet in outlets:
            # Find something to write about
            topic, context = self._headline_topic()
            if not topic:
                continue

            headline = generate_media_headline(
                self.llm,
                outlet_name=outlet.name,
                outlet_lean=outlet.lean,
                topic=topic,
                context=context,
                city_name=s.city_profile.city_name,
            )

            messages.append(
                InboxMessage(
                    day=s.current_day,
                    tab="media",
                    sender_id=f"media_{outlet.name}",
                    sender_name=outlet.name,
                    sender_role="journalist",
                    text=f"📰 {headline}",
                    topic=topic,
                    requires_response=False,
                    urgency="low",
                )
            )

        return messages

    def _maybe_generate_opposition(self) -> InboxMessage | None:
        """Probabilistically generate an opposition attack."""
        s = self.state
        approval = compute_interim_approval(s.citizens, s.city_params.media_freedom)

        # Attack probability
        prob = 0.2  # base 20% per day
        if approval < 40:
            prob += 0.2
        if s.active_events:
            prob += 0.15
        if s.current_day > 20:
            prob += 0.1
        if any(
            p.severity in ("crisis", "cascade", "political") for p in s.active_problems
        ):
            prob += 0.15

        if self._rng.random() >= prob:
            return None

        # Find weakest param
        params = s.city_params.as_dict()
        worst_param = min(params, key=lambda k: params[k])
        worst_value = params[worst_param]
        worst_label = PARAM_LABELS.get(worst_param, worst_param)

        # Generate attack
        text = generate_opposition_attack(
            self.llm,
            opposition_name="Opposition Leader",
            opposition_personality="aggressive populist",
            weakness_param=worst_label,
            weakness_value=worst_value,
            context=f"Day {s.current_day} of Mayor's term",
            city_name=s.city_profile.city_name,
        )

        return InboxMessage(
            day=s.current_day,
            tab="media",
            sender_id="opposition",
            sender_name="Opposition Leader",
            sender_role="opposition",
            text=f"🎤 {text}",
            topic=worst_param,
            requires_response=True,
            urgency="medium",
        )

    def _add_secretary_options(self, messages: list[InboxMessage]):
        """Generate secretary draft options for actionable messages."""
        s = self.state
        actionable = [m for m in messages if m.requires_response][:4]  # Max 4

        # Generate options in parallel
        with ThreadPoolExecutor(max_workers=4) as pool:
            futures = {}
            for msg in actionable:
                sender_summary = ""
                if msg.sender_id in s.citizen_threads:
                    sender_summary = s.citizen_threads[msg.sender_id].citizen_summary
                param_value = getattr(s.city_params, msg.topic, 50) if msg.topic else 50

                futures[
                    pool.submit(
                        generate_secretary_options,
                        self.llm,
                        msg.sender_name,
                        sender_summary,
                        msg.text,
                        msg.topic or "general",
                        param_value,
                        s.treasury,
                        s.city_profile.city_name,
                        len(s.active_events),
                    )
                ] = msg

            for future in as_completed(futures):
                msg = futures[future]
                try:
                    msg.secretary_options = future.result()
                except Exception as e:
                    log.warning(f"Secretary options failed: {e}")

    # ==================================================================
    # PRIVATE — Helpers
    # ==================================================================

    def _assign_expression_types(self, citizens: list[Citizen]) -> dict[str, str]:
        """Assign expression type based on citizen personality."""
        types: dict[str, str] = {}
        rng = self._rng
        buckets = list(EXPRESSION_DISTRIBUTION.keys())
        weights = list(EXPRESSION_DISTRIBUTION.values())

        for c in citizens:
            # Personality modifiers
            personal_weights = list(weights)
            # High empathy + low authority_respect → more vocal
            if c.personality.empathy > 60 and c.personality.authority_respect < 50:
                personal_weights[0] *= 2  # vocal
            # High authority_respect → more silent
            if c.personality.authority_respect > 70:
                personal_weights[3] *= 2  # silent
            # High ambition → more amplifier
            if c.personality.ambition > 70:
                personal_weights[1] *= 1.5  # amplifier

            total = sum(personal_weights)
            personal_weights = [w / total for w in personal_weights]
            types[c.id] = rng.choices(buckets, weights=personal_weights, k=1)[0]

        return types

    def _citizen_summary(self, c: Citizen) -> str:
        """Create a brief profile string for LLM context."""
        return (
            f"{c.demographics.age_group}, {c.demographics.profession}, "
            f"{c.demographics.income_bracket} income, {c.demographics.location}, "
            f"{c.demographics.religion}"
        )

    def _pick_complainants(self, param: str, area: str, count: int) -> list[str]:
        """Pick citizens to complain, weighted by expression type and relevance."""
        s = self.state
        candidates = []
        for cid, thread in s.citizen_threads.items():
            if thread.expression_type == "silent":
                continue
            if thread.citizen_area == area or self._rng.random() < 0.3:
                weight = EXPRESSION_WEIGHTS.get(thread.expression_type, 1.0)
                if cid in [p.citizen_id for p in s.promises if not p.fulfilled]:
                    weight *= 2  # broken promise amplifies voice
                if thread.last_contact_day == s.current_day:
                    weight *= 0.1  # don't double-message same day
                candidates.append((cid, weight))

        if not candidates:
            return []

        # Weighted random selection
        ids, weights = zip(*candidates)
        chosen = set()
        for _ in range(min(count, len(candidates))):
            remaining = [(i, w) for i, w in zip(ids, weights) if i not in chosen]
            if not remaining:
                break
            rem_ids, rem_weights = zip(*remaining)
            pick = self._rng.choices(list(rem_ids), weights=list(rem_weights), k=1)[0]
            chosen.add(pick)

        return list(chosen)

    def _msg_count_for_severity(self, severity: str) -> int:
        """How many complaint messages for a severity level."""
        return {"whisper": 1, "growing": 2, "media": 1, "crisis": 3}.get(severity, 1)

    def _random_area_for_param(self, param: str) -> str:
        """Pick a random area from the city profile."""
        s = self.state
        areas = [loc.name for loc in s.city_profile.demographics.location_distribution]
        return self._rng.choice(areas) if areas else "Central"

    def _get_sender_area(self, sender_id: str) -> str:
        """Get the area of a citizen."""
        s = self.state
        if sender_id in s.citizen_threads:
            return s.citizen_threads[sender_id].citizen_area
        return "City Center"

    def _portfolio_params(self, portfolio: str) -> list[str]:
        """Map minister portfolio to relevant city params."""
        mapping = {
            "Infrastructure": [
                "water_power_sanitation",
                "transit_and_roads",
                "affordable_housing",
            ],
            "Health": ["hospitals_and_clinics", "environment_and_green"],
            "Finance": ["jobs_and_commerce", "admin_efficiency"],
            "Education": ["schools_and_universities"],
            "Law & Order": [
                "police_and_emergency",
                "courts_and_justice",
                "anti_corruption",
            ],
        }
        return mapping.get(portfolio, list(PARAM_LABELS.keys())[:3])

    def _headline_topic(self) -> tuple[str, str]:
        """Pick a topic for a headline based on current state."""
        s = self.state

        # Priority: active problems > events > random param
        if s.active_problems:
            p = self._rng.choice(s.active_problems)
            label = PARAM_LABELS.get(p.param, p.param)
            value = getattr(s.city_params, p.param, 50)
            return (
                label,
                f"{label} in {p.area} at {value:.0f}/100. Severity: {p.severity}.",
            )

        if s.active_events:
            e = self._rng.choice(s.active_events)
            return (
                e.name,
                f"Crisis: {e.name}, severity {e.severity}, {e.turns_remaining} days left.",
            )

        # Random param that's doing poorly
        params = s.city_params.as_dict()
        low_params = {k: v for k, v in params.items() if v < 45}
        if low_params:
            param = self._rng.choice(list(low_params.keys()))
            label = PARAM_LABELS.get(param, param)
            return label, f"{label} at {low_params[param]:.0f}/100."

        return "", ""

    def _run_survey(self) -> SurveyResult:
        """Run a citizen survey and return results."""
        s = self.state

        # Approval by area
        areas: dict[str, list[float]] = {}
        for c in s.citizens:
            area = c.demographics.location
            areas.setdefault(area, []).append(c.mayor_alignment)
        approval_by_area = {
            area: round(sum(scores) / len(scores), 1) for area, scores in areas.items()
        }

        # Top concerns: params with lowest values
        params = s.city_params.as_dict()
        sorted_params = sorted(params.items(), key=lambda x: x[1])
        top_concerns = [
            (PARAM_LABELS.get(k, k), round(100 - v, 1)) for k, v in sorted_params[:3]
        ]

        # Overall trend
        if len(s.approval_history) >= 3:
            recent = s.approval_history[-3:]
            if recent[-1] > recent[0] + 2:
                trend = "improving"
            elif recent[-1] < recent[0] - 2:
                trend = "declining"
            else:
                trend = "stable"
        else:
            trend = "stable"

        # LLM summary
        silent_mood = generate_survey_summary(
            self.llm, approval_by_area, top_concerns, s.city_profile.city_name
        )

        return SurveyResult(
            day_requested=s.current_day - 1,
            day_delivered=s.current_day,
            approval_by_area=approval_by_area,
            top_concerns=top_concerns,
            silent_voter_mood=silent_mood,
            overall_trend=trend,
        )

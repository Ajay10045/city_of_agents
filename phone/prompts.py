"""LLM prompt functions for The Mayor's Phone game.

Each function makes ONE LLM call and returns structured output.
Designed for 2-3 second response time per call.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from llm.llm_client import LLMClient
from phone.models import SecretaryOption

log = logging.getLogger("phone.prompts")


# ---------------------------------------------------------------------------
# Citizen complaint — "No water for 2 days..."
# ---------------------------------------------------------------------------


def generate_citizen_complaint(
    llm: LLMClient,
    citizen_name: str,
    citizen_summary: str,
    param_label: str,
    param_value: float,
    severity: str,
    city_name: str,
    previous_messages: list[str] | None = None,
) -> str:
    """Generate a contextual citizen complaint message (1-2 lines)."""
    history = ""
    if previous_messages:
        history = f"\nPrevious messages from this citizen:\n" + "\n".join(
            f"  - {m}" for m in previous_messages[-3:]
        )

    prompt = f"""You are {citizen_name}, a citizen of {city_name}.
Your profile: {citizen_summary}

Current situation: {param_label} in your area has been declining.
Current score: {param_value}/100. Severity: {severity}.
{history}

{"This is your FIRST message to the Mayor about this issue." if not previous_messages else "You already complained before and nothing was done. You're MORE frustrated now."}

Write a SHORT message to the Mayor (1-2 sentences MAX).
- Be specific about how this affects YOUR daily life
- Stay in character (your age, occupation, personality)
- If follow-up: reference your earlier complaint
- {"Be polite but concerned" if severity == "whisper" else "Be frustrated and direct" if severity == "growing" else "Be angry and desperate"}
- Write naturally, like a real person texting. Not formal.
- Use some Hindi words if appropriate for the character.

Reply with ONLY the message text, nothing else."""

    return llm.generate(prompt, temperature=0.8, max_tokens=150).strip()


# ---------------------------------------------------------------------------
# Citizen reaction — thank you / acknowledgment
# ---------------------------------------------------------------------------


def generate_citizen_reaction(
    llm: LLMClient,
    citizen_name: str,
    citizen_summary: str,
    original_complaint: str,
    mayor_response: str,
    outcome: str,  # "repair_completed", "action_started", "promise_made"
    city_name: str,
) -> str:
    """Generate citizen's reaction to mayor's action."""
    prompt = f"""You are {citizen_name}, a citizen of {city_name}.
Your profile: {citizen_summary}

You complained to the Mayor: "{original_complaint}"
The Mayor responded: "{mayor_response}"

What happened: {outcome}

Write your reaction (1-2 sentences MAX).
- Stay in character
- {"You're relieved and grateful, but keep it real" if "completed" in outcome else "You're cautiously hopeful" if "started" in outcome else "You appreciate the response but want action"}
- Write naturally, like a text message
- Use some Hindi words if appropriate

Reply with ONLY the message text, nothing else."""

    return llm.generate(prompt, temperature=0.8, max_tokens=120).strip()


# ---------------------------------------------------------------------------
# Secretary draft options — 3 response choices
# ---------------------------------------------------------------------------


def generate_secretary_options(
    llm: LLMClient,
    sender_name: str,
    sender_summary: str,
    message_text: str,
    topic: str,
    param_value: float,
    treasury: float,
    city_name: str,
    active_crises_count: int,
) -> list[SecretaryOption]:
    """Generate 3 secretary-drafted response options."""
    prompt = f"""You are the Mayor's secretary in {city_name}. Draft 3 response options.

Incoming message from {sender_name} ({sender_summary}):
"{message_text}"

Topic: {topic} (current score: {param_value}/100)
Treasury: ₹{treasury:.0f} Cr
Active crises: {active_crises_count}

Generate exactly 3 options with DIFFERENT strategies:

Option A — SAFE/DIPLOMATIC: Acknowledge the problem, commit to investigation or small action. Low cost.
Option B — BOLD/DIRECT ACTION: Commit real resources to fix the problem. Higher cost but decisive.
Option C — DEFLECT/INVESTIGATE: Buy time, promise to look into it, or redirect to a minister. Free or very cheap.

Return a JSON array with exactly 3 objects, each having:
- "label": "A. [short title]" or "B." or "C."
- "text": "the full response message (1-2 sentences, natural, mayor's voice)"
- "cost": number in Crores (0 for free options)
- "tone": "diplomatic" or "bold" or "deflective"
- "action_hint": what the engine should track (e.g. "repair_water_east", "investigate", "promise_review")

Reply with ONLY the JSON array, no other text."""

    raw = llm.generate(prompt, temperature=0.7, max_tokens=500)
    try:
        # Strip markdown fences if present
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
        options_data = json.loads(cleaned)
        return [SecretaryOption(**opt) for opt in options_data[:3]]
    except (json.JSONDecodeError, Exception) as e:
        log.warning(f"Secretary options parse error: {e}, raw={raw[:200]}")
        # Fallback options
        return [
            SecretaryOption(
                label="A. Acknowledge",
                text="I hear your concern and will look into this personally.",
                cost=0,
                tone="diplomatic",
                action_hint="investigate",
            ),
            SecretaryOption(
                label="B. Take action",
                text=f"I'm allocating ₹50 Cr immediately for this issue.",
                cost=50,
                tone="bold",
                action_hint=f"repair_{topic}",
            ),
            SecretaryOption(
                label="C. Redirect",
                text="Let me check with the relevant minister and get back to you.",
                cost=0,
                tone="deflective",
                action_hint="defer",
            ),
        ]


# ---------------------------------------------------------------------------
# Media headline — newspaper-style
# ---------------------------------------------------------------------------


def generate_media_headline(
    llm: LLMClient,
    outlet_name: str,
    outlet_lean: str,
    topic: str,
    context: str,
    city_name: str,
) -> str:
    """Generate a single media headline."""
    bias_note = {
        "mayor": "You are sympathetic to the Mayor's administration.",
        "opposition": "You are critical of the Mayor's administration.",
        "neutral": "You report facts objectively.",
    }.get(outlet_lean, "")

    prompt = f"""You are a headline writer for {outlet_name} in {city_name}.
{bias_note}

Context: {context}
Topic: {topic}

Write ONE newspaper headline (max 15 words). Punchy, dramatic, newspaper style.
Reply with ONLY the headline text."""

    return llm.generate(prompt, temperature=0.9, max_tokens=60).strip().strip('"')


# ---------------------------------------------------------------------------
# Response parser — extract intent from mayor's free-text reply
# ---------------------------------------------------------------------------


def parse_mayor_response(
    llm: LLMClient,
    mayor_text: str,
    original_message: str,
    topic: str,
    treasury: float,
) -> dict[str, Any]:
    """Parse the mayor's free-text response into structured action."""
    prompt = f"""The Mayor of a city responded to a citizen message.

Original complaint (topic: {topic}): "{original_message}"
Mayor's response: "{mayor_text}"
Current treasury: ₹{treasury:.0f} Cr

Extract the mayor's intent as JSON:
{{
  "action_type": "repair" | "build" | "investigate" | "allocate" | "promise" | "deflect" | "refuse" | "empathize",
  "cost_estimate": number (₹ Cr, 0 if no money committed),
  "days_to_complete": number (estimated days, 0 if no action),
  "is_promise": true/false (did the mayor commit to something specific?),
  "promise_text": "what exactly was promised" (empty string if no promise),
  "deadline_hint": number (days until expected completion, 0 if none),
  "param_affected": "{topic}",
  "completion_delta": number (estimated param improvement, 1-5 scale)
}}

Reply with ONLY the JSON object."""

    raw = llm.generate(prompt, temperature=0.3, max_tokens=200)
    try:
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
        return json.loads(cleaned)
    except (json.JSONDecodeError, Exception) as e:
        log.warning(f"Response parse error: {e}")
        return {
            "action_type": "empathize",
            "cost_estimate": 0,
            "days_to_complete": 0,
            "is_promise": False,
            "promise_text": "",
            "deadline_hint": 0,
            "param_affected": topic,
            "completion_delta": 0,
        }


# ---------------------------------------------------------------------------
# Opposition attack
# ---------------------------------------------------------------------------


def generate_opposition_attack(
    llm: LLMClient,
    opposition_name: str,
    opposition_personality: str,
    weakness_param: str,
    weakness_value: float,
    context: str,
    city_name: str,
) -> str:
    """Generate an opposition leader's public attack."""
    prompt = f"""You are {opposition_name}, opposition leader in {city_name}.
Personality: {opposition_personality}

The Mayor's weakness right now:
- {weakness_param} is at {weakness_value}/100 (very poor)
- Context: {context}

Write a SHORT, punchy public statement attacking the Mayor (2-3 sentences MAX).
- Be political, not abusive
- Reference specific failures
- Appeal to public emotion
- Write naturally, like a political speech or tweet

Reply with ONLY the statement text."""

    return llm.generate(prompt, temperature=0.8, max_tokens=150).strip()


# ---------------------------------------------------------------------------
# Survey analysis
# ---------------------------------------------------------------------------


def generate_survey_summary(
    llm: LLMClient,
    approval_by_area: dict[str, float],
    top_concerns: list[tuple[str, float]],
    city_name: str,
) -> str:
    """Generate a human-readable survey summary for silent voter mood."""
    areas_str = ", ".join(f"{a}: {v:.0f}%" for a, v in approval_by_area.items())
    concerns_str = ", ".join(f"{c} ({p:.0f}% unhappy)" for c, p in top_concerns[:3])

    prompt = f"""You are a political analyst in {city_name}.
A citizen survey shows:

Approval by area: {areas_str}
Top concerns: {concerns_str}

Write a 1-2 sentence summary of the SILENT MAJORITY's mood.
Focus on what people are worried about that they're NOT complaining about publicly.

Reply with ONLY the summary."""

    return llm.generate(prompt, temperature=0.6, max_tokens=100).strip()


# ---------------------------------------------------------------------------
# Minister response to proactive question
# ---------------------------------------------------------------------------


def generate_minister_response(
    llm: LLMClient,
    minister_name: str,
    minister_portfolio: str,
    competence: float,
    loyalty: float,
    mayor_question: str,
    relevant_params: dict[str, float],
    city_name: str,
) -> str:
    """Generate a minister's response to the mayor's question."""
    loyalty_note = (
        "You are very loyal and supportive."
        if loyalty > 70
        else "You are somewhat loyal but may have your own agenda."
        if loyalty > 40
        else "You are disloyal and may be misleading the mayor."
    )
    competence_note = (
        "You are highly competent and give accurate information."
        if competence > 70
        else "You are moderately competent, your information is roughly accurate."
        if competence > 40
        else "You are not very competent, some of your information may be wrong."
    )

    params_str = ", ".join(f"{k}: {v:.0f}/100" for k, v in relevant_params.items())

    prompt = f"""You are {minister_name}, the {minister_portfolio} minister of {city_name}.
{loyalty_note}
{competence_note}

The Mayor asks you: "{mayor_question}"

Relevant city metrics: {params_str}

Respond naturally (2-4 sentences):
- Give useful information from your portfolio's perspective
- {"Be honest and direct" if loyalty > 60 else "Be somewhat evasive, protect your interests"}
- {"Give accurate numbers" if competence > 60 else "Approximate, you're not sure of exact figures"}
- Suggest an action if appropriate
- Write like a person texting their boss, not a formal report

Reply with ONLY the response text."""

    return llm.generate(prompt, temperature=0.7, max_tokens=200).strip()

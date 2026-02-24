"""LLM call orchestration — all prompt construction and response parsing.

Each function builds a prompt, calls the LLM client, and returns parsed data.
Side-effect free: no game-state mutation here.
"""
from __future__ import annotations

import json
import re
import textwrap
from typing import Any

from engine.models import (
    ActiveEvent,
    CitizenVoice,
    CityParameters,
    CityProfile,
    GameState,
    MediaHeadline,
    MediaOutletState,
    Minister,
    Policy,
)
from llm.llm_client import LLMClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _extract_json(text: str) -> Any:
    """Extract first JSON object or array from LLM response."""
    # Try direct parse first
    stripped = text.strip()
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        pass
    # Look for ```json ... ``` block
    match = re.search(r"```(?:json)?\s*([\s\S]+?)```", stripped)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError:
            pass
    # Find first { or [ and try from there
    for start_char, end_char in [('{', '}'), ('[', ']')]:
        idx = stripped.find(start_char)
        if idx != -1:
            # Find matching close by scanning from end
            last = stripped.rfind(end_char)
            if last > idx:
                try:
                    return json.loads(stripped[idx:last+1])
                except json.JSONDecodeError:
                    pass
    raise ValueError(f"Could not extract JSON from LLM response:\n{text[:500]}")


def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


# ---------------------------------------------------------------------------
# City profile generation
# ---------------------------------------------------------------------------

CITY_PROFILE_SYSTEM = textwrap.dedent("""\
    You are a civic data expert who creates detailed, realistic city profiles for
    a governance simulation game called "City of Agents". You have access to
    knowledge about real cities around the world and understand socio-economic,
    demographic, and cultural dynamics.

    Always respond with valid JSON that matches the exact schema provided.
""")

CITY_PROFILE_SCHEMA = textwrap.dedent("""\
    {
      "city_name": "string",
      "region": "string — country or sub-region",
      "population_description": "string — 1-2 sentences about population size and character",
      "languages": ["string"],
      "dominant_religions": [{"name": "string", "percent": float}],
      "cultural_notes": "string — key cultural traits affecting governance",
      "geographic_character": "string — coastal/highland/delta/landlocked etc.",
      "historical_context": "string — 2-3 sentences on relevant history",
      "city_parameters": {
        "jobs_and_commerce": float,         // 20-80
        "transit_and_roads": float,
        "water_power_sanitation": float,
        "hospitals_and_clinics": float,
        "schools_and_universities": float,
        "affordable_housing": float,
        "community_and_spaces": float,
        "police_and_emergency": float,
        "courts_and_legal": float,
        "air_quality_and_pollution": float,
        "admin_efficiency": float,
        "anti_corruption": float,
        "media_freedom": float
      },
      "demographics": {
        "income_distribution": {"type": "beta", "mean": float, "spread": float, "skew": "left|right|symmetric"},
        "age_distribution": {"brackets": [{"label": "string", "percent": float}]},
        "religion_distribution": [{"name": "string", "percent": float}],
        "profession_distribution": [{"name": "string", "percent": float}],
        "education_distribution": {"mean": float, "spread": float},
        "location_distribution": [{"name": "string", "percent": float}],
        "ideology_economic_distribution": {"extreme_left": float, "left": float, "center": float, "right": float, "extreme_right": float},
        "ideology_social_distribution": {"liberal": float, "conservative": float}
      },
      "personality_climate": {
        "integrity_mean": float,
        "competence_mean": float,
        "conscientiousness_mean": float,
        "ambition_mean": float,
        "empathy_mean": float,
        "risk_appetite_mean": float,
        "authority_respect_mean": float,
        "corruption_tolerance_mean": float
      },
      "media_outlets": [
        {"name": "string", "lean": "mayor|opposition|neutral", "bias_intensity": float, "sensationalism": float, "trust_rating": float, "reach": float}
      ],
      "communal_config": {
        "tension_baseline": float,
        "dominant_fault_line": "string — e.g. 'ethnic', 'religious', 'class'",
        "festival_calendar": []
      },
      "budget": {
        "starting_treasury": float,
        "base_tax_revenue": float,
        "max_policy_budget": float,
        "max_minor_budget": float,
        "max_debt": float,
        "interest_rate": float
      },
      "game_config": {
        "total_turns": 20,
        "election_turn": 12,
        "agent_count": 50,
        "minister_count": 5,
        "legacy_equilibrium_multiplier": 2.0
      }
    }
""")


def generate_city_profile(llm: LLMClient, city_hint: str) -> dict[str, Any]:
    """Generate a full city profile JSON for the given city hint.

    city_hint: e.g. "Lagos, Nigeria" or "a mid-sized hill city in India"
    """
    user_prompt = textwrap.dedent(f"""\
        Generate a realistic City of Agents city profile for: **{city_hint}**

        Rules:
        - All city_parameters must be between 20 and 80 (realistic, not perfect)
        - income_distribution mean should be 0.0-1.0 (percentile space)
        - ideology_economic and ideology_social percentages must each sum to 100
        - profession_distribution percentages must sum to 100
        - religion_distribution percentages must sum to ~100
        - age_distribution brackets must sum to 100
        - location_distribution percentages must sum to 100
        - media_outlets: 3-5 outlets, at least one neutral and one opposition-leaning
        - budget.starting_treasury: 800-2500 Cr depending on city wealth
        - budget.base_tax_revenue: 80-300 Cr/turn
        - budget.interest_rate: 0.02-0.08
        - personality_climate values: 30-75 (mean trait levels in 0-100 scale)

        Return ONLY valid JSON matching this schema exactly:
        {CITY_PROFILE_SCHEMA}
    """)
    # chat() returns a dict; use it directly since we want JSON output
    return llm.chat(CITY_PROFILE_SYSTEM, user_prompt)


# ---------------------------------------------------------------------------
# Citizen name generation
# ---------------------------------------------------------------------------

def generate_citizen_names(llm: LLMClient, profile: CityProfile, count: int) -> list[str]:
    """Generate culturally appropriate full names for citizens."""
    system = "You are a cultural naming expert. Return only valid JSON arrays of strings."
    user = textwrap.dedent(f"""\
        Generate {count} realistic full names for citizens of {profile.city_name} ({profile.region}).
        Languages spoken: {', '.join(profile.languages)}.
        Make names culturally diverse, reflecting the city's demographics
        (religions: {', '.join(r.name for r in profile.dominant_religions)}).

        Return a JSON array of {count} name strings only — no titles, no descriptions.
        Example format: ["Amara Osei", "Fatima Al-Rashid", "Raj Sharma"]
    """)
    raw = llm.chat_text(system, user)
    try:
        data = _extract_json(raw)
    except ValueError:
        data = []
    if not isinstance(data, list):
        data = []
    # Fallback: pad with generic names if short
    while len(data) < count:
        data.append(f"Citizen {len(data)+1}")
    return data[:count]


# ---------------------------------------------------------------------------
# Minister consultation (multi-turn)
# ---------------------------------------------------------------------------

MINISTER_SYSTEM_TEMPLATE = textwrap.dedent("""\
    You are {name}, the {portfolio} minister of {city_name}.

    Your background:
    - Integrity: {integrity:.0f}/100  |  Competence: {competence:.0f}/100
    - Managerial Skill: {managerial:.0f}/100  |  Loyalty to Mayor: {loyalty:.0f}/100
    - Ideology: {ideology_economic} / {ideology_social}
    - Scandal exposure: {scandal:.0f}/100
    - Portfolio: {portfolio}

    Current city snapshot (your sector context):
    {params_summary}

    Your personality: {personality_summary}

    You give frank, in-character advice. You may push back on the mayor, advocate for
    your ministry, flag risks, or point out political fallout. Keep responses concise
    (2-4 sentences). Speak in first person as the minister.
""")


def _build_minister_system(minister: Minister, city_name: str, params: CityParameters) -> str:
    c = minister.citizen
    p = c.personality
    cap = c.capability
    personality_summary = (
        f"{'High integrity' if p.integrity > 65 else 'Low integrity'}, "
        f"{'empathetic' if p.empathy > 60 else 'pragmatic'}, "
        f"{'risk-taking' if p.risk_appetite > 60 else 'cautious'}, "
        f"ambition {p.ambition:.0f}/100"
    )
    params_dict = params.as_dict()
    # Show 3-4 most relevant params for this minister's portfolio
    params_summary = "\n".join(
        f"  {k.replace('_', ' ').title()}: {v:.1f}" for k, v in list(params_dict.items())[:6]
    )
    return MINISTER_SYSTEM_TEMPLATE.format(
        name=c.name,
        portfolio=minister.portfolio,
        city_name=city_name,
        integrity=p.integrity,
        competence=cap.competence,
        managerial=cap.managerial_skill,
        loyalty=minister.state.loyalty,
        ideology_economic=c.demographics.ideology_economic,
        ideology_social=c.demographics.ideology_social,
        scandal=minister.state.scandal_exposure,
        params_summary=params_summary,
        personality_summary=personality_summary,
    )


def minister_response(
    llm: LLMClient,
    minister: Minister,
    city_name: str,
    params: CityParameters,
    conversation_history: list[dict[str, str]],
    mayor_message: str,
) -> str:
    """Get minister's response to the latest mayor message.

    conversation_history: list of {"role": "user"|"assistant", "content": str}
    Returns the minister's response string.
    """
    system = _build_minister_system(minister, city_name, params)
    messages = [{"role": "system", "content": system}]
    messages.extend(conversation_history)
    messages.append({"role": "user", "content": mayor_message})
    return llm.chat_messages(messages)


# ---------------------------------------------------------------------------
# Policy option generation
# ---------------------------------------------------------------------------

POLICY_DRAFT_SYSTEM = textwrap.dedent("""\
    You are a senior policy advisor for a city governance simulation game.
    You generate realistic, balanced policy options based on the current city
    situation and minister consultation. Policies must have trade-offs and
    uncertainty — no silver bullets.

    Always return valid JSON.
""")

PORTFOLIOS = [
    "Infrastructure",
    "Health & Education",
    "Finance & Economy",
    "Home Affairs",
    "Housing & Community",
    "Environment",
    "Governance Reform",
]


def generate_policy_options(
    llm: LLMClient,
    state: GameState,
    consultation_transcript: str,
    available_budget: float,
) -> list[dict[str, Any]]:
    """Generate 3 policy options for the current turn, informed by consultation transcript.

    Returns list of 3 policy dicts matching Policy schema.
    """
    params = state.city_params.as_dict()
    params_str = "\n".join(f"  {k.replace('_', ' ').title()}: {v:.1f}" for k, v in params.items())

    active_events_str = ""
    if state.active_events:
        active_events_str = "Active events:\n" + "\n".join(
            f"  - {e.name} ({e.type}, {e.turns_remaining} turns left)" for e in state.active_events
        )

    ministers_str = "\n".join(
        f"  - {m.citizen.name} ({m.portfolio}): loyalty={m.state.loyalty:.0f}, "
        f"competence={m.citizen.capability.competence:.0f}"
        for m in state.ministers
    )

    prompt = textwrap.dedent(f"""\
        City: {state.city_profile.city_name} | Turn: {state.current_turn}/{state.city_profile.game_config.total_turns}
        Treasury: {state.treasury:.0f} Cr | Debt: {state.outstanding_debt:.0f} Cr
        Available policy budget: {available_budget:.0f} Cr

        Current city parameters:
        {params_str}

        Cabinet:
        {ministers_str}

        {active_events_str}

        --- Minister consultation transcript ---
        {consultation_transcript or "(No consultation this turn)"}
        --- End transcript ---

        Generate exactly 3 distinct policy options for this turn.
        Each policy must:
        1. Respond to the situation and consultation insights
        2. Have a primary target parameter (biggest positive effect) and 1-2 side effects (positive or negative)
        3. Have realistic budget cost (within available budget)
        4. Have a time_profile (effects spread over turns, e.g. 60% turn_0, 40% turn_1)
        5. Have clear trade-offs and a reason why it's relevant now

        Return ONLY a JSON array of 3 policy objects with this schema:
        [
          {{
            "name": "string — short policy name",
            "description": "string — 2-3 sentences describing the policy",
            "portfolio": "one of: {', '.join(PORTFOLIOS)}",
            "budget_cost": float,
            "target_effects": {{"param_key": delta_float}},  // max ±10 per param
            "side_effects": {{"param_key": delta_float}},    // max ±5 per param, can be negative
            "time_profile": {{"turn_0": float, "turn_1": float}},  // must sum to 1.0
            "targets": [
              {{
                "key": "param_key",
                "label": "Human-readable label",
                "unit": "points",
                "proposed": delta_float,
                "difficulty": float  // 0.0-1.0
              }}
            ],
            "tradeoffs": "string — honest description of costs and risks",
            "why_now": "string — why this is relevant this specific turn"
          }}
        ]

        Valid param keys: {', '.join(params.keys())}
    """)

    raw = llm.chat_text(POLICY_DRAFT_SYSTEM, prompt)
    try:
        options = _extract_json(raw)
    except ValueError:
        options = []
    if not isinstance(options, list):
        options = [options] if isinstance(options, dict) else []
    return options[:3]


# ---------------------------------------------------------------------------
# Delivery narrative generation
# ---------------------------------------------------------------------------

DELIVERY_NARRATIVE_SYSTEM = textwrap.dedent("""\
    You are a storytelling narrator for a city governance simulation. You write
    vivid, specific 2-3 sentence delivery reports describing how a policy played
    out on the ground. Be concrete — mention specific locations, people, or scenes.
    Match tone to outcome: triumphant if high execution, sobering if low.
""")


def generate_delivery_narrative(
    llm: LLMClient,
    policy: Policy,
    execution_score: float,
    actual_deltas: dict[str, float],
    city_name: str,
    turn: int,
) -> str:
    """Generate a narrative description of how the policy was implemented."""
    outcomes = []
    for k, v in actual_deltas.items():
        if abs(v) > 0.1:
            direction = "improved" if v > 0 else "worsened"
            outcomes.append(f"{k.replace('_', ' ')} {direction} by {abs(v):.1f} points")

    outcomes_str = "; ".join(outcomes) if outcomes else "minimal measurable change"

    prompt = textwrap.dedent(f"""\
        City: {city_name} | Turn {turn}
        Policy: {policy.name}
        Description: {policy.description}
        Execution score: {execution_score:.0%}
        Actual outcomes: {outcomes_str}

        Write a 2-3 sentence narrative of how this policy played out on the ground.
        Be specific and vivid. Match the tone to the execution score.
        Return only the narrative text, no JSON, no labels.
    """)
    return llm.chat_text(DELIVERY_NARRATIVE_SYSTEM, prompt).strip()


# ---------------------------------------------------------------------------
# Media headline generation
# ---------------------------------------------------------------------------

HEADLINES_SYSTEM = textwrap.dedent("""\
    You are generating realistic newspaper/news channel headlines for a city
    governance simulation. Each outlet has a political lean that colors its coverage.
    Headlines should be punchy, realistic, and match the outlet's bias.
""")


def generate_media_headlines(
    llm: LLMClient,
    outlets: list[MediaOutletState],
    policy: Policy,
    execution_score: float,
    scandal_broke: bool,
    scandal_minister: str | None,
    active_events: list[ActiveEvent],
) -> list[MediaHeadline]:
    """Generate one headline per outlet."""
    events_str = ", ".join(e.name for e in active_events) if active_events else "none"
    outlets_desc = "\n".join(
        f"  {o.name} (lean={o.lean}, sensationalism={o.sensationalism:.0f})"
        for o in outlets
    )
    scandal_note = ""
    if scandal_broke and scandal_minister:
        scandal_note = f"\nBREAKING: Scandal involving {scandal_minister} has just broken."

    prompt = textwrap.dedent(f"""\
        Main story this turn:
        - Policy: {policy.name} — {policy.description[:120]}
        - Execution score: {execution_score:.0%}
        {scandal_note}
        - Active crises/events: {events_str}

        Media outlets:
        {outlets_desc}

        Generate one realistic headline for each outlet, reflecting its political lean
        and sensationalism level.

        Return a JSON array:
        [
          {{"outlet": "outlet name", "lean": "mayor|opposition|neutral", "headline": "string"}}
        ]

        One entry per outlet. Outlet names must match exactly.
    """)
    raw = llm.chat_text(HEADLINES_SYSTEM, prompt)
    data = _extract_json(raw)
    if not isinstance(data, list):
        data = []
    headlines = []
    outlet_names = {o.name: o.lean for o in outlets}
    for item in data:
        if isinstance(item, dict) and "outlet" in item and "headline" in item:
            lean = item.get("lean") or outlet_names.get(item["outlet"], "neutral")
            if lean not in ("mayor", "opposition", "neutral"):
                lean = "neutral"
            headlines.append(MediaHeadline(
                outlet=item["outlet"],
                lean=lean,
                headline=item["headline"],
            ))
    return headlines


# ---------------------------------------------------------------------------
# Citizen reaction sampling
# ---------------------------------------------------------------------------

CITIZEN_VOICES_SYSTEM = textwrap.dedent("""\
    You are generating authentic citizen reaction quotes for a city governance
    simulation. Each citizen has a distinct demographic profile and ideology.
    Write short, authentic first-person reactions (1 sentence each).
    Match sentiment to the policy outcome and the citizen's personal circumstances.
""")


def sample_citizen_reactions(
    llm: LLMClient,
    policy: Policy,
    execution_score: float,
    sampled_citizens: list[dict[str, Any]],
    city_name: str,
) -> list[CitizenVoice]:
    """Generate citizen voice reactions for a sample of citizens.

    sampled_citizens: list of dicts with citizen info for the prompt
    """
    citizens_str = "\n".join(
        f"  {i+1}. {c['name']} — {c['demographics']} | ideology: {c['ideology']} | "
        f"wellbeing: {c['wellbeing']:.0f}/100"
        for i, c in enumerate(sampled_citizens)
    )

    prompt = textwrap.dedent(f"""\
        City: {city_name}
        Policy enacted: {policy.name}
        Description: {policy.description[:150]}
        Execution: {execution_score:.0%}

        Citizens to react:
        {citizens_str}

        Generate one authentic, in-character reaction quote for each citizen.
        Sentiment must be one of: approve, disapprove, undecided.

        Return a JSON array:
        [
          {{
            "citizen_id": "string",
            "name": "string",
            "reaction": "one sentence first-person reaction",
            "sentiment": "approve|disapprove|undecided"
          }}
        ]

        One entry per citizen, in the same order.
    """)
    raw = llm.chat_text(CITIZEN_VOICES_SYSTEM, prompt)
    data = _extract_json(raw)
    if not isinstance(data, list):
        data = []

    voices = []
    for item, c in zip(data, sampled_citizens):
        if not isinstance(item, dict):
            continue
        sentiment = item.get("sentiment", "undecided")
        if sentiment not in ("approve", "disapprove", "undecided"):
            sentiment = "undecided"
        voices.append(CitizenVoice(
            citizen_id=c["id"],
            name=item.get("name") or c["name"],
            demographics_summary=c["demographics"],
            ideology=c["ideology"],
            reaction=item.get("reaction", ""),
            sentiment=sentiment,
        ))
    return voices

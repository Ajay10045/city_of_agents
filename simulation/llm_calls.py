"""LLM call orchestration — all prompt construction and response parsing.

Each function builds a prompt, calls the LLM client, and returns parsed data.
Side-effect free: no game-state mutation here.
"""
from __future__ import annotations

import json
import logging
import os
import re
import textwrap
import hashlib
from typing import Any

from engine.models import (
    ActiveEvent,
    Citizen,
    CitizenVoice,
    CityParameters,
    CityProfile,
    GameState,
    MediaHeadline,
    MediaOutletState,
    Minister,
    Policy,
    WardReportEntry,
    WellbeingState,
)
from engine.political import compute_interim_approval
from llm.llm_client import LLMClient

logger = logging.getLogger(__name__)


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


def _normalise_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.strip().lower())


def _normalise_stance(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    stance = value.strip().lower()
    if stance.startswith("disapprove"):
        return "disapprove"
    if stance.startswith("approve"):
        return "approve"
    return None


def _minister_profile_for_policy_prompt(minister: Minister) -> str:
    c = minister.citizen
    p = c.personality
    cap = c.capability
    traits = []
    if p.integrity > 65:
        traits.append("high-integrity")
    elif p.integrity < 35:
        traits.append("low-integrity")
    if p.empathy > 60:
        traits.append("empathetic")
    if p.ambition > 65:
        traits.append("ambitious")
    if p.risk_appetite > 60:
        traits.append("risk-taking")
    elif p.risk_appetite < 35:
        traits.append("cautious")
    if p.corruption_tolerance > 60:
        traits.append("tolerant-of-corruption")
    trait_str = ", ".join(traits) if traits else "balanced"
    return (
        f"  - {c.name} | Portfolio: {minister.portfolio}"
        f"{' + ' + ', '.join(minister.extra_portfolios) if minister.extra_portfolios else ''}"
        f" | Loyalty: {minister.state.loyalty:.0f} | Competence: {cap.competence:.0f}"
        f" | Personality: {trait_str}"
        f" | Ideology: {c.demographics.ideology_economic}/{c.demographics.ideology_social}"
    )


def _normalise_advisor_stances(
    raw_stances: Any,
    ministers: list[Minister],
) -> list[dict[str, str]]:
    if not isinstance(raw_stances, list):
        return []

    minister_name_by_key: dict[str, str] = {}
    for minister in ministers:
        name = minister.citizen.name
        minister_name_by_key[_normalise_name(name)] = name

    normalised: list[dict[str, str]] = []
    seen_ministers: set[str] = set()
    for item in raw_stances:
        if not isinstance(item, dict):
            continue

        raw_name = item.get("minister_name")
        if not isinstance(raw_name, str) or not raw_name.strip():
            raw_name = item.get("ministerName")
        if not isinstance(raw_name, str) or not raw_name.strip():
            continue

        canonical_name = minister_name_by_key.get(_normalise_name(raw_name))
        if not canonical_name or canonical_name in seen_ministers:
            continue

        stance = _normalise_stance(item.get("stance"))
        if stance is None:
            continue

        reason = item.get("reason")
        if not isinstance(reason, str):
            continue
        reason = reason.strip()
        if not reason:
            continue

        normalised.append(
            {
                "minister_name": canonical_name,
                "stance": stance,
                "reason": reason,
            }
        )
        seen_ministers.add(canonical_name)

    return normalised


def _advisor_stances_complete(stances: list[dict[str, str]], ministers: list[Minister]) -> bool:
    required = {m.citizen.name for m in ministers}
    provided = {s.get("minister_name", "") for s in stances}
    return provided == required and len(stances) == len(required)


def _repair_policy_advisor_stances_once(
    llm: LLMClient,
    policy: dict[str, Any],
    ministers: list[Minister],
    ministers_str: str,
) -> list[dict[str, Any]]:
    minister_names = [m.citizen.name for m in ministers]
    prompt = textwrap.dedent(f"""\
        Repair ONLY the advisor_stances for this policy.

        Policy JSON:
        {json.dumps(policy, ensure_ascii=True, indent=2)}

        Cabinet (with personality profiles):
        {ministers_str}

        Requirements:
        - Return EXACTLY {len(minister_names)} stances.
        - One entry per minister, no duplicates, no extras.
        - minister_name must exactly match one of:
          {json.dumps(minister_names, ensure_ascii=True)}
        - stance must be "approve" or "disapprove".
        - reason must be exactly one sentence, in that minister's voice, and mention a concrete personality/portfolio tradeoff for this policy.

        Return ONLY valid JSON in one of these forms:
        {{
          "advisor_stances": [
            {{"minister_name": "string", "stance": "approve|disapprove", "reason": "string"}}
          ]
        }}
        OR just the array itself.
    """)
    raw = llm.chat_text(POLICY_DRAFT_SYSTEM, prompt)
    try:
        parsed = _extract_json(raw)
    except ValueError:
        return []
    if isinstance(parsed, dict):
        stances = parsed.get("advisor_stances", [])
        return stances if isinstance(stances, list) else []
    if isinstance(parsed, list):
        return parsed
    return []


def _finalise_policy_advisor_stances(
    llm: LLMClient,
    policy: dict[str, Any],
    ministers: list[Minister],
    ministers_str: str,
) -> None:
    stances = _normalise_advisor_stances(policy.get("advisor_stances", []), ministers)
    if _advisor_stances_complete(stances, ministers):
        policy["advisor_stances"] = stances
        return

    logger.info(
        "advisor_stance_repair_triggered policy=%s provided=%d required=%d",
        policy.get("name", "<unknown>"),
        len(stances),
        len(ministers),
    )

    repaired_raw = _repair_policy_advisor_stances_once(llm, policy, ministers, ministers_str)
    repaired_stances = _normalise_advisor_stances(repaired_raw, ministers)
    if _advisor_stances_complete(repaired_stances, ministers):
        logger.info(
            "advisor_stance_repair_succeeded policy=%s count=%d",
            policy.get("name", "<unknown>"),
            len(repaired_stances),
        )
    else:
        logger.warning(
            "advisor_stance_repair_incomplete policy=%s provided=%d required=%d",
            policy.get("name", "<unknown>"),
            len(repaired_stances),
            len(ministers),
        )

    policy["advisor_stances"] = repaired_stances


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
        "total_turns": 10,
        "election_turn": 8,
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
    cache_dir = "data/cache/profiles"
    os.makedirs(cache_dir, exist_ok=True)
    hint_hash = hashlib.md5(city_hint.encode('utf-8')).hexdigest()
    cache_path = os.path.join(cache_dir, f"{hint_hash}.json")
    
    if os.path.exists(cache_path):
        try:
            with open(cache_path, "r") as f:
                return json.load(f)
        except json.JSONDecodeError:
            pass

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
    result = llm.chat(CITY_PROFILE_SYSTEM, user_prompt)
    
    try:
        with open(cache_path, "w") as f:
            json.dump(result, f)
    except Exception:
        pass
        
    return result


# ---------------------------------------------------------------------------
# Citizen name generation
# ---------------------------------------------------------------------------

def generate_citizen_names(llm: LLMClient, profile: CityProfile, count: int) -> list[str]:
    """Generate culturally appropriate full names for citizens."""
    cache_dir = "data/cache/names"
    os.makedirs(cache_dir, exist_ok=True)
    cache_key = f"{profile.city_name}_{count}"
    hint_hash = hashlib.md5(cache_key.encode('utf-8')).hexdigest()
    cache_path = os.path.join(cache_dir, f"{hint_hash}.json")

    if os.path.exists(cache_path):
        try:
            with open(cache_path, "r") as f:
                return json.load(f)
        except json.JSONDecodeError:
            pass

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
        
    try:
        with open(cache_path, "w") as f:
            json.dump(data[:count], f)
    except Exception:
        pass

    return data[:count]


# ---------------------------------------------------------------------------
# Minister consultation (multi-turn)
# ---------------------------------------------------------------------------

MINISTER_SYSTEM_TEMPLATE = textwrap.dedent("""\
    You are {name}, the {portfolio} minister of {city_name}, in a cabinet council meeting.

    Your background:
    - Integrity: {integrity:.0f}/100  |  Competence: {competence:.0f}/100
    - Managerial Skill: {managerial:.0f}/100  |  Loyalty to Mayor: {loyalty:.0f}/100
    - Ideology: {ideology_economic} / {ideology_social}
    - Scandal exposure: {scandal:.0f}/100
    - Portfolio: {portfolio}

    Current city snapshot (your sector context):
    {params_summary}

    Your personality: {personality_summary}

    CONVERSATION STYLE — this is a real cabinet room, not a polite seminar:
    - NEVER start with "I agree". Push your own portfolio's angle FIRST, then acknowledge others if relevant.
    - If another minister's proposal hurts your sector, say so directly. Budget is limited — fight for your share.
    - You can challenge, qualify, or redirect: "That's fine for roads, but my schools are crumbling."
    - If the topic doesn't concern your portfolio at all, keep it very brief (one sentence) or raise a different concern.
    - You can support an idea, but add a condition: "Only if we also fund X."
    - Show personality — if you're high-integrity, call out waste. If low-loyalty, subtly question the mayor's priorities.
    - Speak in first person. Keep it to 1-3 sentences. Sound like a real politician, not a bureaucrat.
    - NEVER just echo what others said. Add new information, a counter-argument, or a trade-off.
    - Vary your address: sometimes "Mayor", sometimes just dive straight in. NEVER say "Mr. Mayor" or "Madam Mayor" — this is an informal cabinet room, not a press conference.

    CONVERGENCE — when the mayor gives a clear direction or decision:
    - If the Mayor has made a decision or said something like "ok", "approved", "let's do it", "agreed", STOP arguing against it.
    - Acknowledge the decision briefly, then raise ONE practical condition or implementation concern — not a new objection.
    - Do not keep lobbying for your portfolio after the Mayor has moved on. Cabinet loyalty matters.
    - If colleagues have already covered your concern, stay silent or add only one sentence of support.
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

POLICY_DRAFT_SYSTEM_STREAM = textwrap.dedent("""\
    You are a senior policy advisor for a city governance simulation game.
    You generate realistic, balanced policy options based on the current city
    situation and minister consultation. Policies must have trade-offs and
    uncertainty — no silver bullets.

    You are drafting ONE policy at a time.
    First output concise policy reasoning inside <analysis>...</analysis>.
    Then output one valid JSON policy object.
    Do not output JSON inside <analysis>.
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


def _build_policy_prompt_context(
    state: GameState,
    consultation_transcript: str,
    available_budget: float,
) -> dict[str, Any]:
    params = state.city_params.as_dict()
    params_str = "\n".join(f"  {k.replace('_', ' ').title()}: {v:.1f}" for k, v in params.items())
    active_events_str = ""
    if state.active_events:
        active_events_str = "Active events:\n" + "\n".join(
            f"  - {e.name} ({e.type}, {e.turns_remaining} turns left)" for e in state.active_events
        )
    ministers_str = "\n".join(_minister_profile_for_policy_prompt(m) for m in state.ministers)
    minister_names = [m.citizen.name for m in state.ministers]
    return {
        "state": state,
        "params": params,
        "params_str": params_str,
        "active_events_str": active_events_str,
        "ministers_str": ministers_str,
        "minister_names": minister_names,
        "consultation_transcript": consultation_transcript or "(No consultation this turn)",
        "available_budget": available_budget,
    }


def _build_policy_options_prompt(context: dict[str, Any]) -> str:
    state: GameState = context["state"]
    params: dict[str, Any] = context["params"]
    params_str: str = context["params_str"]
    active_events_str: str = context["active_events_str"]
    ministers_str: str = context["ministers_str"]
    minister_names: list[str] = context["minister_names"]
    consultation_transcript: str = context["consultation_transcript"]
    available_budget: float = context["available_budget"]

    return textwrap.dedent(f"""\
        City: {state.city_profile.city_name} | Turn: {state.current_turn}/{state.city_profile.game_config.total_turns}
        Treasury: {state.treasury:.0f} Cr | Debt: {state.outstanding_debt:.0f} Cr
        Available policy budget: {available_budget:.0f} Cr

        Current city parameters:
        {params_str}

        Cabinet (with personality profiles):
        {ministers_str}

        {active_events_str}

        --- Minister consultation transcript ---
        {consultation_transcript}
        --- End transcript ---

        Generate exactly 3 distinct policy options for this turn.
        Each policy must:
        1. Respond to the situation and consultation insights
        2. Have a primary target parameter (biggest positive effect) and 1-2 side effects (positive or negative)
        3. Have realistic budget cost (within available budget)
        4. Have a time_profile (effects spread over turns, e.g. 60% turn_0, 40% turn_1)
        5. Have clear trade-offs and a reason why it's relevant now
        6. Include advisor_stances: for EACH minister, generate their stance ("approve" or "disapprove") and a 1-sentence reason IN THEIR VOICE reflecting their personality, portfolio concerns, and ideology. An ambitious minister speaks differently from a cautious one. A minister whose portfolio is harmed should voice specific concerns about their area.
        7. advisor_stances MUST contain exactly {len(minister_names)} entries, with one entry for each minister and exact names from this list: {json.dumps(minister_names, ensure_ascii=True)}.
        8. Every advisor reason must mention at least one concrete personality/portfolio tradeoff for this specific policy (not generic praise/criticism).

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
            "why_now": "string — why this is relevant this specific turn",
            "advisor_stances": [
              // Exactly one entry per minister: {', '.join(minister_names)}
              {{
                "minister_name": "string — must exactly match one listed minister name",
                "stance": "approve" or "disapprove",
                "reason": "string — 1 sentence in the minister's voice, specific to this policy and their personality/portfolio"
              }}
            ]
          }}
        ]

        Valid param keys: {', '.join(params.keys())}
    """)


def _build_single_policy_stream_prompt(
    context: dict[str, Any],
    policy_index: int,
    drafted_options: list[dict[str, Any]],
) -> str:
    state: GameState = context["state"]
    params: dict[str, Any] = context["params"]
    params_str: str = context["params_str"]
    active_events_str: str = context["active_events_str"]
    ministers_str: str = context["ministers_str"]
    minister_names: list[str] = context["minister_names"]
    consultation_transcript: str = context["consultation_transcript"]
    available_budget: float = context["available_budget"]
    drafted_summary = [
        {
            "name": o.get("name", ""),
            "portfolio": o.get("portfolio", ""),
            "target_effects": o.get("target_effects", {}),
            "budget_cost": o.get("budget_cost", 0),
        }
        for o in drafted_options
        if isinstance(o, dict)
    ]

    return textwrap.dedent(f"""\
        City: {state.city_profile.city_name} | Turn: {state.current_turn}/{state.city_profile.game_config.total_turns}
        Treasury: {state.treasury:.0f} Cr | Debt: {state.outstanding_debt:.0f} Cr
        Available policy budget: {available_budget:.0f} Cr

        Current city parameters:
        {params_str}

        Cabinet (with personality profiles):
        {ministers_str}

        {active_events_str}

        --- Minister consultation transcript ---
        {consultation_transcript}
        --- End transcript ---

        You are drafting policy #{policy_index} of 3.
        Already drafted policies (must stay distinct from these):
        {json.dumps(drafted_summary, ensure_ascii=True)}

        First output policy-specific reasoning in <analysis> tags using markdown-lite:
        <analysis>
        ## POLICY {policy_index} — Working Title
        - **Why now:** one line
        - **Plan logic:** top target + key side effect + tradeoff
        - **Council vote:** X For · Y Against
        - *For:* minister + short reason
        - *Against:* minister + short reason
        </analysis>

        Then output ONE JSON policy object with this schema:
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
              "difficulty": float
            }}
          ],
          "tradeoffs": "string",
          "why_now": "string",
          "advisor_stances": [
            {{
              "minister_name": "exact minister name",
              "stance": "approve" or "disapprove",
              "reason": "1 sentence in minister voice"
            }}
          ]
        }}

        Constraints:
        - This policy must be distinct from already drafted ones by portfolio mix, targets, and tradeoff profile.
        - budget_cost must be <= {available_budget:.0f}
        - advisor_stances MUST contain exactly {len(minister_names)} entries with exact names from:
          {json.dumps(minister_names, ensure_ascii=True)}
        - reasons must reference personality/portfolio tradeoffs.
        - Valid param keys: {', '.join(params.keys())}
        - Do NOT include any text outside <analysis>...</analysis> and the JSON object.
    """)


def _probable_json_start_index(text: str) -> int:
    leading = len(text) - len(text.lstrip())
    stripped = text.lstrip()
    if stripped.startswith("{") or stripped.startswith("["):
        return leading
    m = re.search(r"\n\s*[\[{]\s*(?:[\[{]|\")", text)
    if m:
        return m.start() + 1
    return -1


def _iter_smoothed_thinking_chunks(text: str, max_chars: int = 120) -> list[str]:
    out: list[str] = []
    pending = text
    while pending:
        if len(pending) <= max_chars:
            out.append(pending)
            break
        window = pending[: max_chars + 1]
        split_at = max(
            window.rfind(". "),
            window.rfind("? "),
            window.rfind("! "),
            window.rfind("\n"),
            window.rfind("; "),
            window.rfind(", "),
            window.rfind(" "),
        )
        if split_at <= 0:
            split_at = max_chars
        else:
            split_at += 1
        out.append(pending[:split_at])
        pending = pending[split_at:]
    return [chunk for chunk in out if chunk]


def _clean_reasoning_line(text: Any, fallback: str = "") -> str:
    if not isinstance(text, str):
        return fallback
    cleaned = re.sub(r"\s+", " ", text).strip()
    return cleaned or fallback


def _shorten_reason(text: str, max_len: int = 120) -> str:
    if len(text) <= max_len:
        return text
    cut = text[:max_len].rstrip()
    last_space = cut.rfind(" ")
    if last_space >= 20:
        cut = cut[:last_space]
    return cut.rstrip(".,;:") + "..."


def _policy_vote_summary(policy: dict[str, Any]) -> dict[str, Any]:
    stances = policy.get("advisor_stances", [])
    if not isinstance(stances, list):
        stances = []

    approve: list[tuple[str, str]] = []
    disapprove: list[tuple[str, str]] = []
    for stance in stances:
        if not isinstance(stance, dict):
            continue
        name_raw = stance.get("minister_name") or stance.get("ministerName")
        name = _clean_reasoning_line(name_raw, "Unnamed Minister")
        reason = _clean_reasoning_line(stance.get("reason"), "No reason provided.")
        vote = _normalise_stance(stance.get("stance"))
        if vote == "approve":
            approve.append((name, reason))
        elif vote == "disapprove":
            disapprove.append((name, reason))

    summary: dict[str, Any] = {
        "for_count": len(approve),
        "against_count": len(disapprove),
        "for_line": None,
        "against_line": None,
        "limited": len(approve) + len(disapprove) == 0,
    }
    if approve:
        n, r = approve[0]
        summary["for_line"] = f"{n} — {_shorten_reason(r, 110)}"
    if disapprove:
        n, r = disapprove[0]
        summary["against_line"] = f"{n} — {_shorten_reason(r, 110)}"
    return summary


def generate_policy_options(
    llm: LLMClient,
    state: GameState,
    consultation_transcript: str,
    available_budget: float,
) -> list[dict[str, Any]]:
    """Generate 3 policy options for the current turn, informed by consultation transcript.

    Returns list of 3 policy dicts matching Policy schema.
    """
    context = _build_policy_prompt_context(state, consultation_transcript, available_budget)
    ministers_str = context["ministers_str"]
    prompt = _build_policy_options_prompt(context)

    raw = llm.chat_text(POLICY_DRAFT_SYSTEM, prompt)
    try:
        options = _extract_json(raw)
    except ValueError:
        options = []
    if not isinstance(options, list):
        options = [options] if isinstance(options, dict) else []
    # Enforce caps: target_effects ±10, side_effects ±5
    for opt in options[:3]:
        for key in opt.get("target_effects", {}):
            opt["target_effects"][key] = max(-10.0, min(10.0, float(opt["target_effects"][key])))
        for key in opt.get("side_effects", {}):
            opt["side_effects"][key] = max(-5.0, min(5.0, float(opt["side_effects"][key])))
        _finalise_policy_advisor_stances(llm, opt, state.ministers, ministers_str)
    return options[:3]


def generate_policy_options_stream(
    llm: LLMClient,
    state: GameState,
    consultation_transcript: str,
    available_budget: float,
):
    """Stream policy generation in linked sequential mode (1 policy per LLM call).

    Yields dicts with:
      {"type": "thinking", "chunk": str}  — analysis text from <analysis>...</analysis>
      {"type": "policies", "options": list}  — final parsed policies
    """
    context = _build_policy_prompt_context(state, consultation_transcript, available_budget)
    ministers_str = context["ministers_str"]
    options: list[dict[str, Any]] = []
    total_chunks = 0
    total_chars = 0

    analysis_open = "<analysis>"
    analysis_close = "</analysis>"

    for policy_idx in range(1, 4):
        yield {"type": "policy_start", "index": policy_idx}
        if policy_idx > 1:
            total_chunks += 1
            total_chars += 1
            yield {"type": "thinking", "chunk": "\n"}

        prompt = _build_single_policy_stream_prompt(context, policy_idx, options)
        logger.debug("policy_stream_draft_started index=%d", policy_idx)

        raw_chunks: list[str] = []
        parse_buffer = ""
        in_analysis = False
        found_open = False
        found_close = False
        emitted_this_policy = 0
        emitted_this_chars = 0

        for chunk in llm.chat_text_stream(POLICY_DRAFT_SYSTEM_STREAM, prompt):
            raw_chunks.append(chunk)
            parse_buffer += chunk

            while True:
                if not in_analysis:
                    start_idx = parse_buffer.find(analysis_open)
                    if start_idx == -1:
                        keep = len(analysis_open) - 1
                        if len(parse_buffer) > keep:
                            parse_buffer = parse_buffer[-keep:]
                        break

                    found_open = True
                    in_analysis = True
                    parse_buffer = parse_buffer[start_idx + len(analysis_open):]
                    continue

                end_idx = parse_buffer.find(analysis_close)
                if end_idx == -1:
                    json_idx = _probable_json_start_index(parse_buffer)
                    if json_idx != -1:
                        safe_text = parse_buffer[:json_idx]
                        if safe_text:
                            for out in _iter_smoothed_thinking_chunks(safe_text):
                                emitted_this_policy += 1
                                emitted_this_chars += len(out)
                                total_chunks += 1
                                total_chars += len(out)
                                yield {"type": "thinking", "chunk": out}
                        parse_buffer = ""
                        in_analysis = False
                        break

                    keep = len(analysis_close) - 1
                    emit_upto = max(0, len(parse_buffer) - keep)
                    if emit_upto > 0:
                        out_text = parse_buffer[:emit_upto]
                        for out in _iter_smoothed_thinking_chunks(out_text):
                            emitted_this_policy += 1
                            emitted_this_chars += len(out)
                            total_chunks += 1
                            total_chars += len(out)
                            yield {"type": "thinking", "chunk": out}
                        parse_buffer = parse_buffer[emit_upto:]
                    break

                found_close = True
                out_text = parse_buffer[:end_idx]
                if out_text:
                    for out in _iter_smoothed_thinking_chunks(out_text):
                        emitted_this_policy += 1
                        emitted_this_chars += len(out)
                        total_chunks += 1
                        total_chars += len(out)
                        yield {"type": "thinking", "chunk": out}
                parse_buffer = parse_buffer[end_idx + len(analysis_close):]
                in_analysis = False
                break

        if not found_open:
            logger.warning("policy_stream_missing_analysis index=%d", policy_idx)
        elif not found_close:
            logger.warning("policy_stream_unclosed_analysis index=%d", policy_idx)

        raw = "".join(raw_chunks)
        try:
            parsed = _extract_json(raw)
        except ValueError:
            logger.warning("policy_stream_json_parse_failed index=%d", policy_idx)
            parsed = {}

        if isinstance(parsed, list):
            policy_raw = parsed[0] if parsed and isinstance(parsed[0], dict) else {}
        elif isinstance(parsed, dict):
            policy_raw = parsed
        else:
            policy_raw = {}

        if not isinstance(policy_raw, dict) or not policy_raw:
            logger.warning("policy_stream_empty_policy index=%d", policy_idx)
            continue

        for key in policy_raw.get("target_effects", {}):
            policy_raw["target_effects"][key] = max(-10.0, min(10.0, float(policy_raw["target_effects"][key])))
        for key in policy_raw.get("side_effects", {}):
            policy_raw["side_effects"][key] = max(-5.0, min(5.0, float(policy_raw["side_effects"][key])))
        _finalise_policy_advisor_stances(llm, policy_raw, state.ministers, ministers_str)

        options.append(policy_raw)

        vote = _policy_vote_summary(policy_raw)
        if not re.search(rf"(^|\n)\s*##\s*POLICY\s*{policy_idx}\b", raw, flags=re.IGNORECASE):
            policy_name = _clean_reasoning_line(policy_raw.get("name"), f"Policy {policy_idx}")
            fallback_line = f"## POLICY {policy_idx} — {policy_name}\n"
            for out in _iter_smoothed_thinking_chunks(fallback_line):
                emitted_this_policy += 1
                emitted_this_chars += len(out)
                total_chunks += 1
                total_chars += len(out)
                yield {"type": "thinking", "chunk": out}

        logger.debug(
            "policy_stream_draft_completed index=%d name=%r thinking_chunks=%d thinking_chars=%d stance_count=%d",
            policy_idx,
            policy_raw.get("name"),
            emitted_this_policy,
            emitted_this_chars,
            len(policy_raw.get("advisor_stances", [])) if isinstance(policy_raw.get("advisor_stances", []), list) else 0,
        )

    logger.info(
        "policy_stream_finished policies=%d thinking_chunks=%d thinking_chars=%d",
        len(options[:3]),
        total_chunks,
        total_chars,
    )
    yield {"type": "policies", "options": options[:3]}


def amend_policy_option(
    llm: LLMClient,
    state: GameState,
    existing_policy: dict[str, Any],
    discussion_transcript: str,
    available_budget: float,
) -> dict[str, Any]:
    """Regenerate a single policy option informed by a post-generation discussion transcript."""
    params = state.city_params.as_dict()
    params_str = "\n".join(f"  {k.replace('_', ' ').title()}: {v:.1f}" for k, v in params.items())
    existing_str = json.dumps(existing_policy, indent=2)
    minister_names = [m.citizen.name for m in state.ministers]

    ministers_str = "\n".join(_minister_profile_for_policy_prompt(m) for m in state.ministers)

    prompt = textwrap.dedent(f"""\
        City: {state.city_profile.city_name} | Turn: {state.current_turn}/{state.city_profile.game_config.total_turns}
        Treasury: {state.treasury:.0f} Cr | Debt: {state.outstanding_debt:.0f} Cr
        Available policy budget: {available_budget:.0f} Cr

        Current city parameters:
        {params_str}

        Cabinet:
        {ministers_str}

        The mayor consulted advisors about the following policy draft and wants it amended:

        --- Existing policy draft ---
        {existing_str}
        --- End draft ---

        --- Advisory discussion transcript ---
        {discussion_transcript or "(No discussion provided)"}
        --- End transcript ---

        Produce one amended version of this policy that incorporates the advisory feedback.
        Keep the same general intent but adjust specifics (budget, effects, tradeoffs, description)
        to reflect the discussion. Constraints:
        1. target_effects: max ±10 per param
        2. side_effects: max ±5 per param, can be negative
        3. budget_cost must be within {available_budget:.0f} Cr
        4. time_profile values must sum to 1.0
        5. portfolio must be one of: {', '.join(PORTFOLIOS)}
        6. Include advisor_stances for each minister — stance and a 1-sentence reason in their voice
        7. advisor_stances MUST contain exactly {len(minister_names)} entries with exact names from: {json.dumps(minister_names, ensure_ascii=True)}
        8. Every advisor reason must mention at least one concrete personality/portfolio tradeoff for this specific policy.

        Return ONLY a single JSON policy object (not an array) with this schema:
        {{
          "name": "string",
          "description": "string",
          "portfolio": "string",
          "budget_cost": float,
          "target_effects": {{"param_key": delta_float}},
          "side_effects": {{"param_key": delta_float}},
          "time_profile": {{"turn_0": float, "turn_1": float}},
          "targets": [{{"key": "string", "label": "string", "unit": "points", "proposed": float, "difficulty": float}}],
          "tradeoffs": "string",
          "why_now": "string",
          "advisor_stances": [
            // Exactly one per minister: {', '.join(minister_names)}
            {{"minister_name": "string — exact listed minister name", "stance": "approve" or "disapprove", "reason": "string — 1 sentence in minister's voice"}}
          ]
        }}

        Valid param keys: {', '.join(params.keys())}
    """)

    raw = llm.chat_text(POLICY_DRAFT_SYSTEM, prompt)
    try:
        amended = _extract_json(raw)
    except ValueError:
        amended = existing_policy
    if isinstance(amended, list):
        amended = amended[0] if amended else existing_policy
    if not isinstance(amended, dict):
        amended = existing_policy
    for key in amended.get("target_effects", {}):
        amended["target_effects"][key] = max(-10.0, min(10.0, float(amended["target_effects"][key])))
    for key in amended.get("side_effects", {}):
        amended["side_effects"][key] = max(-5.0, min(5.0, float(amended["side_effects"][key])))
    _finalise_policy_advisor_stances(llm, amended, state.ministers, ministers_str)
    return amended


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


def generate_situational_headlines(
    llm: LLMClient,
    outlets: list[MediaOutletState],
    city_name: str,
    city_params: dict[str, float],
    treasury: float,
    active_events: list[ActiveEvent],
    turn: int,
) -> list[MediaHeadline]:
    """Generate headlines about the city's current state (not a specific policy)."""
    # Sort params to find worst and best
    sorted_params = sorted(city_params.items(), key=lambda x: x[1])
    worst_3 = ", ".join(f"{k.replace('_', ' ').title()} ({v:.0f})" for k, v in sorted_params[:3])
    best_3 = ", ".join(f"{k.replace('_', ' ').title()} ({v:.0f})" for k, v in sorted_params[-3:])
    events_str = ", ".join(e.name for e in active_events) if active_events else "none"
    outlets_desc = "\n".join(
        f"  {o.name} (lean={o.lean}, sensationalism={o.sensationalism:.0f})"
        for o in outlets
    )

    prompt = textwrap.dedent(f"""\
        City: {city_name} — Turn {turn}
        Treasury: {treasury:.0f} Cr
        Weakest areas: {worst_3}
        Strongest areas: {best_3}
        Active crises/events: {events_str}

        Media outlets:
        {outlets_desc}

        Generate one realistic headline for each outlet about the current state of
        the city — infrastructure, public services, economy, governance, or social
        conditions. Each headline should reflect the outlet's political lean and
        sensationalism level. Do NOT reference any specific policy — these are
        situational headlines about what's happening in the city right now.

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
    You are generating authentic, casual citizen reaction quotes for a city
    governance simulation. Citizens are regular people — auto drivers, shopkeepers,
    students, professionals, homemakers — reacting on WhatsApp groups or in
    street conversations.

    Rules:
    - Write in a CASUAL, conversational tone — like real people chatting, not news anchors.
    - Citizens may mix their mother tongue with English (e.g. Hinglish, Tanglish,
      Bangla-English mix, etc.) based on their demographics and the city's languages.
    - Use colloquial expressions, slang, abbreviations when it fits the character
      (e.g. "govt", "yaar", "bhai", "arey", "kya kar rahe hain ye log",
      "sahi hai", "waste of money da", "arre baap re", etc.).
    - Keep reactions to 1-2 short sentences max. Sound human, not formal.
    - Some citizens can be blunt, sarcastic, hopeful, or resigned — match their personality.
    - Match sentiment to the policy outcome and the citizen's personal circumstances.
""")


def sample_citizen_reactions(
    llm: LLMClient,
    policy: Policy,
    execution_score: float,
    sampled_citizens: list[dict[str, Any]],
    city_name: str,
    languages: list[str] | None = None,
) -> list[CitizenVoice]:
    """Generate citizen voice reactions for a sample of citizens.

    sampled_citizens: list of dicts with citizen info for the prompt
    languages: list of city languages for multilingual flavor
    """
    citizens_str = "\n".join(
        f"  {i+1}. {c['name']} — {c['demographics']} | ideology: {c['ideology']} | "
        f"wellbeing: {c['wellbeing']:.0f}/100"
        + (f" | personality: {c['personality']}" if c.get('personality') else "")
        for i, c in enumerate(sampled_citizens)
    )

    lang_note = ""
    if languages:
        lang_note = f"\n        City languages: {', '.join(languages)}. Citizens may naturally mix these with English.\n"

    prompt = textwrap.dedent(f"""\
        City: {city_name}
        Policy enacted: {policy.name}
        Description: {policy.description[:150]}
        Execution: {execution_score:.0%}
        {lang_note}
        Citizens to react:
        {citizens_str}

        Write one raw, unfiltered reaction for each citizen — like a WhatsApp forward,
        chai-stall argument, or auto-rickshaw conversation. Think street-level, not press conference.

        Style rules:
        - Mix mother tongue with English naturally (Hinglish, Tanglish, Bangla-English, etc.)
        - Use slang: yaar, bhai, da, na, arre, kya baat hai, waste da, sahi hai, pagal hain kya
        - Be specific to THEIR situation — a poor daily-wage worker reacts differently than a
          middle-class professional. Reference their job, income, or location if relevant.
        - High integrity citizens get angry at corruption even if the policy helped them
        - High empathy citizens worry about neighbors, not just themselves
        - Keep it 1-2 sentences MAX. Short, punchy, real.
        - Sentiment must be one of: approve, disapprove, undecided

        Return a JSON array:
        [
          {{
            "citizen_id": "string",
            "name": "string",
            "reaction": "raw casual quote in their voice",
            "sentiment": "approve|disapprove|undecided"
          }}
        ]

        One entry per citizen, in the same order as the input list.
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


def generate_situational_chatter(
    llm: LLMClient,
    sampled_citizens: list[dict[str, Any]],
    city_name: str,
    city_params: dict[str, float],
    languages: list[str] | None = None,
) -> list[CitizenVoice]:
    """Generate citizen chatter about daily city life (not reacting to a policy)."""
    sorted_params = sorted(city_params.items(), key=lambda x: x[1])
    worst_3 = ", ".join(f"{k.replace('_', ' ').title()} ({v:.0f}/100)" for k, v in sorted_params[:3])

    citizens_str = "\n".join(
        f"  {i+1}. {c['name']} — {c['demographics']} | ideology: {c['ideology']} | "
        f"wellbeing: {c['wellbeing']:.0f}/100"
        + (f" | personality: {c['personality']}" if c.get('personality') else "")
        for i, c in enumerate(sampled_citizens)
    )

    lang_note = ""
    if languages:
        lang_note = f"\n        City languages: {', '.join(languages)}. Citizens may naturally mix these with English.\n"

    prompt = textwrap.dedent(f"""\
        City: {city_name}
        Weakest city areas: {worst_3}
        {lang_note}
        Citizens:
        {citizens_str}

        These citizens are chatting about daily life in {city_name} — NOT reacting
        to any specific government policy. They are talking about what they experience
        every day: traffic, water supply, safety, jobs, prices, pollution, schools,
        hospitals, community life, etc.

        Write one casual, raw reaction per citizen — like WhatsApp forwards, chai-stall
        chatter, or auto-rickshaw conversation. Match their demographics and personality.

        Style rules:
        - Mix mother tongue with English naturally (Hinglish, Tanglish, etc.)
        - Use slang and colloquialisms
        - Be specific to THEIR situation — a poor daily-wage worker talks differently
          than a middle-class professional
        - Keep it 1-2 sentences MAX. Short, punchy, real.
        - Sentiment: approve (things are okay), disapprove (frustrated), undecided

        Return a JSON array:
        [
          {{
            "citizen_id": "string",
            "name": "string",
            "reaction": "raw casual quote in their voice",
            "sentiment": "approve|disapprove|undecided"
          }}
        ]

        One entry per citizen, same order as input.
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


# ---------------------------------------------------------------------------
# Briefing mayor summary
# ---------------------------------------------------------------------------

MAYOR_BRIEFING_SUMMARY_SYSTEM = textwrap.dedent("""\
    You are a political strategy analyst writing a concise mayor briefing card.
    Use only the provided signals. Be concrete, non-generic, and politically plausible.
    Return valid JSON only.
""")


def _build_mayor_briefing_signals(state: GameState) -> dict[str, Any]:
    params = state.city_params.as_dict()
    sorted_params = sorted(params.items(), key=lambda x: x[1])
    worst_3 = [f"{k.replace('_', ' ')} ({v:.1f})" for k, v in sorted_params[:3]]
    best_3 = [f"{k.replace('_', ' ')} ({v:.1f})" for k, v in sorted_params[-3:]]

    approval_pct = compute_interim_approval(state.citizens, state.city_params.media_freedom)

    group_weighted: dict[str, dict[str, float]] = {}
    for citizen in state.citizens:
        group = citizen.demographics.profession or "Unknown"
        weighted = group_weighted.setdefault(group, {"weight": 0.0, "approval_sum": 0.0})
        weight = citizen.population_weight if citizen.population_weight > 0 else 1.0
        weighted["weight"] += weight
        weighted["approval_sum"] += weight * ((citizen.mayor_alignment + 100.0) / 2.0)

    group_scores: list[tuple[str, float]] = []
    for group_name, weighted in group_weighted.items():
        denom = weighted["weight"] if weighted["weight"] > 0 else 1.0
        group_scores.append((group_name, weighted["approval_sum"] / denom))
    group_scores.sort(key=lambda x: x[1], reverse=True)
    top_supportive = {
        "group": group_scores[0][0] if group_scores else "n/a",
        "approval": round(group_scores[0][1], 1) if group_scores else 50.0,
    }
    top_skeptical = {
        "group": group_scores[-1][0] if group_scores else "n/a",
        "approval": round(group_scores[-1][1], 1) if group_scores else 50.0,
    }

    def _clip(text: str, max_len: int = 120) -> str:
        text = re.sub(r"\s+", " ", text).strip()
        if len(text) <= max_len:
            return text
        cut = text[:max_len].rstrip()
        at = cut.rfind(" ")
        if at >= 20:
            cut = cut[:at]
        return cut.rstrip(".,;:") + "..."

    last_turn = state.turn_history[-1] if state.turn_history else None
    voice_examples: list[dict[str, str]] = []
    if last_turn and last_turn.citizen_voices:
        for voice in last_turn.citizen_voices[:5]:
            voice_examples.append(
                {
                    "name": voice.name,
                    "sentiment": voice.sentiment,
                    "reaction": _clip(voice.reaction, 90),
                }
            )

    headline_examples: list[dict[str, str]] = []
    if last_turn and last_turn.media_headlines:
        for headline in last_turn.media_headlines[:5]:
            headline_examples.append(
                {
                    "outlet": headline.outlet,
                    "lean": headline.lean,
                    "headline": _clip(headline.headline, 95),
                }
            )

    lean_weight = {"mayor": 0.0, "opposition": 0.0, "neutral": 0.0}
    for outlet in state.media_outlets:
        weight = max(0.0, float(outlet.reach)) * max(0.0, float(outlet.trust_rating))
        lean_weight[outlet.lean] = lean_weight.get(outlet.lean, 0.0) + weight
    lean_total = sum(lean_weight.values())
    lean_split = {
        key: round((value / lean_total) * 100.0, 1) if lean_total > 0 else 0.0
        for key, value in lean_weight.items()
    }

    by_influence = sorted(
        state.media_outlets,
        key=lambda o: (o.reach * o.trust_rating),
        reverse=True,
    )
    media_like_outlets = [o.name for o in by_influence if o.lean == "mayor"][:2]
    media_dislike_outlets = [o.name for o in by_influence if o.lean == "opposition"][:2]

    return {
        "city_name": state.city_profile.city_name,
        "turn": state.current_turn,
        "approval_pct": round(approval_pct, 1),
        "worst_3": worst_3,
        "best_3": best_3,
        "active_events": [
            {
                "name": event.name,
                "type": event.type,
                "severity": event.severity,
                "turns_remaining": event.turns_remaining,
            }
            for event in state.active_events
        ],
        "top_supportive_group": top_supportive,
        "top_skeptical_group": top_skeptical,
        "voice_examples": voice_examples,
        "media_lean_split": lean_split,
        "media_like_outlets": media_like_outlets,
        "media_dislike_outlets": media_dislike_outlets,
        "headline_examples": headline_examples,
    }


def generate_mayor_briefing_summary(
    llm: LLMClient,
    state: GameState,
    elected_on_context: str | None = None,
) -> dict[str, str] | None:
    """Generate a compact mayor mandate/likes-dislikes briefing summary.

    Returns None on any parse/validation failure.
    """
    signals = _build_mayor_briefing_signals(state)
    locked_mandate = (elected_on_context or "").strip()
    mandate_instruction = (
        f'Use this exact elected_on text verbatim: "{locked_mandate}". '
        "Do not paraphrase it."
        if locked_mandate
        else "Generate elected_on as one concise sentence about the mayor's mandate."
    )

    prompt = textwrap.dedent(f"""\
        City briefing inputs (JSON):
        {json.dumps(signals, ensure_ascii=True, indent=2)}

        Task:
        - Write 5 short lines (single sentence each) describing mayor narrative context.
        - {mandate_instruction}
        - people_like / people_dislike must be grounded in current citizen sentiment signals.
        - media_like / media_dislike must be grounded in outlet lean and headline signals.
        - Keep each line under 22 words. No fluff.

        Return ONLY valid JSON with this exact schema:
        {{
          "elected_on": "string",
          "people_like": "string",
          "people_dislike": "string",
          "media_like": "string",
          "media_dislike": "string"
        }}
    """)

    try:
        raw = llm.chat_text(MAYOR_BRIEFING_SUMMARY_SYSTEM, prompt)
    except Exception as exc:
        logger.warning("mayor_briefing_summary_llm_error: %s", exc)
        return None

    try:
        parsed = _extract_json(raw)
    except ValueError:
        logger.warning("mayor_briefing_summary_parse_failed")
        return None

    if not isinstance(parsed, dict):
        logger.warning("mayor_briefing_summary_not_object")
        return None

    required = [
        "elected_on",
        "people_like",
        "people_dislike",
        "media_like",
        "media_dislike",
    ]
    cleaned: dict[str, str] = {}
    for key in required:
        value = parsed.get(key)
        if not isinstance(value, str) or not value.strip():
            logger.warning("mayor_briefing_summary_missing_field field=%s", key)
            return None
        cleaned[key] = re.sub(r"\s+", " ", value).strip()

    if locked_mandate:
        cleaned["elected_on"] = locked_mandate

    return cleaned


# ---------------------------------------------------------------------------
# Minister briefing lines (cinematic morning briefing scene)
# ---------------------------------------------------------------------------

MINISTER_BRIEFING_LINES_SYSTEM = textwrap.dedent("""\
    You are writing spoken lines for cabinet ministers delivering a morning city briefing to the mayor.
    Each minister speaks ONE sentence in their own voice — direct, urgent, grounded in city-wide data.
    Speak from a policy perspective: cite metrics, trends, collective public mood, or media tone.
    NEVER name individual citizens. Refer to "residents", "the city", "communities", "the public".
    Return valid JSON only.
""")


def generate_minister_briefing_lines(
    llm: LLMClient,
    ministers: list[dict[str, str]],
    city_name: str,
    worst_3: list[dict],
    best_3: list[dict],
    mayor_summary: dict[str, str] | None,
    headlines: list[dict],
    voices: list[dict],
    active_events: list[dict],
) -> list[dict[str, str]] | None:
    """Generate 2-3 minister speech lines for the cinematic morning briefing scene.

    Returns list of {minister_name, portfolio, line} dicts, or None on failure.
    """
    def _fmt_param(x: dict) -> str:
        return "{} ({})".format(x["key"].replace("_", " "), x["value"])

    signals: list[str] = [
        f"City: {city_name}",
        "Struggling: " + ", ".join(_fmt_param(x) for x in worst_3),
        "Strong: " + ", ".join(_fmt_param(x) for x in best_3),
    ]
    if active_events:
        signals.append(f"Active crises: {', '.join(e['name'] for e in active_events)}")
    if mayor_summary:
        signals.append(f"Public mood — like: {mayor_summary.get('people_like', '')} | dislike: {mayor_summary.get('people_dislike', '')}")
    if headlines:
        signals.append("Headlines: " + " | ".join(h["headline"] for h in headlines[:3]))
    if voices:
        themes = [v.get("reaction", "") for v in voices[:5] if v.get("reaction")]
        signals.append("Public mood from city chatter: " + " | ".join(themes))

    minister_list = "\n".join(
        f"- {m['name']} ({m['portfolio']})" for m in ministers
    )

    prompt = textwrap.dedent(f"""\
        City signals:
        {chr(10).join(signals)}

        Cabinet ministers available (pick 2-3 most relevant to the city's top issues):
        {minister_list}

        Write one briefing line per selected minister. Each line:
        - First person, spoken directly to the Mayor
        - Cites a city-wide metric (use the numbers), a media trend, or collective public sentiment
        - NEVER names an individual citizen — say "residents", "the public", "communities"
        - Sounds urgent and human, not bureaucratic
        - Under 30 words

        Return JSON array:
        [
          {{"minister_name": "...", "portfolio": "...", "line": "..."}},
          ...
        ]
    """)

    try:
        raw = llm.chat_text(MINISTER_BRIEFING_LINES_SYSTEM, prompt)
    except Exception as exc:
        logger.warning("minister_briefing_lines_llm_error: %s", exc)
        return None

    try:
        parsed = _extract_json(raw)
    except ValueError:
        logger.warning("minister_briefing_lines_parse_failed")
        return None

    if not isinstance(parsed, list):
        logger.warning("minister_briefing_lines_not_array")
        return None

    result: list[dict[str, str]] = []
    for item in parsed:
        if (
            isinstance(item, dict)
            and isinstance(item.get("minister_name"), str)
            and isinstance(item.get("portfolio"), str)
            and isinstance(item.get("line"), str)
            and item["minister_name"].strip()
            and item["line"].strip()
        ):
            result.append({
                "minister_name": item["minister_name"].strip(),
                "portfolio": item["portfolio"].strip(),
                "line": re.sub(r"\s+", " ", item["line"]).strip(),
            })

    return result if result else None


# ---------------------------------------------------------------------------
# Advisor summary
# ---------------------------------------------------------------------------

ADVISOR_SYSTEM = (
    "You are a sharp political advisor to a city mayor. "
    "After each turn, give a 2-3 sentence debrief: what worked, what didn't, "
    "and one specific thing the mayor should do differently next turn. "
    "Be honest, direct, and concrete. No flattery. No bullet points."
)


def generate_advisor_summary(
    llm: LLMClient,
    policy_name: str,
    execution_score: float,
    budget_stolen: float,
    approval_before: float,
    approval_after: float,
    events_triggered: list[str],
    worst_side_effect: str | None,
    treasury: float,
    city_name: str,
) -> str:
    """Generate a 2-3 sentence strategic debrief for the player after each turn."""
    prompt = (
        f"City: {city_name}\n"
        f"Policy enacted: {policy_name} (execution: {execution_score:.0%})\n"
        f"Approval: {approval_before:.0f}% → {approval_after:.0f}%\n"
        f"Treasury: ₹{treasury:.0f} Cr\n"
        f"Corruption leakage: ₹{budget_stolen:.1f} Cr\n"
        f"Events this turn: {', '.join(events_triggered) or 'none'}\n"
        f"Worst side effect: {worst_side_effect or 'none'}\n\n"
        "Give your 2-3 sentence debrief."
    )
    try:
        return llm.chat_text(ADVISOR_SYSTEM, prompt).strip()
    except Exception:
        return ""


# ---------------------------------------------------------------------------
# AI Policy Evaluator
# ---------------------------------------------------------------------------

EVALUATOR_SYSTEM = textwrap.dedent("""\
    You are an impartial policy analyst evaluating municipal governance in a city simulation.
    Given a policy, the minister implementing it, and the city's current state, you assess
    realistic implementation outcomes.

    Be specific and grounded — reference the minister's actual competence and integrity,
    the city's infrastructure constraints, and how this policy interacts with existing conditions.
    Do NOT be uniformly optimistic. Corruption, bureaucratic friction, and weak institutions
    genuinely reduce outcomes.
""")


def evaluate_policy_implementation(
    llm: LLMClient,
    policy: Policy,
    minister: Minister,
    city_params: CityParameters,
    ward_report: list[WardReportEntry],
    recent_history: list[dict],
    city_name: str,
) -> dict:
    """AI-driven evaluation of policy execution.

    Returns dict with keys:
      execution_pct (0-100), leakage_cr (float), reasoning (str),
      city_param_deltas (dict[str, float]), side_effect_deltas (dict[str, float])
    Falls back to formula-based values if parse fails.
    """
    m = minister.citizen
    cap = minister.citizen.capability
    state = minister.state
    p = city_params.as_dict()

    # Top 3 hotspot groups for context
    hotspots = [e for e in ward_report if e.hotspot][:3]
    hotspot_str = ", ".join(f"{e.group_name} ({e.group_type}, wb={e.avg_wellbeing:.0f})" for e in hotspots) or "none"

    # Recent history summary
    hist_lines = []
    for h in recent_history[-2:]:
        hist_lines.append(
            f"  Turn {h.get('turn','?')}: {h.get('policy','?')} — "
            f"{h.get('exec_pct','?')}% exec, approval {h.get('approval_before','?')}%→{h.get('approval_after','?')}%"
        )
    hist_str = "\n".join(hist_lines) or "  No prior turns"

    # Target effects summary
    targets_str = ", ".join(f"{k} {'+' if v>=0 else ''}{v}" for k, v in policy.target_effects.items())
    side_str = ", ".join(f"{k} {'+' if v>=0 else ''}{v}" for k, v in (policy.side_effects or {}).items()) or "none"

    # Key city params (most relevant first)
    relevant_keys = list(policy.target_effects.keys()) + list((policy.side_effects or {}).keys())
    param_lines = []
    for k, v in p.items():
        marker = " ← target" if k in relevant_keys else ""
        param_lines.append(f"  {k}: {v:.0f}/100{marker}")
    params_str = "\n".join(param_lines)

    prompt = textwrap.dedent(f"""\
        City: {city_name}

        POLICY: {policy.name}
        Description: {policy.description}
        Budget: ₹{policy.budget_cost:.0f} Cr
        Intended effects: {targets_str}
        Known side effects: {side_str}

        MINISTER: {m.name} ({minister.portfolio})
        Competence: {cap.competence:.0f}/100
        Managerial skill: {cap.managerial_skill:.0f}/100
        Bureaucratic navigation: {cap.bureaucratic_navigation:.0f}/100
        Integrity: {m.personality.integrity:.0f}/100
        Corruption tolerance: {m.personality.corruption_tolerance:.0f}/100
        Loyalty to mayor: {state.loyalty:.0f}/100
        Scandal exposure: {state.scandal_exposure:.0f}/100

        CITY PARAMETERS (current):
        {params_str}

        VULNERABLE GROUPS: {hotspot_str}

        RECENT HISTORY:
        {hist_str}

        Evaluate this policy's implementation realistically. Consider:
        - A minister with low competence (<40) will significantly under-deliver
        - High corruption_tolerance + low integrity = high leakage risk
        - Low admin_efficiency or anti_corruption city params amplify problems
        - The actual param deltas should be scaled versions of the intended effects
          (e.g. 60% execution → roughly 60% of intended delta, but not mechanically exact)

        Return ONLY a JSON object (no markdown, no explanation outside the JSON):
        {{
          "execution_pct": <integer 0-100>,
          "leakage_cr": <float, corruption leak in crores>,
          "reasoning": "<2-3 sentences explaining WHY this execution level — be specific>",
          "city_param_deltas": {{<param_key>: <float delta>}},
          "side_effect_deltas": {{<param_key>: <float delta>}}
        }}

        Only include params that actually change. Deltas should be realistic (rarely exceed ±8).
    """)

    try:
        raw = llm.chat_text(EVALUATOR_SYSTEM, prompt)
        result = _extract_json(raw)
        if not isinstance(result, dict):
            raise ValueError("not a dict")
        # Validate required keys
        execution_pct = max(0, min(100, int(result.get("execution_pct", 50))))
        leakage_cr = float(result.get("leakage_cr", 0.0))
        reasoning = str(result.get("reasoning", "")).strip()
        city_param_deltas = {k: float(v) for k, v in result.get("city_param_deltas", {}).items()}
        side_effect_deltas = {k: float(v) for k, v in result.get("side_effect_deltas", {}).items()}
        return {
            "execution_pct": execution_pct,
            "leakage_cr": leakage_cr,
            "reasoning": reasoning,
            "city_param_deltas": city_param_deltas,
            "side_effect_deltas": side_effect_deltas,
        }
    except Exception as exc:
        import logging
        logging.warning(f"evaluate_policy_implementation fallback: {exc}")
        # Fallback: use formula-based approximation
        from engine.implementation import minister_exec_score, city_filter_score
        exec_score = minister_exec_score(minister) * city_filter_score(city_params)
        exec_pct = round(exec_score * 100)
        leakage = policy.budget_cost * (1 - minister.citizen.personality.integrity / 100) * 0.15
        scaled_deltas = {k: round(v * exec_score, 2) for k, v in policy.target_effects.items()}
        return {
            "execution_pct": exec_pct,
            "leakage_cr": round(leakage, 1),
            "reasoning": f"Estimated {exec_pct}% execution based on minister capability and city conditions.",
            "city_param_deltas": scaled_deltas,
            "side_effect_deltas": {k: round(v * exec_score, 2) for k, v in (policy.side_effects or {}).items()},
        }


# ---------------------------------------------------------------------------
# Citizen Approval Poll
# ---------------------------------------------------------------------------

APPROVAL_POLL_SYSTEM = textwrap.dedent("""\
    You are roleplaying as a specific citizen in a city governance simulation.
    You will be given your personal profile — your demographics, personality, ideology,
    and how this turn's policy affected your wellbeing. React authentically to the mayor's
    performance this turn. Stay in character. Be honest, not polite.
""")


def poll_citizen_approval(
    llm: LLMClient,
    citizen: Citizen,
    wellbeing_before: WellbeingState,
    wellbeing_after: WellbeingState,
    policy: Policy,
    execution_pct: float,
    city_params_before: dict,
    city_params_after: dict,
    city_name: str,
) -> CitizenVoice:
    """Single citizen votes on mayor approval and gives an in-character reaction.

    Returns a CitizenVoice with reaction quote and sentiment.
    """
    d = citizen.demographics
    p = citizen.personality
    wb_before = wellbeing_before.score()
    wb_after = wellbeing_after.score()
    wb_delta = wb_after - wb_before

    # Top changed params
    changed = sorted(
        [(k, city_params_after.get(k, 50) - city_params_before.get(k, 50)) for k in city_params_after],
        key=lambda x: abs(x[1]), reverse=True
    )[:3]
    changes_str = ", ".join(
        f"{k.replace('_', ' ')} {'+' if v>=0 else ''}{v:.1f}" for k, v in changed if abs(v) >= 0.3
    ) or "no significant changes"

    def _binary_sentiment(raw_sentiment: Any) -> str:
        if isinstance(raw_sentiment, str):
            s = raw_sentiment.strip().lower()
            if s == "approve":
                return "approve"
            if s == "disapprove":
                return "disapprove"
        # No neutral voting allowed in approval poll; tie breaks to approve.
        return "approve" if wb_delta >= 0 else "disapprove"

    prompt = textwrap.dedent(f"""\
        You are: {citizen.name}
        City: {city_name}
        Demographics: {d.age_group}, {d.income_bracket}, {d.religion}, {d.profession}, {d.location}
        Ideology: {d.ideology_economic} / {d.ideology_social}
        Personality:
          Integrity: {p.integrity:.0f}/100 (higher = angrier about corruption)
          Empathy: {p.empathy:.0f}/100 (higher = cares more about community impact)
          Corruption tolerance: {p.corruption_tolerance:.0f}/100 (lower = more outraged by leaks)
          Authority respect: {p.authority_respect:.0f}/100 (higher = more forgiving of government)

        THIS TURN:
        Policy implemented: {policy.name} — {policy.description[:100]}
        Execution: {execution_pct:.0f}% delivered
        Your wellbeing: {wb_before:.1f} → {wb_after:.1f} (delta: {wb_delta:+.2f})
        City changes: {changes_str}

        Based on all this, give your honest reaction to the Mayor's performance this turn.
        Write as yourself — raw, casual, in your own voice (can mix mother tongue + English).
        Then vote: approve / disapprove.

        Return ONLY JSON (no markdown):
        {{
          "reaction": "<your casual in-character quote, 1-2 sentences max>",
          "sentiment": "approve|disapprove"
        }}
    """)

    try:
        raw = llm.chat_text(APPROVAL_POLL_SYSTEM, prompt)
        result = _extract_json(raw)
        if not isinstance(result, dict):
            raise ValueError("not a dict")
        sentiment = _binary_sentiment(result.get("sentiment"))
        return CitizenVoice(
            citizen_id=citizen.id,
            name=citizen.name,
            demographics_summary=f"{d.income_bracket}, {d.profession}",
            ideology=f"{d.ideology_economic} / {d.ideology_social}",
            reaction=str(result.get("reaction", "")).strip(),
            sentiment=sentiment,
        )
    except Exception:
        # Fallback: derive strict binary sentiment from wellbeing delta.
        sentiment = "approve" if wb_delta >= 0 else "disapprove"
        return CitizenVoice(
            citizen_id=citizen.id,
            name=citizen.name,
            demographics_summary=f"{d.income_bracket}, {d.profession}",
            ideology=f"{d.ideology_economic} / {d.ideology_social}",
            reaction="...",
            sentiment=sentiment,
        )

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from core.game_state import GameState


_STAT_LABELS = {
    "economy": "Economy",
    "employment": "Employment",
    "law_and_order": "Law & Order",
    "infrastructure": "Infrastructure",
    "environment": "Environment",
    "corruption": "Corruption",
    "social_tension": "Social Tension",
    "media_freedom": "Media Freedom",
    "public_trust": "Public Trust",
}

_BAD_HIGH = {"corruption", "social_tension"}


def _level(key: str, value: float) -> str:
    if key in _BAD_HIGH:
        if value > 70:
            return "CRITICAL"
        if value > 55:
            return "HIGH"
        if value > 40:
            return "moderate"
        return "low"
    else:
        if value > 70:
            return "strong"
        if value > 55:
            return "moderate"
        if value > 38:
            return "LOW"
        return "CRITICAL"


def build_city_context(game_state: "GameState") -> str:
    s = game_state
    lines: list[str] = []

    lines.append(
        f"Turn {s.turn_number}/{s.total_turns}. "
        f"Election in {s.election_turn - s.turn_number} turns. "
        f"Governing party: {s.governing_party}."
    )
    lines.append(
        f"Popularity: Mayor {s.mayor_popularity:.1f}% | Opposition {s.opposition_popularity:.1f}%."
    )
    lines.append(
        f"Mayor credibility: {s.credibility_score:.1f}/100 (delta this turn {s.last_credibility_delta:+.2f})."
    )

    stat_parts = []
    for key, label in _STAT_LABELS.items():
        val = getattr(s.city_stats, key, 50)
        lvl = _level(key, val)
        stat_parts.append(f"{label} {val:.0f} ({lvl})")
    lines.append("City stats: " + ", ".join(stat_parts) + ".")

    lines.append(
        f"Media: bias {s.media_state.bias:+.1f} ({'Mayor-leaning' if s.media_state.bias > 2 else 'Opp-leaning' if s.media_state.bias < -2 else 'neutral'}), "
        f"sensationalism {s.media_state.sensationalism:.0f}/100, trust {s.media_state.trust:.0f}/100."
    )

    from agents.agent_engine import AgentEngine
    group_metrics = AgentEngine.group_metrics(s.agents)
    group_lines = []
    for gid, info in s.identity_groups.items():
        m = group_metrics.get(gid, {})
        align = m.get("alignment", 0)
        lean = "Mayor-leaning" if align > 10 else "Opposition-leaning" if align < -10 else "neutral"
        group_lines.append(
            f"  {info.name} ({info.population_percent*100:.0f}%, {info.caste}, {info.religion}): "
            f"Happiness {m.get('happiness', 50):.0f}, Radicalization {m.get('radicalization', 30):.0f}, "
            f"Alignment {align:+.0f} ({lean})"
        )
    lines.append("Identity groups:\n" + "\n".join(group_lines))

    if s.active_events:
        ev_parts = [f"{ev.name} (escalation {ev.escalation_level}/{ev.max_escalation}, {ev.remaining_turns} turns left)" for ev in s.active_events]
        lines.append("Active crises: " + "; ".join(ev_parts) + ".")
    else:
        lines.append("No active crises.")

    if s.long_term_effects:
        lt_parts = [f"{e.source_id} ({e.actor}, {e.remaining_turns} turns left)" for e in s.long_term_effects]
        lines.append("Ongoing policy effects: " + "; ".join(lt_parts) + ".")

    open_promises = [p for p in s.promise_ledger if not p.get("resolved")]
    if open_promises:
        prom_parts = [
            f"{p.get('stat_key')} target {p.get('target')} by turn {p.get('due_turn')}"
            for p in open_promises[:4]
        ]
        lines.append("Outstanding mayor promises: " + "; ".join(prom_parts) + ".")

    full_history = list(s.policy_history) + list(s.event_history)
    if full_history:
        lines.append("Full historical timeline (oldest to newest):")
        for entry in full_history:
            lines.append(f"  - {entry}")

    return "\n".join(lines)

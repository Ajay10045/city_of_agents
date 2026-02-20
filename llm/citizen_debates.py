from __future__ import annotations

import os
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from llm.llm_client import LLMClient
from llm.dynamic_policy import DynamicPolicy, _clamp, _to_float

if TYPE_CHECKING:
    from core.game_state import GameState

_SYSTEM = """You are simulating a street-level conversation among citizens of a specific identity group in a city political simulation.

Given the group's profile, current mood, and what happened this turn, write a vivid, realistic 2-3 sentence summary of what people in this group are talking about — their frustrations, hopes, and reactions. Then output sentiment deltas reflecting how this turn's events shift their collective mood.

Return a JSON object with:
- "debate_summary": 2-3 sentence narrative of the group's internal conversation this turn. Be specific to their identity (religion, occupation, concerns). Use vivid language — what are they saying in tea shops, workplaces, campuses?
- "notable_quote": One short direct quote from a fictional member of this group (max 15 words). Make it feel authentic to their background.
- "alignment_delta": float -5 to +5 (negative = shifts toward opposition, positive = toward mayor)
- "happiness_delta": float -5 to +5
- "radicalization_delta": float -5 to +5 (positive = more radicalized/angry)
- "trust_delta": float -5 to +5 (trust in government)

Base the deltas on: how much the mayor's action helped/hurt this group, whether the opposition's move resonated, any active crises affecting them, and their current radicalization level."""


@dataclass
class DebateResult:
    group_id: str
    group_name: str
    debate_summary: str
    notable_quote: str
    alignment_delta: float
    happiness_delta: float
    radicalization_delta: float
    trust_delta: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "group_id": self.group_id,
            "group_name": self.group_name,
            "debate_summary": self.debate_summary,
            "notable_quote": self.notable_quote,
            "alignment_delta": self.alignment_delta,
            "happiness_delta": self.happiness_delta,
            "radicalization_delta": self.radicalization_delta,
            "trust_delta": self.trust_delta,
        }


class CitizenDebates:
    def __init__(self) -> None:
        model = os.environ.get("LLM_DEBATE_MODEL", "gpt-4o-mini")
        key = (
            os.environ.get("LLM_API_KEY")
            or os.environ.get("OPENAI_API_KEY")
            or os.environ.get("ANTHROPIC_API_KEY")
            or ""
        )
        self._disable_live = key.startswith("test-")
        self._client: LLMClient | None
        try:
            self._client = LLMClient(model=model)
        except Exception:
            self._client = None

    def run_debates(
        self,
        game_state: "GameState",
        mayor_action: DynamicPolicy,
        opp_action: DynamicPolicy,
        triggered_events: list[str],
    ) -> list[DebateResult]:
        return list(self.stream_debates(game_state, mayor_action, opp_action, triggered_events))

    def stream_debates(
        self,
        game_state: "GameState",
        mayor_action: DynamicPolicy,
        opp_action: DynamicPolicy,
        triggered_events: list[str],
    ):
        """Generator: yields one DebateResult per group as each LLM call returns."""
        from agents.agent_engine import AgentEngine
        group_metrics = AgentEngine.group_metrics(game_state.agents)
        for gid, info in game_state.identity_groups.items():
            m = group_metrics.get(gid, {})
            yield self._run_single_debate(gid, info, m, mayor_action, opp_action, triggered_events, game_state)

    def _run_single_debate(
        self,
        gid: str,
        info: Any,
        metrics: dict,
        mayor_action: DynamicPolicy,
        opp_action: DynamicPolicy,
        triggered_events: list[str],
        game_state: "GameState",
    ) -> DebateResult:
        align = metrics.get("alignment", 0)
        lean = "Mayor-leaning" if align > 10 else "Opposition-leaning" if align < -10 else "neutral"
        event_str = ", ".join(triggered_events) if triggered_events else "none"

        user = (
            f"Group: {info.name}\n"
            f"Identity: {info.caste} ({info.religion}, speaks {info.language})\n"
            f"Population: {info.population_percent*100:.0f}% of city\n"
            f"Current mood: Happiness {metrics.get('happiness', 50):.0f}/100, "
            f"Radicalization {metrics.get('radicalization', 30):.0f}/100, "
            f"Alignment {align:+.0f} ({lean})\n"
            f"Grievance score: {info.grievance_score:.2f}/1.0\n\n"
            f"This turn:\n"
            f"  Mayor played: '{mayor_action.name}' — {mayor_action.description}\n"
            f"  Opposition played: '{opp_action.name}' — {opp_action.description}\n"
            f"  Events triggered: {event_str}\n"
            f"  City corruption: {game_state.city_stats.corruption:.0f}, "
            f"Social tension: {game_state.city_stats.social_tension:.0f}, "
            f"Economy: {game_state.city_stats.economy:.0f}\n\n"
            f"Simulate this group's conversation and sentiment shift."
        )

        if self._client is not None and not self._disable_live:
            try:
                data = self._client.chat(_SYSTEM, user)
                return DebateResult(
                    group_id=gid,
                    group_name=info.name,
                    debate_summary=str(data.get("debate_summary", ""))[:500],
                    notable_quote=str(data.get("notable_quote", ""))[:120],
                    alignment_delta=_clamp(_to_float(data.get("alignment_delta"), 0.0) or 0.0, -5, 5),
                    happiness_delta=_clamp(_to_float(data.get("happiness_delta"), 0.0) or 0.0, -5, 5),
                    radicalization_delta=_clamp(_to_float(data.get("radicalization_delta"), 0.0) or 0.0, -5, 5),
                    trust_delta=_clamp(_to_float(data.get("trust_delta"), 0.0) or 0.0, -5, 5),
                )
            except Exception:
                pass

        align_delta = -0.4 if opp_action.campaign_strength >= mayor_action.campaign_strength else 0.3
        happiness_delta = 0.2 if metrics.get("happiness", 50) < 45 else -0.1
        radical_delta = 0.35 if metrics.get("radicalization", 30) > 50 else -0.15
        trust_delta = -0.25 if game_state.city_stats.corruption > 55 else 0.15

        summary = (
            f"{info.name} residents weigh {mayor_action.name} against {opp_action.name}, "
            "with conversations centered on delivery credibility and daily pressure."
        )
        quote = "Show us results, not speeches."

        return DebateResult(
            group_id=gid,
            group_name=info.name,
            debate_summary=summary[:500],
            notable_quote=quote,
            alignment_delta=_clamp(align_delta, -5, 5),
            happiness_delta=_clamp(happiness_delta, -5, 5),
            radicalization_delta=_clamp(radical_delta, -5, 5),
            trust_delta=_clamp(trust_delta, -5, 5),
        )

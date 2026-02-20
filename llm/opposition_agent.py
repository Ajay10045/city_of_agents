from __future__ import annotations

import os
from typing import TYPE_CHECKING

from llm.llm_client import LLMClient
from llm.context_builder import build_city_context
from llm.dynamic_policy import DynamicPolicy

if TYPE_CHECKING:
    from core.game_state import GameState

_SYSTEM = """You are the opposition leader in a city political simulation. You are strategic, opportunistic, and focused on winning the next election by exploiting the Mayor's weaknesses and championing neglected groups.

Given the city state and what the Mayor just did, decide on ONE political action to take this turn. Your goal: maximize opposition popularity, erode Mayor support, and build your coalition.

Return a JSON object with a single "policy" object containing:
- "name": short action name (max 6 words)
- "description": 1 sentence explaining what the opposition is doing
- "rationale": 1-2 sentences explaining your strategic reasoning — what are you exploiting?
- "effects": object with city stat changes. Keys from: economy, employment, law_and_order, infrastructure, environment, corruption, social_tension, media_freedom, public_trust. Values: floats -10 to +10. Opposition actions often increase social_tension, expose corruption, reduce public_trust in government. Be realistic.
- "group_effects": list of group impact objects. Each has "match" (object with one key from "religion"/"caste"/"language"), and some of: "alignment" (-8 to 8, negative = toward opposition), "happiness" (-8 to 8), "radicalization" (-8 to 8). Focus on groups that are unhappy or radicalized.
- "campaign_strength": float 0.9 to 1.4
- "media_effects": object with some of: "bias" (-5 to 0 typically for opposition, to shift media away from mayor), "sensationalism" (0 to 5, opposition thrives on drama), "trust" (-5 to 0)

Be strategic: if Mayor just invested in infrastructure, counter with a scandal expose or welfare promise. If city has high corruption, exploit it. If a group is radicalized, mobilize them. If mayor credibility is low or there are missed promises, directly weaponize that in your rationale and policy effects."""


class OppositionAgent:
    def __init__(self) -> None:
        model = os.environ.get("LLM_MODEL", "gpt-4o")
        self._client: LLMClient | None
        key = os.environ.get("LLM_API_KEY") or os.environ.get("OPENAI_API_KEY") or os.environ.get("ANTHROPIC_API_KEY") or ""
        self._disable_live = key.startswith("test-")
        try:
            self._client = LLMClient(model=model)
        except Exception:
            self._client = None

    @staticmethod
    def _fallback_action(mayor_action: DynamicPolicy) -> DynamicPolicy:
        return DynamicPolicy.from_llm(
            {
                "name": f"Expose {mayor_action.name[:22]}",
                "description": "Frame the mayor's latest move as elite optics and demand accountability.",
                "rationale": "Re-anchor public attention on delivery risk, corruption exposure, and unmet promises.",
                "effects": {
                    "public_trust": -1.4,
                    "social_tension": 0.9,
                    "corruption": 0.8,
                },
                "group_effects": [],
                "campaign_strength": 1.06,
                "media_effects": {"bias": -0.9, "sensationalism": 1.2, "trust": -0.3},
                "target_groups": ["Undecided voters"],
                "expected_stat_delta": {"public_trust": -1.2, "social_tension": 0.8},
                "opposition_counter_risk": 0.56,
                "narrative_fronts_impacted": {"corruption": 1.2, "public_trust": 1.1},
                "confidence": 0.6,
                "assumptions": ["Media amplification stays high"],
                "tradeoffs": ["Repeated use weakens credibility if allegations stay generic"],
                "counter_narrative_risk": "Mayor can neutralize this with transparent implementation proofs.",
            },
            actor="opposition",
        )

    @staticmethod
    def predict_attack_line(
        game_state: "GameState",
        mayor_action: DynamicPolicy,
    ) -> dict[str, object]:
        front_rank = sorted(
            mayor_action.narrative_fronts_impacted.items(),
            key=lambda item: abs(float(item[1])),
            reverse=True,
        )
        primary_front = front_rank[0][0] if front_rank else "public_trust"
        risk = max(0.15, min(1.0, float(mayor_action.opposition_counter_risk or 0.5)))

        front_templates = {
            "corruption": "Opposition will allege procurement opacity and insider favoritism in '{policy}'.",
            "economy": "Opposition will allege '{policy}' helps connected elites while households stay strained.",
            "services": "Opposition will allege '{policy}' overpromises while frontline delivery remains broken.",
            "safety": "Opposition will allege '{policy}' is security theater without neighborhood-level relief.",
            "social_cohesion": "Opposition will allege '{policy}' inflames divisions and ignores vulnerable communities.",
            "public_trust": "Opposition will allege '{policy}' is a trust-repair stunt without enforceable accountability.",
        }
        allegation = front_templates.get(
            primary_front,
            "Opposition will allege '{policy}' is optics-first and weak on execution.",
        ).format(policy=mayor_action.name)

        recent_opp_line = ""
        for entry in reversed(game_state.policy_history):
            if "opposition ->" in entry:
                recent_opp_line = entry.split("opposition ->", 1)[-1].strip()
                break
        if recent_opp_line:
            allegation += f" Likely continuation of: {recent_opp_line}."

        target_groups = list(mayor_action.target_groups[:3]) or ["Undecided neighborhoods"]
        return {
            "front": primary_front,
            "allegation": allegation,
            "risk": risk,
            "target_groups": target_groups,
        }

    def decide_action(self, game_state: "GameState", mayor_action: DynamicPolicy) -> DynamicPolicy:
        context = build_city_context(game_state)
        user = (
            f"City state:\n{context}\n\n"
            f"The Mayor just played: '{mayor_action.name}' — {mayor_action.description}\n\n"
            f"Decide your opposition action this turn."
        )
        if self._client is not None and not self._disable_live:
            try:
                data = self._client.chat(_SYSTEM, user)
                raw = data.get("policy", data)
                return DynamicPolicy.from_llm(raw, actor="opposition")
            except Exception:
                pass
        return self._fallback_action(mayor_action)

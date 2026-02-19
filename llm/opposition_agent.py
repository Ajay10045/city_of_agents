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
        self._client = LLMClient(model=model)

    def decide_action(self, game_state: "GameState", mayor_action: DynamicPolicy) -> DynamicPolicy:
        context = build_city_context(game_state)
        user = (
            f"City state:\n{context}\n\n"
            f"The Mayor just played: '{mayor_action.name}' — {mayor_action.description}\n\n"
            f"Decide your opposition action this turn."
        )
        data = self._client.chat(_SYSTEM, user)
        raw = data.get("policy", data)
        return DynamicPolicy.from_llm(raw, actor="opposition")

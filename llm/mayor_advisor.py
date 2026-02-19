from __future__ import annotations

import json
import os
from typing import TYPE_CHECKING

from llm.llm_client import LLMClient
from llm.context_builder import build_city_context
from llm.dynamic_policy import DynamicPolicy

if TYPE_CHECKING:
    from core.game_state import GameState

_SYSTEM = """You are a political advisor generating policy options for the Mayor of a city simulation.

Given the current city state, generate exactly 5 distinct, creative policy options the Mayor could take this turn.
Each policy must reflect the real political situation — some should address urgent problems, some opportunistic, some risky.

Return a JSON object with key "policies" containing a list of 5 policy objects. Each policy object must have:
- "name": short policy name (max 6 words)
- "description": 1 sentence explaining what the policy does in city terms
- "rationale": 1-2 sentences explaining why a mayor might choose this now given the city state
- "effects": object with city stat changes. Keys from: economy, employment, law_and_order, infrastructure, environment, corruption, social_tension, media_freedom, public_trust. Values: floats -10 to +10. Only include stats actually affected. Use realistic magnitudes — most effects ±1 to ±5.
- "group_effects": list of group impact objects. Each has "match" (object with one key: "religion", "caste", or "language" and the group's value), and some of: "happiness" (-8 to 8), "alignment" (-8 to 8), "radicalization" (-8 to 8). Only include groups actually affected.
- "campaign_strength": float 0.9 to 1.4 (how much this boosts mayor campaign)
- "media_effects": object with some of: "bias" (-5 to 5), "sensationalism" (-5 to 5), "trust" (-5 to 5)

Make the 5 policies meaningfully different — cover different domains (economic, social, law enforcement, environmental, political). All effects must be internally consistent with the policy description."""


class MayorAdvisor:
    def __init__(self) -> None:
        model = os.environ.get("LLM_MODEL", "gpt-4o")
        self._client = LLMClient(model=model)

    def generate_options(self, game_state: "GameState") -> list[DynamicPolicy]:
        context = build_city_context(game_state)
        user = f"City state:\n{context}\n\nGenerate 5 mayor policy options for this turn."
        data = self._client.chat(_SYSTEM, user)
        raw_policies = data.get("policies", [])
        return [DynamicPolicy.from_llm(p, actor="mayor") for p in raw_policies[:6]]

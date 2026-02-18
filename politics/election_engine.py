from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from core.game_state import GameState


def _clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


@dataclass
class ElectionResult:
    turn_number: int
    mayor_vote_share: float
    opposition_vote_share: float
    outcome: str
    swing_voters: float
    undecided_bloc: float

    def as_dict(self) -> dict[str, float | str]:
        return asdict(self)


class ElectionEngine:
    def run_election(
        self,
        game_state: "GameState",
        group_metrics: dict[str, dict[str, float]],
        media_modifiers: tuple[float, float],
    ) -> ElectionResult:
        mayor_campaign = _clamp(game_state.campaign_strength.get("mayor", 1.0), 0.6, 1.8)
        opposition_campaign = _clamp(game_state.campaign_strength.get("opposition", 1.0), 0.6, 1.8)
        mayor_media, opposition_media = media_modifiers

        mayor_raw = 0.0
        opposition_raw = 0.0
        centrist_index = 0.0
        dissatisfaction_index = 0.0

        for metrics in group_metrics.values():
            population = metrics["population"]
            happiness = _clamp(metrics["happiness"] / 100.0, 0.05, 1.0)
            mayor_alignment = _clamp((metrics["alignment"] + 100.0) / 200.0, 0.05, 0.95)
            opposition_alignment = _clamp(1.0 - mayor_alignment, 0.05, 0.95)

            mayor_raw += (
                population
                * happiness
                * mayor_alignment
                * mayor_campaign
                * mayor_media
            )
            opposition_raw += (
                population
                * happiness
                * opposition_alignment
                * opposition_campaign
                * opposition_media
            )

            centrist_index += population * (1.0 - abs(metrics["alignment"]) / 100.0)
            dissatisfaction_index += population * (1.0 - happiness)

        total_raw = mayor_raw + opposition_raw
        if total_raw <= 0:
            mayor_base = 0.5
            opposition_base = 0.5
        else:
            mayor_base = mayor_raw / total_raw
            opposition_base = opposition_raw / total_raw

        undecided_bloc = _clamp(
            0.06
            + centrist_index * 0.22
            + ((100.0 - game_state.city_stats.public_trust) / 100.0) * 0.08,
            0.05,
            0.22,
        )
        swing_voters = _clamp(
            0.03
            + dissatisfaction_index * 0.08
            + (game_state.city_stats.social_tension / 100.0) * 0.05,
            0.02,
            0.14,
        )

        committed_voters = _clamp(1.0 - undecided_bloc - swing_voters, 0.55, 0.9)

        campaign_total = mayor_campaign + opposition_campaign
        media_total = mayor_media + opposition_media

        momentum_mayor = (
            (game_state.mayor_popularity / 100.0) * 0.45
            + (mayor_campaign / campaign_total) * 0.35
            + (mayor_media / media_total) * 0.2
        )
        momentum_mayor = _clamp(momentum_mayor, 0.3, 0.7)
        momentum_opposition = 1.0 - momentum_mayor

        mayor_share = committed_voters * mayor_base + (undecided_bloc + swing_voters) * momentum_mayor
        opposition_share = committed_voters * opposition_base + (undecided_bloc + swing_voters) * momentum_opposition

        total_share = mayor_share + opposition_share
        mayor_share = mayor_share / total_share
        opposition_share = opposition_share / total_share

        mayor_pct = mayor_share * 100.0
        opposition_pct = opposition_share * 100.0

        margin = abs(mayor_pct - opposition_pct)
        if margin <= 2.0:
            outcome = "Hung council"
            game_state.governing_party = "Coalition"
        elif mayor_pct > opposition_pct:
            if mayor_pct >= 52.0:
                outcome = "Mayor majority"
                game_state.governing_party = "Mayor"
            else:
                outcome = "Mayor-led coalition"
                game_state.governing_party = "Coalition"
        else:
            if opposition_pct >= 52.0:
                outcome = "Opposition majority"
                game_state.governing_party = "Opposition"
            else:
                outcome = "Opposition-led coalition"
                game_state.governing_party = "Coalition"

        result = ElectionResult(
            turn_number=game_state.turn_number,
            mayor_vote_share=mayor_pct,
            opposition_vote_share=opposition_pct,
            outcome=outcome,
            swing_voters=swing_voters,
            undecided_bloc=undecided_bloc,
        )
        game_state.election_results.append(result.as_dict())

        # Election outcomes immediately reshape the popularity baseline.
        game_state.mayor_popularity = mayor_pct
        game_state.opposition_popularity = opposition_pct

        game_state.campaign_strength["mayor"] = _clamp((mayor_campaign * 0.85) + 0.15, 0.6, 1.6)
        game_state.campaign_strength["opposition"] = _clamp((opposition_campaign * 0.85) + 0.15, 0.6, 1.6)

        return result

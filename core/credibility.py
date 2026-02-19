from __future__ import annotations

from typing import Any


def _clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def apply_credibility_turn(
    game_state: Any,
    mayor_policy: Any,
    pre_stats: dict[str, float],
    post_stats: dict[str, float],
) -> dict[str, float | int]:
    """Update promise ledger and credibility score for the current turn."""
    turn = game_state.turn_number
    ledger: list[dict[str, Any]] = game_state.promise_ledger

    new_promises = _register_promises(game_state, mayor_policy, pre_stats)

    delta = 0.0

    # Settle mature promises.
    for item in ledger:
        if item.get("resolved"):
            continue
        if int(item["due_turn"]) > turn:
            continue

        current = float(post_stats.get(item["stat_key"], pre_stats.get(item["stat_key"], 50.0)))
        target = float(item["target"]) 
        gap = max(0.0, target - current)

        if gap <= 0.5:
            item["resolved"] = True
            item["delivered"] = True
            item["observed"] = round(current, 2)
            delta += 0.9 * float(item["strength"])
        else:
            item["resolved"] = True
            item["delivered"] = False
            item["observed"] = round(current, 2)
            item["promise_gap"] = round(gap, 2)
            delta -= min(6.0, gap * 0.28 * float(item["strength"]))

    unresolved = [x for x in ledger if not x.get("resolved")]

    # Overpromise pressure when stacking large commitments.
    total_new_strength = sum(float(x["strength"]) for x in new_promises)
    if total_new_strength > 3.2:
        delta -= (total_new_strength - 3.2) * 0.8

    if len(unresolved) > 5:
        delta -= (len(unresolved) - 5) * 0.35

    delta = _clamp(delta, -8.0, 4.0)
    game_state.last_credibility_delta = round(delta, 3)
    game_state.credibility_score = round(_clamp(game_state.credibility_score + delta, 0.0, 100.0), 2)

    return {
        "credibility_delta": game_state.last_credibility_delta,
        "credibility_score": game_state.credibility_score,
        "new_promises": len(new_promises),
        "open_promises": len(unresolved),
    }


def _register_promises(
    game_state: Any,
    mayor_policy: Any,
    pre_stats: dict[str, float],
) -> list[dict[str, Any]]:
    effects = getattr(mayor_policy, "effects", {}) or {}
    positive = [(k, float(v)) for k, v in effects.items() if float(v) >= 2.0]
    positive.sort(key=lambda x: x[1], reverse=True)

    created: list[dict[str, Any]] = []
    for idx, (stat_key, effect) in enumerate(positive[:2]):
        baseline = float(pre_stats.get(stat_key, 50.0))
        promised_delta = min(10.0, effect * 1.25)
        target = _clamp(baseline + promised_delta, 0.0, 100.0)
        due_turn = min(game_state.total_turns, game_state.turn_number + 4)

        entry = {
            "id": f"p_{game_state.turn_number}_{idx}_{stat_key}",
            "turn_created": game_state.turn_number,
            "policy_name": getattr(mayor_policy, "name", "Mayor action"),
            "stat_key": stat_key,
            "baseline": round(baseline, 2),
            "target": round(target, 2),
            "due_turn": int(due_turn),
            "strength": round(max(0.7, min(2.2, effect / 4.0)), 3),
            "resolved": False,
            "delivered": None,
        }
        game_state.promise_ledger.append(entry)
        created.append(entry)

    return created

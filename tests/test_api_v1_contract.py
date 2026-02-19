from __future__ import annotations

import json
import threading
from http.server import ThreadingHTTPServer
from types import MethodType
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import pytest

from llm.dynamic_policy import DynamicPolicy
from server import GameHandler, _get_session, _sessions, _sessions_lock


def _http_json(method: str, url: str, payload: dict | None = None) -> tuple[int, dict]:
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {"Content-Type": "application/json"} if payload is not None else {}
    req = Request(url, data=body, headers=headers, method=method)
    try:
        with urlopen(req, timeout=30) as response:
            raw = response.read().decode("utf-8")
            return response.status, json.loads(raw) if raw else {}
    except HTTPError as exc:
        raw = exc.read().decode("utf-8")
        return exc.code, json.loads(raw) if raw else {}


def _http_text(url: str) -> tuple[int, str]:
    req = Request(url, method="GET")
    with urlopen(req, timeout=30) as response:
        return response.status, response.read().decode("utf-8")


@pytest.fixture()
def api_server() -> str:
    with _sessions_lock:
        _sessions.clear()

    server = ThreadingHTTPServer(("127.0.0.1", 0), GameHandler)
    host, port = server.server_address
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://{host}:{port}"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=3)
        with _sessions_lock:
            _sessions.clear()


def _install_stubbed_turn_flow(game_id: str) -> None:
    session = _get_session(game_id)
    assert session is not None, "session must exist"

    def fake_get_mayor_options(self) -> list[DynamicPolicy]:
        policy = DynamicPolicy(
            id="p1",
            name="Stub Policy",
            description="Deterministic policy for API contract tests.",
            effects={"economy": 1.0},
            group_effects=[],
            campaign_strength=1.0,
            media_effects={},
            rationale="Contract-only stub.",
            actor="mayor",
        )
        self._cached_mayor_options = {policy.id: policy}
        return [policy]

    def fake_stream_step(self, mayor_policy_id: str):
        if mayor_policy_id != "p1":
            yield {"type": "error", "message": f"Unknown policy id: {mayor_policy_id!r}"}
            return

        turn = self.game_state.turn_number + 1
        self.game_state.turn_number = turn

        policy = self._cached_mayor_options["p1"]
        yield {"type": "mayor_action", "turn": turn, "action": policy.to_dict()}
        yield {"type": "opposition_action", "turn": turn, "action": policy.to_dict()}
        yield {"type": "done", "turn": turn, "state": self._build_state_snapshot()}

    session.turn_manager.get_mayor_options = MethodType(fake_get_mayor_options, session.turn_manager)
    session.turn_manager.stream_step = MethodType(fake_stream_step, session.turn_manager)


def test_v1_create_game_and_state_contract(api_server: str) -> None:
    status, payload = _http_json("POST", f"{api_server}/v1/games", {"seed": 7, "turns": 5})
    assert status == 201
    assert payload["api_version"] == "v1"
    assert isinstance(payload["game_id"], str) and payload["game_id"]
    assert payload["state"]["turn_number"] == 0
    assert payload["state"]["total_turns"] == 5


def test_v1_policies_actions_and_events_stream(api_server: str) -> None:
    create_status, game_payload = _http_json("POST", f"{api_server}/v1/games", {"seed": 11, "turns": 5})
    assert create_status == 201
    game_id = game_payload["game_id"]
    _install_stubbed_turn_flow(game_id)

    policies_status, policies_payload = _http_json(
        "GET", f"{api_server}/v1/games/{game_id}/policies"
    )
    assert policies_status == 200
    assert [p["id"] for p in policies_payload["policies"]] == ["p1"]

    action_status, action_payload = _http_json(
        "POST",
        f"{api_server}/v1/games/{game_id}/actions",
        {
            "actor": "mayor",
            "policy_id": "p1",
            "expected_turn": 1,
            "action_id": "act-1",
        },
    )
    assert action_status == 202
    assert action_payload["status"] == "accepted"
    assert action_payload["turn_number"] == 1
    assert action_payload["action_id"] == "act-1"
    assert action_payload["idempotent_replay"] is False

    events_status, events_text = _http_text(
        f"{api_server}/v1/games/{game_id}/events?after_event_id=0&follow=0&timeout=5"
    )
    assert events_status == 200

    envelopes: list[dict] = []
    for line in events_text.splitlines():
        if not line.startswith("data: "):
            continue
        envelopes.append(json.loads(line[6:]))

    assert envelopes, "SSE endpoint should emit at least one event"
    assert envelopes[-1]["payload"]["type"] == "done"
    assert sorted(event["event_id"] for event in envelopes) == [event["event_id"] for event in envelopes]


def test_v1_expected_turn_conflict_and_idempotent_replay(api_server: str) -> None:
    create_status, game_payload = _http_json("POST", f"{api_server}/v1/games", {"seed": 13, "turns": 5})
    assert create_status == 201
    game_id = game_payload["game_id"]
    _install_stubbed_turn_flow(game_id)

    first_status, first_payload = _http_json(
        "POST",
        f"{api_server}/v1/games/{game_id}/actions",
        {
            "actor": "mayor",
            "policy_id": "p1",
            "expected_turn": 99,
            "action_id": "same-id",
        },
    )
    assert first_status == 409
    assert first_payload["error"] == "turn mismatch"
    assert first_payload["expected_turn"] == 1
    assert first_payload["provided_expected_turn"] == 99
    assert "idempotent_replay" not in first_payload

    replay_status, replay_payload = _http_json(
        "POST",
        f"{api_server}/v1/games/{game_id}/actions",
        {
            "actor": "mayor",
            "policy_id": "p1",
            "expected_turn": 99,
            "action_id": "same-id",
        },
    )
    assert replay_status == 409
    assert replay_payload["error"] == "turn mismatch"
    assert replay_payload["idempotent_replay"] is True


def test_v1_join_role_validation_and_participant_authorization(api_server: str) -> None:
    create_status, game_payload = _http_json("POST", f"{api_server}/v1/games", {"seed": 17, "turns": 5})
    assert create_status == 201
    game_id = game_payload["game_id"]
    _install_stubbed_turn_flow(game_id)

    bad_join_status, bad_join_payload = _http_json(
        "POST",
        f"{api_server}/v1/games/{game_id}/join",
        {"role": "random-role", "player_name": "bad"},
    )
    assert bad_join_status == 400
    assert "role must be one of" in bad_join_payload["error"]

    join_status, join_payload = _http_json(
        "POST",
        f"{api_server}/v1/games/{game_id}/join",
        {"role": "opposition", "player_name": "opp-user"},
    )
    assert join_status == 201
    participant_id = join_payload["participant_id"]

    action_status, action_payload = _http_json(
        "POST",
        f"{api_server}/v1/games/{game_id}/actions",
        {
            "actor": "mayor",
            "policy_id": "p1",
            "participant_id": participant_id,
            "expected_turn": 1,
            "action_id": "role-mismatch",
        },
    )
    assert action_status == 403
    assert action_payload["error"] == "participant role is not allowed to act as this actor"

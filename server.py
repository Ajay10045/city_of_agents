from __future__ import annotations

import json
import random
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from agents.agent_engine import AgentEngine
from agents.identity_group import IdentityGroup
from core.city_stats import CityStats
from core.game_state import GameState
from core.turn_manager import TurnManager
from events.event_engine import EventEngine
from media.media_engine import MediaEngine, MediaState
from politics.election_engine import ElectionEngine
from politics.policy_engine import PolicyEngine
from llm.llm_client import _load_env
_load_env()

ROOT = Path(__file__).resolve().parent
CONFIG_DIR = ROOT / "config"
UI_DIR = ROOT / "ui"

_turn_manager: TurnManager | None = None
_agent_engine: AgentEngine | None = None


def _load_identity_config(path: Path) -> tuple[list[IdentityGroup], dict[str, float], CityStats]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    groups = [IdentityGroup.from_dict(item) for item in payload.get("identity_groups", [])]
    role_distribution = {
        str(role): float(weight)
        for role, weight in payload.get("role_distribution", {}).items()
    }
    initial_city_stats = CityStats(**payload.get("initial_city_stats", {}))
    return groups, role_distribution, initial_city_stats


def _build_game(
    seed: int | None = None,
    turns: int = 50,
    election_turn: int = 50,
) -> tuple[TurnManager, AgentEngine]:
    if seed is None:
        seed = random.SystemRandom().randrange(1, 10**9)

    rng = random.Random(seed)
    identity_groups, role_distribution, city_stats = _load_identity_config(
        CONFIG_DIR / "identities.json"
    )

    agent_engine = AgentEngine()
    agents, relationships = agent_engine.initialize_population(
        identity_groups,
        rng,
        role_distribution=role_distribution,
        representatives_per_cell=6,
    )

    game_state = GameState(
        turn_number=0,
        total_turns=turns,
        election_turn=election_turn,
        mayor_popularity=50.0,
        opposition_popularity=50.0,
        city_stats=city_stats,
        identity_groups={g.id: g for g in identity_groups},
        agents=agents,
        relationships=relationships,
        active_events=[],
        media_state=MediaState(),
        rng=rng,
        rng_seed=seed,
    )

    policy_engine = PolicyEngine(CONFIG_DIR / "policies.json")
    event_engine = EventEngine(CONFIG_DIR / "events.json")
    media_engine = MediaEngine()
    election_engine = ElectionEngine()

    tm = TurnManager(
        game_state=game_state,
        agent_engine=agent_engine,
        policy_engine=policy_engine,
        event_engine=event_engine,
        media_engine=media_engine,
        election_engine=election_engine,
    )
    return tm, agent_engine


def _init_game(seed: int | None = None, turns: int = 50, election_turn: int = 50) -> None:
    global _turn_manager, _agent_engine
    _turn_manager, _agent_engine = _build_game(seed, turns, election_turn)


def _json_response(handler: BaseHTTPRequestHandler, data: dict, status: int = 200) -> None:
    body = json.dumps(data).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.end_headers()
    handler.wfile.write(body)


def _serve_file(handler: BaseHTTPRequestHandler, path: Path) -> None:
    if not path.exists():
        handler.send_response(404)
        handler.end_headers()
        return
    suffix = path.suffix.lower()
    content_types = {
        ".html": "text/html; charset=utf-8",
        ".css": "text/css",
        ".js": "application/javascript",
    }
    ct = content_types.get(suffix, "application/octet-stream")
    body = path.read_bytes()
    handler.send_response(200)
    handler.send_header("Content-Type", ct)
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


class GameHandler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: object) -> None:
        pass  # suppress default access log noise

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:
        path = self.path.split("?")[0]

        if path == "/" or path == "/index.html":
            _serve_file(self, UI_DIR / "index.html")
        elif path.startswith("/ui/"):
            relative = path[len("/ui/"):]
            _serve_file(self, UI_DIR / relative)
        elif path == "/api/state":
            self._handle_state()
        elif path == "/api/policies":
            self._handle_policies()
        elif path == "/api/turn-stream":
            self._handle_turn_stream()
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self) -> None:
        path = self.path.split("?")[0]
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length)) if length else {}

        if path == "/api/turn":
            self._handle_turn(body)
        elif path == "/api/new-game":
            self._handle_new_game(body)
        else:
            self.send_response(404)
            self.end_headers()

    def _handle_state(self) -> None:
        if _turn_manager is None:
            _json_response(self, {"error": "No game initialised"}, 500)
            return
        group_metrics = _agent_engine.group_metrics(_turn_manager.game_state.agents)
        snapshot = _turn_manager._build_state_snapshot(group_metrics)
        _json_response(self, snapshot)

    def _handle_policies(self) -> None:
        if _turn_manager is None:
            _json_response(self, {"error": "No game initialised"}, 500)
            return
        print("Generating mayor policy options via LLM...")
        options = _turn_manager.get_mayor_options()
        _json_response(self, {"policies": [p.to_dict() for p in options]})

    def _handle_turn(self, body: dict) -> None:
        if _turn_manager is None:
            _json_response(self, {"error": "No game initialised"}, 500)
            return
        policy_id = body.get("policy_id", "")
        if not policy_id:
            _json_response(self, {"error": "policy_id is required"}, 400)
            return
        try:
            result = _turn_manager.step(policy_id)
        except ValueError as exc:
            _json_response(self, {"error": str(exc)}, 400)
            return
        _json_response(self, result)

    def _handle_turn_stream(self) -> None:
        if _turn_manager is None:
            _json_response(self, {"error": "No game initialised"}, 500)
            return
        qs = parse_qs(urlparse(self.path).query)
        policy_id = qs.get("policy_id", [""])[0]
        if not policy_id:
            _json_response(self, {"error": "policy_id is required"}, 400)
            return

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

        try:
            for event in _turn_manager.stream_step(policy_id):
                msg = f"data: {json.dumps(event)}\n\n"
                self.wfile.write(msg.encode("utf-8"))
                self.wfile.flush()
        except Exception as exc:
            err = f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"
            self.wfile.write(err.encode("utf-8"))
            self.wfile.flush()

    def _handle_new_game(self, body: dict) -> None:
        seed = body.get("seed")
        turns = int(body.get("turns", 50))
        election_turn = int(body.get("election_turn", turns))
        election_turn = max(1, min(election_turn, turns))
        _init_game(seed=seed, turns=turns, election_turn=election_turn)
        group_metrics = _agent_engine.group_metrics(_turn_manager.game_state.agents)
        snapshot = _turn_manager._build_state_snapshot(group_metrics)
        _json_response(self, {"status": "ok", "state": snapshot})


def main() -> None:
    _init_game()
    port = 8000
    server = HTTPServer(("localhost", port), GameHandler)
    print(f"City of Agents server running at http://localhost:{port}")
    print("Press Ctrl+C to stop.\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")


if __name__ == "__main__":
    main()

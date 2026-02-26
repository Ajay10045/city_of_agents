"""Quick smoke test for the v2 agentic turn endpoint."""
import json
import sys
import requests

BASE = "http://localhost:8000"


def run():
    # 1. Profile
    print("1. Generating profile...")
    r = requests.post(f"{BASE}/game/profile", json={"city_hint": "Mumbai"})
    r.raise_for_status()
    profile = r.json()
    print(f"   City: {profile['city_name']}")

    # 2. New game
    print("2. Creating game...")
    r = requests.post(f"{BASE}/game/new", json={"city_profile": profile, "seed": 42})
    r.raise_for_status()
    d = r.json()
    game_id = d["game_id"]
    state = d["state"]
    print(f"   game_id: {game_id}")
    print(f"   Ministers: {len(state['ministers'])}")
    first_minister = state["ministers"][0]
    minister_id = first_minister["id"]
    print(f"   First minister: {first_minister['name']} (id: {minister_id})")

    # 3. Get policies
    print("3. Getting policies...")
    r = requests.get(f"{BASE}/game/{game_id}/policies")
    r.raise_for_status()
    d = r.json()
    print(f"   Got {len(d['options'])} policy options")
    print(f"   First policy: {d['options'][0]['name']}")

    # 4. Call v2 turn stream
    print("4. Calling v2 turn stream...")
    r = requests.post(
        f"{BASE}/game/{game_id}/turn/stream/v2",
        json={
            "policy_index": 0,
            "minister_id": minister_id,
            "minor_action": {"type": "governance_upkeep", "target": None, "budget": 0},
        },
        stream=True,
        timeout=180,
    )
    print(f"   Status: {r.status_code}")
    if r.status_code != 200:
        print(f"   Error body: {r.text[:500]}")
        sys.exit(1)

    event_count = 0
    for line in r.iter_lines():
        if line and line.startswith(b"data: "):
            event = json.loads(line[6:])
            event_type = event.get("type", "?")
            if event_type == "error":
                print(f"   ERROR: {event.get('message')}")
                sys.exit(1)
            elif event_type == "complete":
                print(f"   COMPLETE after {event_count} events")
                print(f"   Turn: {event.get('turn_result', {}).get('turn', '?')}")
                break
            else:
                print(f"   Event [{event_count}]: {event_type}")
                event_count += 1
                if event_count > 30:
                    print("   (stopping at 30 events)")
                    break

    print("Done.")


if __name__ == "__main__":
    run()

#!/usr/bin/env python3
"""matter-server health probe — reads NODE AVAILABILITY, not liveness.

WHY THIS EXISTS
  python-matter-server keeps answering HTTP 200 on /info, and its container
  keeps reporting "Up", long after it has given up on every Matter node. After
  a network outage it logs "Node considered offline, shutdown subscription"
  for each node and then never retries — the nodes stay dead until the
  container is restarted. A port check or a /info check would have shown "all
  green" for the entire 18h outage on 2026-08-12, so this probe asks the only
  question that actually distinguishes the two states: is any commissioned
  node currently available?

  Node state is exposed ONLY over the WebSocket API — /info is the sole HTTP
  endpoint — which is why this is a script and not a curl in the compose file.

  Having no nodes commissioned is not a failure (fresh install), and a single
  genuinely-dead device should not mark the server unhealthy. So: healthy =
  no nodes, or at least one available.

MODES
  (default)  exit 0 healthy / 1 unhealthy   -> docker healthcheck
  --report   print detail, always exit 0    -> humans, debugging

Consumed by matter-server/docker-compose.yml and scripts/matter-watchdog.sh.
"""

import argparse
import asyncio
import json
import os
import sys

import aiohttp

# Overridable only so the failure path can be tested against a stub server.
WS_URL = os.environ.get("MATTER_HEALTH_WS_URL", "http://127.0.0.1:5580/ws")
TIMEOUT = 15


async def _get_nodes():
    """Return the node list from the WS API. Raises on any failure."""
    async with aiohttp.ClientSession() as session:
        async with session.ws_connect(WS_URL) as ws:
            await ws.receive_json()  # server info banner
            await ws.send_json({"message_id": "health", "command": "get_nodes"})
            while True:
                msg = await ws.receive_json()
                # Subscription/event traffic shares the socket; ignore it.
                if msg.get("message_id") == "health":
                    return msg.get("result") or []


async def probe():
    """Return (ok, detail). Never raises."""
    try:
        nodes = await asyncio.wait_for(_get_nodes(), TIMEOUT)
    except Exception as err:
        return False, {"error": f"{type(err).__name__}: {err}"}

    available = [n.get("node_id") for n in nodes if n.get("available")]
    unavailable = [n.get("node_id") for n in nodes if not n.get("available")]
    ok = not nodes or bool(available)
    return ok, {"total": len(nodes), "available": available, "unavailable": unavailable}


def main():
    parser = argparse.ArgumentParser(description="matter-server health probe")
    parser.add_argument(
        "--report", action="store_true", help="print detail and always exit 0"
    )
    args = parser.parse_args()

    ok, detail = asyncio.run(probe())
    line = json.dumps({"ok": ok, **detail})

    if args.report:
        print(line)
        return 0
    if not ok:
        # Surfaced by `docker inspect --format '{{json .State.Health}}'` and
        # captured by the watchdog for its log / uptime-kuma message.
        print(line, file=sys.stderr)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())

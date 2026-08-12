# matter-watchdog

Self-heal + monitoring for **matter-server**, which fails silently and never
recovers on its own.

## What broke, and why this exists

After a network outage, `python-matter-server` logs
`Node considered offline, shutdown subscription` for every node — and then
**stops retrying permanently**. It emits no further log lines, even once the
network is back and the devices are advertising again. The container stays
`Up`, `restart: unless-stopped` never fires (nothing crashed), and
`http://<pi>:5580/info` keeps returning HTTP 200 the whole time. So every
surface-level check shows "all green" while every Matter entity in Home
Assistant is dead.

Observed 2026-08-12: an ~18h LAN outage left both nodes `available=False`; they
stayed that way for ~22h after the network recovered, until a single
`docker restart matter-server` brought them back in **10 seconds**.

Home Assistant's `apple_tv` integration does *not* share this flaw — it logs
`Connection was re-established` and recovers by itself. Matter is the outlier.

Detection therefore reads **node availability** over the WebSocket API, the one
signal that distinguishes wedged-from-healthy. Two dead ends worth recording:

- `/info` and the container state are useless — both green while nodes are dead.
- `avahi-browse _matter._tcp` is useless **on this host**: avahi runs with
  `use-ipv6=no` for the [CUPS fix](./printer-watchdog.md), and Matter
  operational records are IPv6. matter-server found both nodes on mDNS 2s after
  a restart that avahi could not see at all.

## What it checks (every 5 min)

1. Container running → if not, `docker start`.
2. `docker exec matter-server python3 /healthcheck.py` → healthy if **any**
   commissioned node reports `available` (no nodes at all = fresh install =
   healthy; one genuinely dead device shouldn't condemn the server).
3. On success, push `status=up` to the uptime-kuma Push monitor. If the script
   dies or stays unhealthy, heartbeats stop and uptime-kuma alerts.

### The restart is gated, deliberately

"No available nodes" has innocent causes, so a naive restart-on-red would churn
every 5 min through an outage and loop forever on a dead device. All four must
hold before it restarts:

| Gate | Why |
|---|---|
| zero available nodes | the actual symptom |
| default gateway answers | don't restart into a dead network |
| 3 consecutive runs (~15 min) | ride out transient blips |
| ≥1h since last restart | a dead device can't cause a restart loop |

Counters live in `matter-watchdog.state` (gitignored). After a restart it
re-probes once (30s) and reports the outcome to uptime-kuma either way.

## The container healthcheck

`matter-server/docker-compose.yml` runs the same probe as a Docker healthcheck,
so `docker ps` shows `(healthy)` / `(unhealthy)` instead of a bare `Up` that
tells you nothing. It is **reporting only** — nothing auto-restarts on it. The
watchdog owns remediation, because a healthcheck can't express the LAN gate or
the rate limit.

`healthcheck.py` is bind-mounted read-only. Editing it needs a recreate, not a
restart — single-file bind mounts pin the inode:

    docker compose up -d --force-recreate matter-server

Run it by hand any time:

    docker exec matter-server python3 /healthcheck.py --report
    # {"ok": true, "total": 2, "available": [1, 2], "unavailable": []}

## Install (on the Pi)

    # 1) uptime-kuma Push monitor: create one in the UI, copy its Push URL
    cp scripts/matter-watchdog.env.example scripts/matter-watchdog.env
    # edit scripts/matter-watchdog.env -> set KUMA_PUSH_URL

    # 2) systemd timer
    sudo cp scripts/matter-watchdog.service /etc/systemd/system/
    sudo cp scripts/matter-watchdog.timer   /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl enable --now matter-watchdog.timer

    # run once now / inspect
    sudo systemctl start matter-watchdog.service
    journalctl -u matter-watchdog.service -n 20 --no-pager
    tail scripts/matter-watchdog.log

`scripts/matter-watchdog.env` is local-only (gitignored) — it holds the Push
URL token. The systemd units are installed manually on the host, so they must
be re-installed on a rebuild (not covered by GitOps); the healthcheck half
*is* covered, since it lives in the compose file.

# printer-watchdog

Self-heal + monitoring for the host-networked **cups** container's Bonjour/mDNS
discovery.

## What broke, and why this exists

CUPS runs with `network_mode: host`. The host `avahi-daemon`, on default config,
advertised the printer (`PL70e-BT`) on **every** interface — `tailscale0`,
docker bridges, IPv6 — collided with its own cross-interface reflections, and
renamed the host `raspberrypi` → `raspberrypi-2` → `raspberrypi-3`. That
suffixed `.local` name stopped resolving, so clients could **discover** the
printer but not **connect** to it. CUPS itself answered HTTP 200 the entire time
— so a naive `:631` healthcheck would have shown "all green."

Permanent fix (already applied to the Pi, host file **not** in this repo):

    # /etc/avahi/avahi-daemon.conf
    allow-interfaces=eth0
    use-ipv6=no

This watchdog **re-asserts** that healthy state after churn (notably the nightly
Watchtower recreate of the cups container, which re-registers DNS-SD) and
**heartbeats uptime-kuma** so an unrecoverable failure pages us.

## What it checks (every 5 min)

1. CUPS answers for the queue on `:631` → if not, `docker restart cups`.
2. `raspberrypi.local` resolves (via mDNS) to eth0's IP → if not, restart
   `avahi-daemon`, then escalate to `docker restart cups` if still broken.
   This is the real symptom, checked with retries to avoid false restarts.
3. On success, push `status=up` to the uptime-kuma Push monitor. If the script
   dies or stays unhealthy, heartbeats stop and uptime-kuma alerts.

Advertised-interface list is logged for diagnostics but is **not** a restart
trigger (avoids flapping).

## Install (on the Pi)

    # 1) uptime-kuma Push monitor: create one in the UI, copy its Push URL
    cp scripts/printer-watchdog.env.example scripts/printer-watchdog.env
    # edit scripts/printer-watchdog.env -> set KUMA_PUSH_URL

    # 2) systemd timer
    sudo cp scripts/printer-watchdog.service /etc/systemd/system/
    sudo cp scripts/printer-watchdog.timer   /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl enable --now printer-watchdog.timer

    # run once now / inspect
    sudo systemctl start printer-watchdog.service
    journalctl -u printer-watchdog.service -n 20 --no-pager
    tail scripts/printer-watchdog.log

`scripts/printer-watchdog.env` is local-only (gitignored) — it holds the Push
URL token.

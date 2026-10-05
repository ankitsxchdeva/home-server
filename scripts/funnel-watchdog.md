# funnel-watchdog

Self-heal for the **Tailscale Funnel**, which wedges silently: every public
URL returns instant HTTP 499 while tailscaled logs nothing and the serve
config stays intact.

## What broke, and why this exists

Observed 2026-10-05 (tailscaled 1.102.2 and 1.102.4): the funnel wedged three
times in one day. Each time:

- `tailscale serve status` showed the mount, "Funnel on" — config intact.
- `journalctl -u tailscaled` showed nothing wrong (only routine IPv6 "major
  link change" rebinds near the wedges — suspected trigger, unproven).
- ssh/p2p tailnet traffic kept working; every *funnel* URL (all public
  services) returned instant 499, including hairpin requests from the Pi
  itself.
- `systemctl restart tailscaled` restored the funnel in seconds, every time.

Uptime-kuma (monitor: "Guest parking (public funnel)") sees the outage but
nothing on the host reacts. A wedged funnel kills every public service
(kalshi-pnl, lede, quantlab, guest parking), so detection + restart is
automated here.

## Detection and restart gates

The probe is a hairpin request to our own funnel URL
(`https://raspberrypi.tail9476fb.ts.net:10000/lede/healthz`): instant 499 when
wedged, 200 when healthy. Restart only when ALL hold:

1. funnel probe failed, 2 consecutive runs
2. default gateway answers (not a LAN outage)
3. the same backend answers over the tailnet (`rss.ankit.casa/healthz`) —
   isolates "funnel wedged" from "lede down"
4. no restart in the last 15 min

## Install (host state — not covered by GitOps)

```sh
sudo install -m755 ~/home-server/scripts/funnel-watchdog.sh /usr/local/sbin/funnel-watchdog.sh
sudo ln -sf ~/home-server/scripts/funnel-watchdog.service /etc/systemd/system/
sudo ln -sf ~/home-server/scripts/funnel-watchdog.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now funnel-watchdog.timer
journalctl -u funnel-watchdog.service -f   # watch it work
```

Note the `.service`/`.timer` run the script straight from the repo checkout —
GitOps pulls update it. Only the `/usr/local/sbin` copy is used if you edit
the unit's `ExecStart` to point there (default points at the repo).

Related: the funnel's other 2026-10-05 ghost was buffered requests dying at
exactly 60s on paths through a docker-published port (docker-proxy) — that one
is NOT this watchdog's wedge and restarting tailscaled does not fix it. See
quantlab/.env.example for that workaround.

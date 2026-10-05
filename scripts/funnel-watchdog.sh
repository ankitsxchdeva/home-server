#!/usr/bin/env bash
# Tailscale Funnel watchdog.
#
# WHY THIS EXISTS
#   tailscaled's funnel state wedges: the serve config stays intact
#   (`tailscale serve status` shows the mount, "Funnel on"), tailscaled logs
#   nothing wrong, ssh/p2p tailnet keeps working — but every public funnel
#   URL returns an instant HTTP 499. `systemctl restart tailscaled` revives
#   it every time. Seen 2026-10-05: three wedges in one day on tailscaled
#   1.102.2 AND 1.102.4; the Pi's journal shows recurring IPv6 "major link
#   change" rebinds around the wedges (suspected trigger, unproven).
#   Uptime-kuma only sees the public URL down; nothing on the host reacts.
#
# DETECTION reads the one signal that distinguishes wedged-from-healthy: a
#   hairpin request to our own funnel URL. When the funnel wedges, even the
#   Pi itself gets an instant 499 from tailscaled's serve listener; when
#   healthy it gets 200 in <1s. (Probe target: /lede/healthz — public,
#   cheap, no auth, always routed on the funnel front door.)
#
# RESTART IS GATED, because a failed probe has innocent causes:
#   * LAN/WAN outage       -> restarting fixes nothing, loops forever
#   * lede itself down     -> would restart tailscaled over an app problem
#   So tailscaled is restarted only when ALL hold:
#     1. the funnel probe failed
#     2. the default gateway answers (LAN is actually up)
#     3. the tailnet-side of the same backend answers (lede via rss.ankit.casa
#        over the tailnet — isolates "funnel wedged" from "lede down")
#     4. FAIL_THRESHOLD consecutive probe failures
#     5. no restart within MIN_RESTART_GAP seconds
#
# Runs as root via systemd timer (funnel-watchdog.service/.timer), every 2 min.

set -u
FUNNEL_URL="https://raspberrypi.tail9476fb.ts.net:10000/lede/healthz"
TAILNET_URL="https://rss.ankit.casa/healthz"
FAIL_THRESHOLD=2
MIN_RESTART_GAP=900
FAILS_FILE=/tmp/funnel-watchdog.fails
LAST_FILE=/tmp/funnel-watchdog.last-restart

funnel_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "$FUNNEL_URL" || echo 000)

if [ "$funnel_code" = "200" ]; then
  echo 0 > "$FAILS_FILE"
  echo "$(date -Is) ok ($funnel_code)"
  exit 0
fi

fails=$(( $(cat "$FAILS_FILE" 2>/dev/null || echo 0) + 1 ))
echo "$fails" > "$FAILS_FILE"
echo "$(date -Is) funnel probe failed ($funnel_code), consecutive: $fails"

[ "$fails" -lt "$FAIL_THRESHOLD" ] && exit 0

if ! ping -c1 -W2 "$(ip route show default | awk '{print $3; exit}')" >/dev/null 2>&1; then
  echo "$(date -Is) gateway unreachable (LAN outage?) — not restarting"
  exit 0
fi

tailnet_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "$TAILNET_URL" || echo 000)
if [ "$tailnet_code" != "200" ]; then
  echo "$(date -Is) tailnet probe also failed ($tailnet_code) — backend down, not the funnel; not restarting"
  exit 0
fi

if [ -f "$LAST_FILE" ] && [ $(( $(date +%s) - $(stat -c %Y "$LAST_FILE") )) -lt "$MIN_RESTART_GAP" ]; then
  echo "$(date -Is) in restart cooldown — skipping"
  exit 0
fi

echo "$(date -Is) funnel wedged (funnel=$funnel_code tailnet=$tailnet_code); restarting tailscaled"
touch "$LAST_FILE"
systemctl restart tailscaled

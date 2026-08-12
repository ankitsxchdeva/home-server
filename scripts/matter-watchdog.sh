#!/usr/bin/env bash
# matter-server watchdog + uptime-kuma heartbeat.
#
# WHY THIS EXISTS
#   python-matter-server gives up permanently. After a LAN outage it logs
#   "Node considered offline, shutdown subscription" for every node and then
#   stops retrying — no further log lines, ever, even once the network is back
#   and the devices are advertising again. Meanwhile the container still
#   reports "Up" and still answers HTTP 200 on /info, so nothing
#   surface-level looks wrong while every Matter entity in Home Assistant is
#   dead. Seen 2026-08-12: both nodes stayed unavailable for ~18h after the
#   network recovered; one `docker restart matter-server` fixed it in 10s.
#
#   Detection deliberately reads NODE AVAILABILITY over the WebSocket API,
#   because a /info or port check would have shown "all green" the whole time.
#   (avahi-browse is no help here either: this host runs avahi with
#   use-ipv6=no for the CUPS fix, and Matter operational records are IPv6.)
#
# RESTART IS GATED, because "no available nodes" has innocent causes:
#   * LAN outage            -> restarting fixes nothing, and we'd restart into
#                              a dead network every 5 min for the whole outage
#   * genuinely dead device -> restarting fixes nothing, would loop forever
#   So we restart only when ALL of these hold:
#     1. matter-server reports zero available nodes
#     2. the default gateway answers (the LAN is actually up)
#     3. that has held for FAIL_THRESHOLD consecutive runs
#     4. we have not already restarted within MIN_RESTART_GAP seconds
#
# Runs as root via systemd timer (matter-watchdog.service/.timer), every 5 min.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$SCRIPT_DIR/matter-watchdog.log"
ENV_FILE="$SCRIPT_DIR/matter-watchdog.env"
STATE_FILE="$SCRIPT_DIR/matter-watchdog.state"

# --- config ---------------------------------------------------------------
CONTAINER="matter-server"
PROBE="/healthcheck.py"   # bind-mounted in from matter-server/healthcheck.py
FAIL_THRESHOLD=3          # 3 x 5 min => ~15 min unavailable before acting
MIN_RESTART_GAP=3600      # at most one restart per hour
KUMA_PUSH_URL=""          # set in matter-watchdog.env (local-only, gitignored)

# shellcheck disable=SC1090
[ -f "$ENV_FILE" ] && . "$ENV_FILE"

# --- state (consecutive failures + last restart) --------------------------
fails=0
last_restart=0
# shellcheck disable=SC1090
[ -f "$STATE_FILE" ] && . "$STATE_FILE"
save_state() { printf 'fails=%s\nlast_restart=%s\n' "$fails" "$last_restart" >"$STATE_FILE"; }

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" | tee -a "$LOG_FILE" >&2; }

push_kuma() { # $1=up|down  $2=msg
  [ -n "$KUMA_PUSH_URL" ] || return 0
  curl -sf -m 5 -o /dev/null -G "$KUMA_PUSH_URL" \
    --data-urlencode "status=$1" --data-urlencode "msg=$2" || true
}

# --- health checks --------------------------------------------------------
# Default gateway, derived not hardcoded (matches printer-watchdog's lan_ip).
gateway() { ip -4 route show default | awk '{print $3; exit}'; }

# Is the LAN actually up? Distinguishes "matter-server is wedged" from
# "the network is down", which look identical from node state alone.
lan_up() {
  local gw
  gw="$(gateway)"
  [ -n "$gw" ] || return 1
  ping -c1 -W2 "$gw" >/dev/null 2>&1
}

# Ask matter-server whether ANY node is available. Runs the same probe the
# container healthcheck runs, so there is one definition of "healthy".
# Exit 0 = healthy. Detail (on failure) lands in $probe_detail for the log.
probe_detail=""
probe() { probe_detail="$(docker exec "$CONTAINER" python3 "$PROBE" 2>&1)"; }

# --- main -----------------------------------------------------------------

# 0) Is the container even running? (restart: unless-stopped should cover this)
if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  log "container '${CONTAINER}' is not running — starting it"
  docker start "$CONTAINER" >/dev/null 2>&1 || log "  docker start ${CONTAINER} FAILED"
  push_kuma down "container not running"
  exit 1
fi

# 1) Healthy? Reset and heartbeat.
if probe; then
  [ "$fails" -ne 0 ] && log "recovered — matter-server reports available nodes again"
  fails=0
  save_state
  push_kuma up "matter ok"
  exit 0
fi

# 2) Unhealthy, but don't blame matter-server for a dead network.
if ! lan_up; then
  log "no available nodes, but LAN is down (gw $(gateway) unreachable) — not restarting"
  push_kuma down "lan-down"
  exit 1
fi

# 3) Unhealthy with the LAN up — count it, act only once it persists.
fails=$((fails + 1))
log "no available Matter nodes (${fails}/${FAIL_THRESHOLD}): ${probe_detail}"

if [ "$fails" -lt "$FAIL_THRESHOLD" ]; then
  save_state
  push_kuma down "nodes unavailable (${fails}/${FAIL_THRESHOLD})"
  exit 1
fi

# 4) Rate limit, so a genuinely dead device can't cause a restart loop.
now="$(date +%s)"
since=$((now - last_restart))
if [ "$since" -lt "$MIN_RESTART_GAP" ]; then
  log "  restart suppressed — last restart was ${since}s ago (< ${MIN_RESTART_GAP}s)"
  save_state
  push_kuma down "unavailable, restart rate-limited"
  exit 1
fi

log "  restarting '${CONTAINER}' — no available nodes for ${fails} consecutive runs, LAN up"
docker restart "$CONTAINER" >/dev/null 2>&1 || log "  docker restart ${CONTAINER} FAILED"
last_restart="$now"
fails=0
save_state

# Nodes are rediscovered on mDNS within ~10s of a healthy restart; allow slack.
sleep 30
if probe; then
  log "  recovered after restart"
  push_kuma up "recovered after restart"
  exit 0
fi
log "UNHEALTHY after restart: ${probe_detail}"
push_kuma down "still unavailable after restart"
exit 1

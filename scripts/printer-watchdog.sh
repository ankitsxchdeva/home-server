#!/usr/bin/env bash
# Printer (CUPS/avahi) watchdog + uptime-kuma heartbeat.
#
# WHY THIS EXISTS
#   CUPS runs as a host-networked Docker container driving the USB Beeprt
#   printer (queue PL70e-BT). With host networking, the host avahi-daemon used
#   to advertise the printer on EVERY interface (tailscale0, docker bridges,
#   IPv6). avahi collided with its own cross-interface reflections, renamed the
#   host raspberrypi -> raspberrypi-2 -> raspberrypi-3, and that suffixed name
#   stopped resolving. Result: clients discovered the printer over Bonjour but
#   could not connect ("Unable to communicate with the printer"), even though
#   CUPS itself answered HTTP 200 the whole time.
#
#   The permanent fix is confining avahi to eth0 (allow-interfaces=eth0,
#   use-ipv6=no in /etc/avahi/avahi-daemon.conf). This watchdog RE-ASSERTS that
#   healthy state — mainly after the nightly Watchtower recreate of the cups
#   container re-registers DNS-SD — and heartbeats uptime-kuma so an
#   unrecoverable failure actually pages us instead of being found at print time.
#
#   Detection deliberately checks mDNS RESOLUTION, not HTTP 200, because a plain
#   :631 check would NOT have caught the real failure.
#
# Runs as root via systemd timer (printer-watchdog.service/.timer), every 5 min.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$SCRIPT_DIR/printer-watchdog.log"
ENV_FILE="$SCRIPT_DIR/printer-watchdog.env"

# --- config ---------------------------------------------------------------
QUEUE="PL70e-BT"     # CUPS queue / advertised printer name
IFACE="eth0"         # the only interface avahi should advertise on
CUPS_PORT=631
CONTAINER="cups"
KUMA_PUSH_URL=""     # set in printer-watchdog.env (local-only, gitignored)

# shellcheck disable=SC1090
[ -f "$ENV_FILE" ] && . "$ENV_FILE"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" | tee -a "$LOG_FILE" >&2; }

# eth0's current IP — DHCP-stable but not hardcoded.
lan_ip() { ip -4 -o addr show "$IFACE" 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | head -1; }

# --- health checks --------------------------------------------------------
# CUPS answers for the queue (one retry to ride out a transient blip).
cups_up() {
  curl -sf -m 5 -o /dev/null "http://127.0.0.1:${CUPS_PORT}/printers/${QUEUE}" && return 0
  sleep 2
  curl -sf -m 5 -o /dev/null "http://127.0.0.1:${CUPS_PORT}/printers/${QUEUE}"
}

# The box's own mDNS hostname must resolve, to this host's eth0 IP.
# This is THE symptom that broke — checked with retries to avoid false restarts.
mdns_ok() {
  local want ip
  want="$(lan_ip)"; [ -n "$want" ] || return 1
  for _ in 1 2 3; do
    ip="$(avahi-resolve-host-name -4 "$(hostname).local" 2>/dev/null | awk '{print $2}')"
    [ "$ip" = "$want" ] && return 0
    sleep 1
  done
  return 1
}

# Diagnostic only (logged, not a restart trigger): which interfaces advertise
# the printer. Healthy = "eth0" alone.
advert_ifaces() {
  timeout 6 avahi-browse -pt _ipp._tcp 2>/dev/null \
    | awk -F';' -v q="$QUEUE" 'index($0,q){print $2}' | sort -u | paste -sd, -
}

push_kuma() { # $1=up|down  $2=msg
  [ -n "$KUMA_PUSH_URL" ] || return 0
  curl -sf -m 5 -o /dev/null -G "$KUMA_PUSH_URL" \
    --data-urlencode "status=$1" --data-urlencode "msg=$2" || true
}

# --- main -----------------------------------------------------------------
problems=""

# 1) CUPS daemon reachable?
if ! cups_up; then
  log "CUPS not answering on :${CUPS_PORT} for ${QUEUE} — restarting container '${CONTAINER}'"
  docker restart "$CONTAINER" >/dev/null 2>&1 || log "  docker restart ${CONTAINER} FAILED"
  sleep 8
  cups_up || problems="cups-down "
fi

# 2) mDNS discovery healthy? (the recurring bug)
if ! mdns_ok; then
  log "mDNS unhealthy: $(hostname).local !-> $(lan_ip) (adverts on: $(advert_ifaces)) — restarting avahi-daemon"
  systemctl restart avahi-daemon
  sleep 5
  if ! mdns_ok; then
    log "  still unhealthy — nudging '${CONTAINER}' to re-register DNS-SD"
    docker restart "$CONTAINER" >/dev/null 2>&1 || log "  docker restart ${CONTAINER} FAILED"
    sleep 8
    mdns_ok || problems="${problems}mdns-broken "
  else
    log "  recovered after avahi restart (adverts on: $(advert_ifaces))"
  fi
fi

# 3) Report
if [ -z "$problems" ]; then
  push_kuma up "printer ok @ $(lan_ip), adverts:$(advert_ifaces)"
  exit 0
fi
log "UNHEALTHY after remediation: ${problems}"
push_kuma down "$problems"
exit 1

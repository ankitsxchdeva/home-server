#!/usr/bin/env bash
# GitOps deploy tick. Cron runs it every 5 min under flock (scripts/crontab.txt).
#
# Deploys when anything the stack builds from has moved: this repo's
# origin/main, or main of the nurv / quantlab app repos. The resolved app SHAs
# are exported as NURV_REF / QUANTLAB_REF, which their compose build contexts
# pin to — a moved branch is a new context URL, so BuildKit can't reuse a stale
# clone of #main (the 2026-08-29 quantlab bug).
#
# The deployed target is written to deploy.state only on success, so a failed
# build is retried (at most every 30 min, so a broken build can't keep the Pi
# busy) instead of waiting for the next commit. Every tick pushes up/down to an
# uptime-kuma push monitor (DEPLOY_PUSH_URL in scripts/deploy.env, local-only);
# kuma alerts on a down push or on silence.
set -uo pipefail

REPO=/home/ankit/home-server
STATE=$REPO/scripts/deploy.state
FAILED=$REPO/scripts/deploy.failed
DEPLOY_PUSH_URL=""
[ -f "$REPO/scripts/deploy.env" ] && . "$REPO/scripts/deploy.env"

cd "$REPO"
set -a; [ -f .env ] && . ./.env; set +a     # NURV_GH_PAT (private nurv repo)

log() { echo "$(date '+%F %T') $*"; }
push() { # $1=up|down  $2=msg
  [ -n "$DEPLOY_PUSH_URL" ] || return 0
  curl -sf -m 5 -o /dev/null -G "$DEPLOY_PUSH_URL" \
    --data-urlencode "status=$1" --data-urlencode "msg=$2" || true
}
fail() { log "FAIL: $1"; push down "$1"; exit 1; }

git fetch -q origin || fail "git fetch failed"
HOME_REF=$(git rev-parse origin/main)
NURV_REF=$(git ls-remote "https://x-access-token:${NURV_GH_PAT:-}@github.com/ankitsxchdeva/nurv.git" refs/heads/main | cut -f1)
QUANTLAB_REF=$(git ls-remote https://github.com/ankitsxchdeva/quantlab.git refs/heads/main | cut -f1)
[ -n "$NURV_REF" ] && [ -n "$QUANTLAB_REF" ] || fail "app repo ls-remote failed"
export NURV_REF QUANTLAB_REF
want="$HOME_REF $NURV_REF $QUANTLAB_REF"

if [ "$want" = "$(cat "$STATE" 2>/dev/null)" ]; then
  push up "deployed ${HOME_REF:0:7}"
  exit 0
fi
if [ "$want" = "$(cat "$FAILED" 2>/dev/null)" ] && [ -n "$(find "$FAILED" -mmin -30)" ]; then
  push down "deploy of ${HOME_REF:0:7} failed; retrying within 30 min"
  exit 1
fi

log "deploying home=${HOME_REF:0:7} nurv=${NURV_REF:0:7} quantlab=${QUANTLAB_REF:0:7}"
echo "$want" > "$FAILED"   # cleared below on success
git pull -q --ff-only origin main || fail "git pull failed"
docker compose up -d --build || fail "compose up failed (${HOME_REF:0:7})"
# Graceful reload: caddy --watch misses git's inode swap, so Caddyfile-only
# changes would otherwise never apply. A bad Caddyfile keeps the old config
# serving, but still fails the deploy so it gets noticed.
docker exec caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile \
  || fail "caddy reload failed (${HOME_REF:0:7})"

echo "$want" > "$STATE"
rm -f "$FAILED"
log "deployed ${HOME_REF:0:7}"
push up "deployed ${HOME_REF:0:7}"

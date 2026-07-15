#!/usr/bin/env bash
# Bundle everything a rebuilt Pi needs that git can't hold: secrets (.env files)
# and stateful container data. The repo is public, so none of this can be tracked.
#
# Run ON the Pi, as root (several data dirs are root-owned):
#
#   sudo ~/home-server/scripts/backup.sh [dest-dir]
#
# Writes home-server-backup-<date>.tar.gz to dest-dir (default /home/ankit/backups)
# and keeps the newest 4. Copy the tarball OFF the Pi — a backup that lives on the
# same SD card doesn't survive the card. Restore steps: see RESTORE.md.
#
# Databases (Home Assistant, uptime-kuma, netalertx) are copied hot, which is fine
# for these low-write workloads; for a guaranteed-consistent snapshot run
# `docker compose stop` first and `docker compose up -d` after.
set -euo pipefail

REPO=/home/ankit/home-server
DEST=${1:-/home/ankit/backups}
STAMP=$(date +%Y-%m-%d_%H%M)
OUT="$DEST/home-server-backup-$STAMP.tar.gz"

mkdir -p "$DEST"
cd "$REPO"

tar -czf "$OUT" \
  */.env \
  home-assistant/config \
  matter-server/data \
  uptime-kuma/data \
  reddit-swap-notifier/data \
  netalertx/db \
  cups/config

# Keep only the newest 4 backups
ls -1t "$DEST"/home-server-backup-*.tar.gz | tail -n +5 | xargs -r rm -f

ls -lh "$OUT"

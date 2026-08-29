#!/usr/bin/env bash
# Bundle everything a rebuilt Pi needs that git can't hold: secrets (.env files)
# and stateful container data. The repo is public, so none of this can be tracked.
#
# Run ON the Pi, as root (several data dirs are root-owned):
#
#   sudo ~/home-server/scripts/backup.sh [dest-dir]
#
# Writes home-server-backup-<date>.tar.gz to dest-dir (default /home/ankit/backups)
# and keeps the newest 4. Each run also pushes a copy to the Mac Studio
# (~/pi-backups, newest 12 kept) over the tailnet — a backup that lives only
# on the Pi's SD card doesn't survive the card. Restore steps: see RESTORE.md.
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
  rss-reader/data \
  netalertx/db \
  cups/config

# Keep only the newest 4 backups
ls -1t "$DEST"/home-server-backup-*.tar.gz | tail -n +5 | xargs -r rm -f

# Off-box copy: push to the Mac Studio over the tailnet. scp/ssh run as ankit
# (the account with SSH keys on the Studio; this script runs as root, and the
# tarball is 644). Failure leaves the local copy intact and only warns.
STUDIO_DIR=pi-backups
if sudo -u ankit ssh -o BatchMode=yes ankit@studio "mkdir -p ~/$STUDIO_DIR" \
  && sudo -u ankit scp -q -o BatchMode=yes "$OUT" "ankit@studio:~/$STUDIO_DIR/"; then
  echo "copied to studio:~/$STUDIO_DIR/"
  # Studio has the disk; keep a deeper rotation there (newest 12).
  sudo -u ankit ssh -o BatchMode=yes ankit@studio \
    "ls -1t ~/$STUDIO_DIR/home-server-backup-*.tar.gz | tail -n +13 | xargs rm -f"
else
  echo "WARN: Studio copy failed; only local copy exists: $OUT" >&2
fi

ls -lh "$OUT"

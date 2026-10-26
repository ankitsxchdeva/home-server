#!/usr/bin/env bash
# Daily logical backup of the nurv Postgres (users' accounts, stats, posts,
# DMs). The weekly backup.sh tarball also has it, but a week of user data is
# too much to lose, and this dump is ~50 KB.
#
# Run ON the Pi as ankit (docker group; no root needed). Cron: daily 03:30,
# see scripts/crontab.txt. Writes nurv-YYYY-MM-DD.sql.gz to ~/nurv-backups
# (newest 14 kept) and copies it to the Mac Studio (~/pi-backups/nurv,
# newest 60 kept). Restore: gunzip -c FILE | docker exec -i nurv-db psql -U nurv -d nurv
set -euo pipefail

DEST=/home/ankit/nurv-backups
OUT="$DEST/nurv-$(date +%F).sql.gz"

umask 077
mkdir -p "$DEST"
docker exec nurv-db pg_dump -U nurv -d nurv --clean --if-exists | gzip > "$OUT"

# Keep only the newest 14 locally.
ls -1t "$DEST"/nurv-*.sql.gz | tail -n +15 | xargs -r rm -f

# Off-box copy, same pattern as backup.sh: failure only warns.
STUDIO_DIR=pi-backups/nurv
if ssh -o BatchMode=yes ankit@studio "mkdir -p ~/$STUDIO_DIR" \
  && scp -q -o BatchMode=yes "$OUT" "ankit@studio:~/$STUDIO_DIR/"; then
  echo "copied to studio:~/$STUDIO_DIR/"
  ssh -o BatchMode=yes ankit@studio "ls -1t ~/$STUDIO_DIR/nurv-*.sql.gz | tail -n +61 | xargs rm -f"
else
  echo "WARN: Studio copy failed; only local copy exists: $OUT" >&2
fi

ls -lh "$OUT"

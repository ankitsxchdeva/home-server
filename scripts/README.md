# scripts/

Holds logs for scheduled jobs (see README "Automation & Scheduled Jobs").
The old homepage-ip-monitor lives in deprecated/homepage-ip-monitor/.

`crontab.txt` — versioned snapshot of the Pi user crontab (GitOps deploy + weekly
docker prune). Restore with `crontab scripts/crontab.txt`; re-export after edits.

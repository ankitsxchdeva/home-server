# scripts/

Holds logs for scheduled jobs (see README "Automation & Scheduled Jobs").
The old homepage-ip-monitor lives in deprecated/homepage-ip-monitor/.

`crontab.txt` — versioned snapshot of the Pi user crontab (GitOps deploy + weekly
docker prune). Restore with `crontab scripts/crontab.txt`; re-export after edits.

`docker-daemon.json` — versioned snapshot of the Pi's `/etc/docker/daemon.json`
(container log rotation). Restore with
`sudo cp scripts/docker-daemon.json /etc/docker/daemon.json && sudo systemctl restart docker`;
re-export after edits.

`backup.sh` — bundles what git can't hold (the repo is public): all `*/.env`
secrets plus stateful data (Home Assistant, Matter keys, uptime-kuma,
reddit-swap-notifier, NetAlertX, CUPS). Run on the Pi with sudo; copy the
tarball off the Pi. Full rebuild steps: [RESTORE.md](../RESTORE.md).

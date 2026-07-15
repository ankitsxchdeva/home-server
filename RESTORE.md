# Restore from scratch

Runbook: bare SD card → all services running. Everything not in this repo comes
from a backup tarball made by [`scripts/backup.sh`](./scripts/backup.sh)
(secrets + stateful data). Without a tarball the rebuild still works, but every
token gets re-entered by hand and every Zigbee/Matter device re-paired.

Reference system (last verified 2026-07-15): Raspberry Pi, Debian 12 (bookworm)
aarch64, docker-ce 29.6, docker-compose-plugin 5.3, tailscale 1.98.

## 1. Flash the OS

Raspberry Pi OS Lite (64-bit, bookworm). In the imager set:

- **hostname: `raspberrypi`** — keep this exact name. The Funnel URL
  (`raspberrypi.tail9476fb.ts.net`) is hardcoded into ankitsachdeva.com/lede.
- user: `ankit`
- enable SSH

## 2. Clone the repo

```bash
sudo apt update && sudo apt install -y git
git clone https://github.com/ankitsxchdeva/home-server.git ~/home-server
```

## 3. Docker

```bash
curl -fsSL https://get.docker.com | sh          # includes the compose plugin
sudo usermod -aG docker ankit                    # then re-login
sudo cp ~/home-server/scripts/docker-daemon.json /etc/docker/daemon.json
sudo systemctl restart docker
```

The daemon.json sets container log rotation — without it logs eventually fill
the SD card.

## 4. Tailscale

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --advertise-routes=192.168.1.0/24 --advertise-exit-node
sudo tailscale funnel --bg --https=8443 http://127.0.0.1:8000   # rss-reader → lede
```

Then in the [admin console](https://login.tailscale.com/admin/machines):

1. **Delete the old `raspberrypi` node first** — otherwise the new node comes up
   as `raspberrypi-1` and the Funnel URL (and lede) breaks.
2. Approve the subnet route (`192.168.1.0/24`) and exit node on the new node.
3. The new node gets a **new 100.x Tailscale IP** — update the unproxied
   `ankit.casa` and `*.ankit.casa` A records in Cloudflare DNS to point at it,
   or nothing behind Caddy resolves.

Verify: `tailscale serve status` shows Funnel on :8443 proxying to
`http://127.0.0.1:8000`.

## 5. Restore secrets + state

From the newest backup tarball (see `scripts/backup.sh` for what's in it):

```bash
sudo tar -xzf home-server-backup-<date>.tar.gz -C ~/home-server
```

This restores all `*/.env` files, Home Assistant config (users, `.storage`,
`zigbee.db` — Zigbee devices come back if the same USB coordinator is plugged
in), Matter fabric keys, uptime-kuma monitors, reddit-swap-notifier
subscriptions, NetAlertX history, and CUPS printers.

**No tarball?** Fall back to the Quick Start loop in [README.md](./README.md)
(`cp .env.example .env` per service) and re-enter every token; Zigbee/Matter
devices must be re-paired and printers re-added at https://cups.ankit.casa.

## 6. Cron + start everything

```bash
crontab ~/home-server/scripts/crontab.txt        # GitOps deploy + weekly prune
cd ~/home-server && docker compose up -d --build # first build takes a while on a Pi
```

## 7. Verify

- `docker compose ps` — everything Up
- https://ankit.casa loads (Caddy got its wildcard cert — needs a valid
  `CF_API_TOKEN` in `caddy/.env`)
- `curl -s http://127.0.0.1:8000/healthz` → `{"ok":true}`, and
  https://raspberrypi.tail9476fb.ts.net:8443 serves it publicly (lede works)
- Discord bots show online (commute-bot, autovrr, gform-image-embed,
  reddit-swap-notifier)
- Home Assistant at https://ha.ankit.casa with existing users/devices

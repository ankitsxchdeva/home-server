# Restore from scratch

Runbook: bare SD card → all services running. Everything not in this repo comes
from a backup tarball made by [`scripts/backup.sh`](./scripts/backup.sh)
(secrets + stateful data). Tarballs live in `/home/ankit/backups` on the Pi and
off-box at `~/pi-backups` on the Mac Studio (`scp ankit@studio:~/pi-backups/\*.tar.gz .`).
Without a tarball the rebuild still works, but every
token gets re-entered by hand and every Zigbee/Matter device re-paired.

Reference system (last verified 2026-07-15; packages as of 2026-10-31):
Raspberry Pi 5, Debian 12 (bookworm) aarch64, kernel 6.12.109, docker-ce 29,
tailscale 1.104. Tarball restore drilled 2026-10-31 (all SQLite DBs passed
`integrity_check`, nurv dump loaded clean).

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

## 3b. Host tuning (headless, memory cgroups, zram swap)

```bash
# Memory cgroups: the RPi kernel ships cgroup_disable=memory, so compose
# mem_limit is silently ignored without this (later flag wins). One line, append:
sudo sed -i '1 s/$/ cgroup_enable=memory cgroup_memory=1/' /boot/firmware/cmdline.txt
# Swap in compressed RAM instead of a swap file on the SD card
sudo apt install -y zram-tools
sudo sed -i -E 's/^#?ALGO=.*/ALGO=zstd/; s/^#?PERCENT=.*/PERCENT=25/' /etc/default/zramswap
sudo systemctl disable --now dphys-swapfile 2>/dev/null; sudo dphys-swapfile uninstall 2>/dev/null
# Headless (only if a Desktop image was flashed). Keep bluetooth: HA uses it.
sudo systemctl set-default multi-user.target
sudo systemctl disable lightdm ModemManager triggerhappy 2>/dev/null
sudo reboot
```

Verify: `grep -w memory /sys/fs/cgroup/cgroup.controllers` and
`cat /proc/swaps` shows only `/dev/zram0`.

## 4. Tailscale

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --advertise-routes=192.168.1.0/24 --advertise-exit-node
sudo tailscale funnel --bg --https=10000 http://127.0.0.1:8089  # → caddy: ALL public traffic
# This one static mount is the entire funnel config. Every public route
# (/ → kalshi-pnl, /lede → rss-reader, /quantlab → quantlab, the park page
# at $PARK_PUBLIC_PATH) lives in caddy/conf/Caddyfile's :8089 block. The park
# path is restored with caddy/.env from the backup tarball; without it the
# park route stays fail-closed and everything else works.
```

Then in the [admin console](https://login.tailscale.com/admin/machines):

1. **Delete the old `raspberrypi` node first** — otherwise the new node comes up
   as `raspberrypi-1` and the Funnel URL (and lede) breaks.
2. Approve the subnet route (`192.168.1.0/24`) and exit node on the new node.
3. The new node gets a **new 100.x Tailscale IP** — update the unproxied
   `ankit.casa` and `*.ankit.casa` A records in Cloudflare DNS to point at it,
   or nothing behind Caddy resolves.
4. **DNS tab** (admin console → DNS → Nameservers): add a global nameserver,
   Custom → the Pi's new 100.x IP, and enable **Override local DNS**. That is
   the entire tailnet DNS integration: every tailnet device resolves via
   AdGuard Home on the Pi (adguard.ankit.casa), router DHCP/RA never enters
   the DNS path, so the IPv6 leak is structuraly impossible. AdGuard's own
   config (admin password, upstreams, filters) restores from the backup
   tarball's `adguard/data/`; without it the container boots into the
   first-run wizard on :3000 (unpublished — reach it with
   `ssh -L 3000:localhost:3000` after temporarily publishing 3000, or drive
   `/control/install/configure` from the compose network).

Verify: `tailscale serve status` shows exactly one mount — Funnel :10000
proxying to `http://127.0.0.1:8089` (caddy).

## 5. Restore secrets + state

From the newest backup tarball (see `scripts/backup.sh` for what's in it):

```bash
sudo tar -xzf home-server-backup-<date>.tar.gz -C ~/home-server
```

This restores all `*/.env` files, Home Assistant config (users, `.storage`,
`zigbee.db` — Zigbee devices come back if the same USB coordinator is plugged
in), Matter fabric keys, uptime-kuma monitors, reddit-swap-notifier
subscriptions, NetAlertX history, and CUPS printers. SQLite DBs appear twice
in the tarball (live copy, then a consistent snapshot); plain `tar -x` keeps
the later one, which is what you want. Not in it, by design: AdGuard's query
log + filter lists and Open WebUI's model cache (regenerated on start).

Not in the tarball either — restore by hand:

- `kalshi-pnl/kalshi_private_key.pem` — scp from wherever you keep it
  (gitignored; the Kalshi dashboard can issue a new one).
- `scripts/*.env` push-URL files (`deploy.env`, `backup.env`,
  `matter-watchdog.env`, `printer-watchdog.env`) — one uptime-kuma push
  monitor each; the restored kuma DB still has the monitors, so copy each
  Push URL back out of https://kuma.ankit.casa. Without them everything works,
  just without heartbeats.
- A fresher nurv db than the weekly tarball: daily dumps live in
  `~/nurv-backups` (gone with the SD card) and on the Studio at
  `~/pi-backups/nurv/` — `gunzip -c nurv-<date>.sql.gz | docker exec -i nurv-db psql -U nurv -d nurv`.

The nurv Postgres comes back as a SQL dump at `nurv/db-dump.sql` (gitignored).
Once the stack is up (step 6), load it over the freshly seeded volume, then
delete it — it holds every user's data:

```bash
docker exec -i nurv-db psql -U nurv -d nurv < ~/home-server/nurv/db-dump.sql
rm ~/home-server/nurv/db-dump.sql
```

**No tarball?** Fall back to the Quick Start loop in [README.md](./README.md)
(`cp .env.example .env` per service) and re-enter every token; Zigbee/Matter
devices must be re-paired and printers re-added at https://cups.ankit.casa.

## 6. Cron, watchdogs + start everything

```bash
crontab ~/home-server/scripts/crontab.txt        # deploy tick, prune, backups
~/home-server/scripts/deploy.sh                  # first full build; takes a while on a Pi
```

Then install the three host watchdogs (systemd units, not Docker), following
each one's runbook: [`scripts/printer-watchdog.md`](./scripts/printer-watchdog.md),
[`scripts/matter-watchdog.md`](./scripts/matter-watchdog.md),
[`scripts/funnel-watchdog.md`](./scripts/funnel-watchdog.md). Verify with
`systemctl list-timers '*watchdog*'`.

## 7. Verify

- `docker compose ps` — everything Up
- https://ankit.casa loads (Caddy got its wildcard cert — needs a valid
  `CF_API_TOKEN` in `caddy/.env`)
- `curl -s http://127.0.0.1:8089/lede/healthz` → `{"ok":true}` (through the
  caddy funnel listener), and https://raspberrypi.tail9476fb.ts.net:10000/lede/data.json
  serves it publicly (lede works)
- Discord bots show online (commute-bot, autovrr, gform-image-embed,
  reddit-swap-notifier)
- Home Assistant at https://ha.ankit.casa with existing users/devices

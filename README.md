
# Home Server

A complete home server setup running on Raspberry Pi with Docker containers.

## Services

### Home Automation
- **[Home Assistant](./home-assistant/)** - Home automation hub (port 8123, host network)
- **[Matter Server](./matter-server/)** - Matter protocol bridge (internal)

### Dashboard & Monitoring
- **[Homepage](./homepage/)** - Dashboard (port 3000)
- **[Uptime Kuma](./uptime-kuma/)** - Service monitoring (port 3001)
- **[Glances](./glances/)** - System resource monitoring (port 61208)
- **[Dozzle](./dozzle/)** - Container log viewer (port 8080, https://logs.ankit.casa)

### Network
- **[NetAlertX](./netalertx/)** - Network device scanner (port 20211, host network)

### Services
- **[Caddy](./caddy/)** - HTTPS reverse proxy for ankit.casa + *.ankit.casa (ports 80/443; wildcard Let's Encrypt cert via Cloudflare DNS-01, built from the official image with xcaddy)
- **[CUPS](./cups/)** - Print server (port 631, host network)
- **[13ft](./13ft/)** - Paywall bypass reader proxy (port 5001)
- **[RSS Reader](./rss-reader/)** - RSS digest service for lede (port 8000, JSON API; served publicly via Tailscale Funnel :8443 for ankitsachdeva.com/lede)

### Discord Bots
- **[Commute Bot](./commute-bot/)** - Commute time lookup via Google Maps
- **[AutoVRR](./autovrr/)** - Visitor parking registration automation
- **[Google Form Image Embed](./gform-image-embed/)** - Replies with images extracted from Google Forms links
- **[Reddit Swap Notifier](./reddit-swap-notifier/)** - Pings you on Discord when new swap-subreddit posts match your keywords

### Deprecated
Retired services live in [`deprecated/`](./deprecated/) and are excluded from the main compose file:
- **Pi-hole** - was never used as a DNS server by any LAN client
- **Traefik** - reverse proxy; only ever routed the wg-easy UI, otherwise served internet scanners
- **wg-easy (WireGuard)** - never worked externally: UDP 51820 was not forwarded and `vpn.ankit.casa` was Cloudflare-proxied (Cloudflare doesn't carry WireGuard UDP). Replaced by Tailscale.

## Remote Access (Tailscale)

The Pi is on the tailnet (`raspberrypi`, MagicDNS enabled) and is configured as:
- **Subnet router** advertising `192.168.1.0/24` - remote devices on the tailnet can reach the whole LAN
- **Exit node** (optional full-tunnel routing)

Subnet routes / exit node must be approved in the Tailscale admin console after (re)advertising. A Tailscale Funnel publicly serves the rss-reader on https://raspberrypi.tail9476fb.ts.net:8443 — it feeds ankitsachdeva.com/lede (github.com/ankitsxchdeva/lede), so do not remove it. Port 443 belongs to Caddy.

`ankit.casa` and `*.ankit.casa` resolve (unproxied Cloudflare DNS) to the Pi's Tailscale IP, so every URL below works from any tailnet device anywhere, with a real Let's Encrypt certificate, and is unreachable from the public internet.

## Automation & Scheduled Jobs

| Job | Schedule | What it does |
|---|---|---|
| GitOps deploy (`crontab -l`) | every 5 min | `git fetch`; if `origin/main` changed: `git pull && docker compose up -d --build`. Push to main = deploy. |
| Docker prune (`crontab -l`) | Sun 04:30 | `docker system prune -af --filter "until=168h"` — clears week-old unused images and build cache from GitOps builds |
| Watchtower | daily ~04:00 UTC | Auto-pulls new images and recreates containers (skips locally-built images). Runs the maintained fork `nickfedor/watchtower` (original containrrr project is unmaintained). |

Retired 2026-07-11: the Cloudflare DDNS cron and the homepage IP-monitor timer (both in `deprecated/`) — both obsolete now that the dashboard links use the stable Tailscale IP and nothing is served over the public internet.

## Quick Start

1. **Setup environment files:**
   ```bash
   cd home-server
   # Copy and configure .env files for each service
   for dir in caddy homepage home-assistant glances netalertx cups rss-reader commute-bot autovrr gform-image-embed reddit-swap-notifier; do
     cp $dir/.env.example $dir/.env
   done
   # Edit each .env with your actual values
   # (caddy/.env needs a real Cloudflare API token or the wildcard cert can't issue)
   ```

2. **Start all services:**
   ```bash
   docker compose up -d
   ```

3. **Stop all services:**
   ```bash
   docker compose down
   ```

4. **Start a single service:**
   ```bash
   docker compose up -d <service-name>
   # e.g.: docker compose up -d homepage
   ```

## Access URLs

All served HTTPS by Caddy (http redirects to https):

- **Dashboard**: https://ankit.casa
- **Home Assistant**: https://ha.ankit.casa
- **Uptime Kuma**: https://kuma.ankit.casa
- **Glances**: https://glances.ankit.casa
- **NetAlertX**: https://netalertx.ankit.casa
- **CUPS Print Server**: https://cups.ankit.casa
- **13ft Reader**: https://13ft.ankit.casa
- **RSS Reader**: https://rss.ankit.casa/docs (JSON API; Swagger UI)
- **Dozzle**: https://logs.ankit.casa

Direct `http://<pi>:<port>` access still works on the LAN/tailnet (3000, 8123, 3001, 61208, 20211, 631, 5001, 8000, 8080).

# AGENTS.md — agent context for this repo

Human-facing docs: [README.md](./README.md) (services, URLs, automation), [RESTORE.md](./RESTORE.md) (rebuild runbook). This file is the working context for AI agents.

## Deployment model (most important)

- This checkout is a **copy on a Mac**. The live system is a **Raspberry Pi** (`raspberrypi`, user `ankit`, `~/home-server`) — nothing you run here touches it.
- **Deploy = push to `main`.** A cron on the Pi (`scripts/crontab.txt`) runs every 5 min: `git fetch`, and if `origin/main` changed, `git pull && docker compose up -d --build`.
- A broken compose file on `main` breaks the running stack on the next tick. CI (`.github/workflows/validate-compose.yml`) runs `docker compose config -q` on every push — keep it green. Locally: `find . -name docker-compose.yml -execdir touch .env \; && docker compose config -q` (compose files require `env_file: .env`, which is gitignored).
- Never commit secrets. Repo is **public**; all secrets live in gitignored `*/.env` files + `scripts/backup.sh` tarballs (the Kalshi private key is scp'd by hand — `kalshi-pnl/.gitignore` covers it). Don't add new secret-looking files without checking `.gitignore`.

## What's NOT in git (host state on the Pi)

Changes to these are invisible to GitOps and must be re-applied on rebuild (RESTORE.md):

1. **Tailscale Funnel mounts** — `:8443` → rss-reader (lede), `:10000` → kalshi-pnl at `/` + quantlab at `/quantlab` + the park page at an unguessable path (all prefixes stripped). Never remove any of them.
2. **systemd watchdogs** — printer-watchdog and matter-watchdog (`scripts/*watchdog.*`, install instructions in the matching `.md`).
3. **Crontab** and **`/etc/docker/daemon.json`** — versioned snapshots live in `scripts/`; after changing the live ones, re-export into `scripts/`.
4. **Secrets/state** — restored only from `scripts/backup.sh` tarballs.

## Hard constraints

- Funnel supports only ports **443, 8443, 10000**. 8443 and 10000 are taken; **443 can never be funneled** (Caddy binds `0.0.0.0:443`). New public exposure ⇒ path-mount onto an existing funnel port (see README for the exact command). 
- Caddy serves `ankit.casa` / `*.ankit.casa` (DNS → Tailscale IP, tailnet-only) with a wildcard LE cert via Cloudflare DNS-01 (`caddy/.env` `CF_API_TOKEN`).
- Ollama runs **natively on the Mac Studio** (Metal GPU — not on the Pi, never in Mac Docker). Caddy proxies `ollama.ankit.casa` → `{$OLLAMA_UPSTREAM}` = the Studio's Tailscale IP:11434, set in the Pi's `caddy/.env`. Setup/runbook: the `studio-llm` repo.
- GitOps builds run **on the Pi** (aarch64, slow) — keep Dockerfiles lean.

## Repo layout

- One directory per service, each with its own `docker-compose.yml`, `Dockerfile` (if built), `.env.example`; root `docker-compose.yml` only `include:`s them. New service = new dir + one include line + README entry.
- `deprecated/` is excluded from the compose file.
- Active vs. retired services, ports, and URLs are all in README.md — read it before adding anything.

## Service conventions

- **Env:** container config comes from the service's gitignored `.env` via `env_file:` (or literal `environment:` values). **Never `${VAR}`-interpolate a secret in a compose file** — interpolation reads the *root* `.env` (empty by design), and `environment: - X=${X}` silently shadows a good `env_file` value with `""`. This exact bug lived in cups/homepage for months (fixed 2026-08-30). TZ lives in each service's `.env`.
- **Exposure — pick exactly one:** (1) internal → no ports, no route; (2) tailnet UI → Caddy vhost by container name, no published port; (3) public → keep a published port and path-mount onto funnel :10000 (host state; recreate command documented in the service); (4) needs LAN broadcast/mDNS → host network, Caddy routes via `{$LAN_IP}` in the Caddyfile. Any published host port needs a justifying comment; bind `127.0.0.1:` when only host processes consume it (e.g. uptime-kuma 3001 for the watchdogs).

## Verification

- You can't run the stack here meaningfully (ARM Pi services, missing `.env`s, host network). Verify by: `docker compose config -q` (with placeholder `.env`s), CI green, and per-service `python -m py_compile` / syntax checks where applicable.
- Real verification happens on the Pi after deploy: `docker compose ps`, `https://<service>.ankit.casa`, Dozzle logs.

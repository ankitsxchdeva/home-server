# Nurv (deploy config)

Pre-CRNA platform (school matching, application tracker, CCRN prep,
community). **App code lives in [ankitsxchdeva/nurv](https://github.com/ankitsxchdeva/nurv)** —
this directory is deploy config only (same pattern as rss-reader/quantlab):
compose builds the `db`, `api`, and `web` images straight from the app
repo's `main` branch.

## Exposure

- **Primary:** Cloudflare. Frontend = `nurv` Worker (OpenNext) at
  `nurv.space`, proxying `/api/*` to `api.nurv.space`; API reaches the
  `api` container through the `tunnel` service (cloudflared,
  `TUNNEL_TOKEN` in `.env`).
- **Fallback:** funnel `:10000` → caddy `:8089`, Caddyfile
  `handle /anesthesia*` → `anesthesia-web:3000` (no prefix strip; app
  serves under basePath `/anesthesia`). Retire after cutover is verified.

## Secrets

`.env` (gitignored) must exist on the Pi with:
`POSTGRES_PASSWORD`, `JWT_SECRET`, `TZ`, `TUNNEL_TOKEN`.

The app repo is PRIVATE, so the build contexts read a GitHub token from
`NURV_GH_PAT` in the ROOT `~/home-server/.env` (compose env interpolation
does not read service env_files). Token = a `repo`-scoped gh credential,
living only in the Pi's gitignored env files and gitconfigs.

## Rename continuity

Deployed through the root compose `include:` (project `home-server`), so the
live volume is `home-server_db-data`. Container names (`anesthesia-db` etc.)
and db credentials (`anesthesia`) intentionally stay unchanged across the
nurv rename. The nurv schema lands via `db/migrations/001_nurv.sql` in the
app repo — apply once, manually:

```
ssh ankit@100.109.7.124 'docker exec -i anesthesia-db psql -U anesthesia -d anesthesia' < db/migrations/001_nurv.sql
```

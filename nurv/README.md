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
- Nothing else routes to these containers (no caddy route, no published
  ports).

## Secrets

`.env` (gitignored) must exist on the Pi with:
`POSTGRES_PASSWORD`, `JWT_SECRET`, `TZ`, `TUNNEL_TOKEN`, plus
`RESEND_API_KEY` and `EMAIL_FROM` — without them password-reset emails are
never sent. See `.env.example`.

## Backups

`scripts/backup.sh` (weekly cron) includes a `pg_dump` of this db as
`nurv/db-dump.sql` in the tarball; restore steps in `RESTORE.md`.

The app repo is PRIVATE, so the build contexts read a GitHub token from
`NURV_GH_PAT` in the ROOT `~/home-server/.env` (compose env interpolation
does not read service env_files). Token = a `repo`-scoped gh credential,
living only in the Pi's gitignored env files and gitconfigs.

## Database and migrations

Deployed through the root compose `include:` (project `home-server`), so the
live volume is `home-server_db-data`. Schema changes land via
`db/migrations/NNN_*.sql` in the app repo — schema.sql only runs on a fresh
volume, so apply each new migration once, manually, in order, from the app
repo:

```
ssh ankit@100.109.7.124 'docker exec -i nurv-db psql -U nurv -d nurv' < db/migrations/NNN_name.sql
```

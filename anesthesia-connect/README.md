# Anesthesia Connect (deploy config)

CRNA community/learning MVP. **App code lives in
[ankitsxchdeva/anesthesia-connect](https://github.com/ankitsxchdeva/anesthesia-connect)** —
this directory is deploy config only (same pattern as rss-reader/quantlab):
compose builds the `db`, `api`, and `web` images straight from the app
repo's `main` branch.

## Exposure

Public via funnel `:10000` → caddy `:8089`, Caddyfile `handle /anesthesia*`
→ `anesthesia-web:3000`. **No prefix strip** — the Next.js app serves under
basePath `/anesthesia` (baked at build time via the `BASE_PATH` build arg),
and the web service proxies `/anesthesia/api/*` to `api:4000` internally, so
one public route covers app + API.

## Secrets

`.env` (gitignored) must exist on the Pi with:
`POSTGRES_PASSWORD`, `JWT_SECRET`, `TZ`. See `.env.example`.

## Updating after app changes

A push to the app repo does NOT redeploy on its own — the GitOps cron only
rebuilds when THIS repo changes. On the Pi:

```
docker compose build --no-cache db api web && docker compose up -d
```

(plain `--build` reuses BuildKit's cached git clone of `#main` and ships
stale code.)

First deploy note: the `web` image builds Next.js on the Pi (aarch64) —
expect the first build to take several minutes.

# rss-reader

Backend for [lede](https://github.com/ankitsxchdeva/lede) — a personal news
digest. One container that:

- rebuilds `data/data.json` from `feeds.yaml` every `POLL_INTERVAL_SECONDS`
  (feeds + scraped sites, deduped, newest first, trimmed to `DAYS_KEPT` days)
- serves `GET /data.json` (with CORS for the Pages frontend) and `GET /healthz`
  on port 8000

Tailscale Funnel exposes port 8000 publicly; the static frontend at
`ankitsachdeva.com/lede/` fetches `data.json` from there.

## Adding a source

Edit `feeds.yaml` (bind-mounted; no rebuild needed):

```yaml
  - name: Some Blog
    url: https://example.com     # a feed URL, or a page — discovery finds the feed
```

A genuinely feedless site gets a small module in `scrapers/` returning
`{title, url, published?, summary?}` dicts, referenced by `scrape: module_name`.

## Run

```bash
cp .env.example .env   # defaults are fine
docker compose up -d --build
curl localhost:8000/healthz
```

A failing source is reported as `ok: false` in `data.json` and keeps its last
good items; it never fails the whole build.

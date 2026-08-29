# rss-reader

Backend for [lede](https://github.com/ankitsxchdeva/lede) — a personal news
digest. One container that:

- rebuilds `data/data.json` from `feeds.yaml` every `POLL_INTERVAL_SECONDS`
  (feeds + scraped sites, deduped, newest first, trimmed to items published
  since midnight in `DIGEST_TZ`)
- serves `GET /data.json` (with CORS for the Pages frontend) and `GET /healthz`
  on port 8000

Tailscale Funnel (`:10000`) proxies to caddy's localhost listener (`:8089`),
where the `/lede` route serves this container publicly (prefix stripped);
the static frontend at `ankitsachdeva.com/lede/` fetches `data.json` from there.

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
curl localhost:8089/lede/healthz   # through the caddy funnel listener (no host port on 8000)
```

A failing source is reported as `ok: false` in `data.json` and keeps its last
good items; it never fails the whole build.

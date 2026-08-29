# rss-reader

Deploy config for the **lede** digest API. App code and image CI live in
[ankitsxchdeva/lede](https://github.com/ankitsxchdeva/lede) (`backend/`) —
this dir is compose + secrets + live-editable config only.

- Image: `ghcr.io/ankitsxchdeva/lede-backend:latest` (linux/arm64, built by
  lede CI on push to main)
- `feeds.yaml` — source list, bind-mounted; edit live, the next build cycle
  picks it up
- `.env.example` — every knob; the real `.env` is gitignored (`OLLAMA_*`)
  and covered by `scripts/backup.sh`
- `data/` — digest output + `saved.db` read-later state (gitignored)

## Reachable at

- https://rss.ankit.casa — tailnet, via Caddy
- https://raspberrypi.tail9476fb.ts.net:10000/lede — **PUBLIC**, via Funnel →
  Caddy (`/lede` route, prefix stripped)

Container serves `GET /data.json`, `GET /items?days=7` (week archive), and
`/healthz` on port 8000 — a read-only API. The saved/read-later list is
browser-local in the lede frontend (CSV export built in), so there are no
write endpoints and no shared secret.

## Deploys

- **Config changes** (this dir): push to `main` — the GitOps cron recreates
  the container.
- **App changes** (lede repo): push to `main` there → CI builds the image →
  watchtower pulls it (daily 04:00), or immediately on the Pi with
  `docker compose pull rss-reader && docker compose up -d rss-reader`.

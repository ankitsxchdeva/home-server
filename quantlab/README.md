# quantlab

Backtest API for [ankitsxchdeva/quantlab](https://github.com/ankitsxchdeva/quantlab).
Serves `POST /api/run` (LLM-compiled strategy -> backtest) and `POST /api/arb`
(Kalshi multi-leg parlay scan).

The UI is a static export on GitHub Pages at
https://ankitsachdeva.com/quantlab/ and calls this box for everything.
Pages can only serve static files, so the split is: UI there, compute here.

## Reachable at

- https://quantlab.ankit.casa — tailnet, via Caddy. Serves the full UI too.
- https://raspberrypi.tail9476fb.ts.net:10000/quantlab — **PUBLIC**, via Funnel → Caddy.

## Ports

No published host port — Caddy proxies to container port `3000` on the
bridge network.

## Public routing (Caddyfile — in git, not host state)

Funnel has no free ports: it supports only 443, 8443 and 10000; 8443 and 10000
are taken, and 443 cannot be funneled because Caddy binds `0.0.0.0:443`. So
quantlab shares the :10000 funnel via a **route in the Caddyfile's `:8089`
block** (funnel :10000 → `127.0.0.1:8089` → caddy):

```
handle_path /quantlab* {
	reverse_proxy quantlab:3000
}
```

`/` on :10000 stays kalshi-pnl; `/quantlab` is this service. `handle_path`
strips the prefix, so the container sees `/api/run` rather than
`/quantlab/api/run` — no basePath is needed on the server side.

The funnel mounts themselves are two static lines in tailscaled (on a rebuild,
re-run the two commands in RESTORE.md). Breaking the :10000 funnel breaks
ankitsachdeva.com/kalshi too. Check both after touching it.

## Secrets

None. LLM keys are entered in the browser and forwarded per-request, never
stored; Kalshi market data is public.

## Deploys

The GitOps cron only rebuilds when **this** repo changes, and the image is built
from the quantlab repo's `main`. So pushing to quantlab does not redeploy it.
After an app change:

```bash
docker compose up -d --build quantlab
```

## Abuse surface

`/api/run` is public and makes outbound calls (LLM provider, Yahoo Finance) on
the caller's behalf using a key the caller supplies. It stores nothing. Bounds
are the per-IP rate limits in the app: 10/min on `/api/run`, 6/min on
`/api/arb`. CORS is pinned to the Pages origin, which constrains other
websites' JavaScript but not curl.

Worth knowing: Funnel bandwidth is shared with kalshi-pnl on this port, so
sustained abuse here degrades ankitsachdeva.com/kalshi as well.

## Run

```bash
docker compose up -d --build quantlab
curl -X POST https://raspberrypi.tail9476fb.ts.net:10000/quantlab/api/arb \
  -H 'content-type: application/json' \
  -d '{"mode":"scan","maxPages":1}'
```

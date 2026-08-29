# kalshi-pnl

Lifetime Kalshi profit/loss as one number. Mirrors
[ankitsxchdeva/kalshi](https://github.com/ankitsxchdeva/kalshi).

`GET /pnl` computes `account_value + withdrawals − deposits` from Kalshi's
trade API (RSA-PSS signed requests) and returns ONLY the net number —
deposit history, totals, and account value are deliberately kept off the
wire because this service is public:

```json
{"pnl": -267.52}
```

`GET /` serves a big-number display page (also on GitHub Pages at
https://ankitsachdeva.com/kalshi/).

Reachable at:
- https://kalshi.ankit.casa (tailnet, via Caddy)
- https://raspberrypi.tail9476fb.ts.net:10000 (PUBLIC, via Tailscale Funnel
  → caddy :8089 `/` route — anything this app serves is visible to the internet)

## Secrets (not in git)

- `.env` — `KALSHI_API_KEY_ID` + `KALSHI_PRIVATE_KEY_PATH` (see `.env.example`)
- `kalshi_private_key.pem` — API key's RSA private key, bind-mounted read-only

Both must be placed in this directory on the Pi by hand (scp); GitOps does not
manage them.

## Run

```bash
docker compose up -d --build
curl https://kalshi.ankit.casa/pnl
```

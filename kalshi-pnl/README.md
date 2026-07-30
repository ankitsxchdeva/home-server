# kalshi-pnl

Lifetime Kalshi profit/loss as one number. Mirrors
[ankitsxchdeva/kalshi-pnl](https://github.com/ankitsxchdeva/kalshi-pnl).

`GET /pnl` computes `account_value + withdrawals − deposits` from Kalshi's
trade API (RSA-PSS signed requests) and returns it with the deposit history:

```json
{"pnl": -267.52, "total_deposits": 375.0, "total_withdrawals": 0.0,
 "account_value": 107.48, "deposits": [...]}
```

Tailnet-only at https://kalshi.ankit.casa/pnl (via Caddy). No auth — do not
expose publicly. `GET /` serves a big-number display page (same page is on
GitHub Pages, but it can only fetch data from inside the tailnet).

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

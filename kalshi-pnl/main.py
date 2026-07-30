"""Tiny API that returns your Kalshi PnL as a number.

Run:  uvicorn main:app --port 8000
Then: curl http://localhost:8000/pnl
"""

import base64
import os
import time
from datetime import datetime, timezone
from decimal import Decimal

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

load_dotenv()

BASE_URL = os.getenv("KALSHI_BASE_URL", "https://api.elections.kalshi.com")
API_KEY_ID = os.getenv("KALSHI_API_KEY_ID")
PRIVATE_KEY_PATH = os.getenv("KALSHI_PRIVATE_KEY_PATH", "kalshi_private_key.pem")

app = FastAPI(title="Kalshi PnL")
# The GitHub Pages frontend fetches /pnl cross-origin; reachability
# (tailnet-only) is the access boundary, not CORS.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"])


def _load_private_key():
    with open(PRIVATE_KEY_PATH, "rb") as f:
        return serialization.load_pem_private_key(f.read(), password=None)


def _auth_headers(method: str, path: str) -> dict:
    """Kalshi API-key auth: RSA-PSS/SHA-256 over timestamp + method + path (no query)."""
    timestamp = str(int(time.time() * 1000))
    message = f"{timestamp}{method}{path}".encode()
    signature = _load_private_key().sign(
        message,
        padding.PSS(mgf=padding.MGF1(hashes.SHA256()), salt_length=hashes.SHA256.digest_size),
        hashes.SHA256(),
    )
    return {
        "KALSHI-ACCESS-KEY": API_KEY_ID,
        "KALSHI-ACCESS-TIMESTAMP": timestamp,
        "KALSHI-ACCESS-SIGNATURE": base64.b64encode(signature).decode(),
    }


def _dollars(position: dict, dollars_field: str, cents_field: str) -> Decimal:
    """Read a money field, preferring the *_dollars variant over legacy cents."""
    if dollars_field in position and position[dollars_field] is not None:
        return Decimal(str(position[dollars_field]))
    return Decimal(str(position.get(cents_field, 0))) / 100


def _get_all(client: httpx.Client, path: str, key: str) -> list:
    items, cursor = [], None
    while True:
        params = {"limit": 100}
        if cursor:
            params["cursor"] = cursor
        resp = client.get(path, params=params, headers=_auth_headers("GET", path))
        if resp.status_code != 200:
            raise HTTPException(502, f"Kalshi API error {resp.status_code}: {resp.text}")
        data = resp.json()
        items.extend(data.get(key) or [])
        cursor = data.get("cursor")
        if not cursor:
            break
    return items


def fetch_pnl() -> dict:
    """PnL as ground truth: (deposits - withdrawals) vs current account value."""
    if not API_KEY_ID:
        raise HTTPException(500, "KALSHI_API_KEY_ID is not set (see .env.example)")
    if not os.path.exists(PRIVATE_KEY_PATH):
        raise HTTPException(500, f"Private key file not found: {PRIVATE_KEY_PATH}")

    with httpx.Client(base_url=BASE_URL, timeout=30) as client:
        deposits = _get_all(client, "/trade-api/v2/portfolio/deposits", "deposits")
        withdrawals = _get_all(client, "/trade-api/v2/portfolio/withdrawals", "withdrawals")

        path = "/trade-api/v2/portfolio/balance"
        resp = client.get(path, headers=_auth_headers("GET", path))
        if resp.status_code != 200:
            raise HTTPException(502, f"Kalshi API error {resp.status_code}: {resp.text}")
        balance = resp.json()

    deposited = sum(
        Decimal(d["amount_cents"]) / 100 for d in deposits if d.get("status") == "applied"
    )
    withdrawn = sum(
        Decimal(w["amount_cents"]) / 100
        for w in withdrawals
        if w.get("status") in ("applied", "completed", "finalized")
    )
    # portfolio_value = cash + market value of open positions
    account_value = _dollars(balance, "portfolio_value_dollars", "portfolio_value")

    return {
        "pnl": float(account_value + withdrawn - deposited),
        "total_deposits": float(deposited),
        "total_withdrawals": float(withdrawn),
        "account_value": float(account_value),
        "deposits": [
            {
                "date": datetime.fromtimestamp(d["created_ts"], tz=timezone.utc).date().isoformat(),
                "amount": d["amount_cents"] / 100,
                "type": d.get("type"),
                "status": d.get("status"),
            }
            for d in sorted(deposits, key=lambda d: d["created_ts"])
        ],
    }


@app.get("/pnl")
def get_pnl():
    return fetch_pnl()


@app.get("/")
def index():
    return FileResponse(os.path.join(os.path.dirname(__file__), "index.html"))

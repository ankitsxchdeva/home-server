"""Guest parking registration page for VRR (park.ankit.casa).

Serves a single-page form and runs the same registration flow as the
autovrr Discord bot (autovrr/vrr.py, copied in at image build time).

Auth: HTTP Basic on every route. The password lives only in .env on the
Pi (gitignored) — this repo is public, so no secrets in code.
"""

import asyncio
import os
import re
import time
from collections import defaultdict
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
import secrets as secrets_mod

from vrr import register_visitor_parking

load_dotenv()

PARK_PASSWORD = os.getenv("PARK_PASSWORD", "")
GUEST_NAME = os.getenv("GUEST_NAME", "")
GUEST_PHONE = os.getenv("GUEST_PHONE", "")
GUEST_EMAIL = os.getenv("GUEST_EMAIL", "")

# Rate limit registrations: per-IP, per rolling window. Generous for a
# household, useless for abuse.
RATE_LIMIT = 5
RATE_WINDOW = 3600  # seconds

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
security = HTTPBasic()

_rate_log = defaultdict(list)
_run_lock = asyncio.Lock()

PLATE_RE = re.compile(r"^[A-NP-Z0-9 ]{1,10}$", re.IGNORECASE)  # VRR forbids O


def require_auth(credentials: HTTPBasicCredentials = Depends(security)):
    # Username is ignored; only the password matters. Constant-time compare,
    # and fail closed if the password was never configured.
    ok = bool(PARK_PASSWORD) and secrets_mod.compare_digest(
        credentials.password, PARK_PASSWORD
    )
    if not ok:
        raise HTTPException(
            status_code=401,
            detail="Unauthorized",
            headers={"WWW-Authenticate": "Basic"},
        )


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


@app.get("/", response_class=HTMLResponse)
async def index(_=Depends(require_auth)):
    html = Path(__file__).with_name("index.html").read_text()
    # Placeholders show the server-side defaults without exposing them in source.
    return html.replace("{{GUEST_NAME}}", GUEST_NAME) \
               .replace("{{GUEST_PHONE}}", GUEST_PHONE) \
               .replace("{{GUEST_EMAIL}}", GUEST_EMAIL)


@app.post("/register")
async def register(request: Request, _=Depends(require_auth)):
    ip = request.client.host if request.client else "unknown"
    now = time.time()
    _rate_log[ip] = [t for t in _rate_log[ip] if now - t < RATE_WINDOW]
    if len(_rate_log[ip]) >= RATE_LIMIT:
        raise HTTPException(status_code=429, detail="Too many registrations. Try again later.")

    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid request body")

    plate = str(body.get("license_plate", "")).strip().upper()
    make = str(body.get("vehicle_make", "")).strip()
    model = str(body.get("vehicle_model", "")).strip()
    name = str(body.get("visitor_name", "")).strip() or GUEST_NAME
    phone = str(body.get("visitor_phone", "")).strip() or GUEST_PHONE
    email = str(body.get("visitor_email", "")).strip() or GUEST_EMAIL

    if not PLATE_RE.match(plate):
        raise HTTPException(status_code=400, detail="Invalid license plate (letters A-Z except O, numbers, max 10).")
    if not make or len(make) > 40 or not model or len(model) > 40:
        raise HTTPException(status_code=400, detail="Vehicle make and model are required.")
    if len(name) > 80 or len(phone) > 20 or len(email) > 80:
        raise HTTPException(status_code=400, detail="Field too long.")

    if _run_lock.locked():
        raise HTTPException(status_code=409, detail="Another registration is in progress. Wait a moment and retry.")

    _rate_log[ip].append(now)
    async with _run_lock:
        result = await register_visitor_parking(plate, make, model, name, phone, email)

    status = 200 if result["success"] else 502
    return JSONResponse(result, status_code=status)

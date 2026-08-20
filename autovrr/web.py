"""Guest parking registration page for VRR (park.ankit.casa).

Serves a single-page form and runs the same registration flow as the
Discord bot (vrr.py in this directory).

Auth: password-only login page -> signed session cookie (7 days).
The password lives only in .env on the Pi (gitignored) — this repo is
public, so no secrets in code. /healthz is intentionally public so
uptime-kuma can monitor without credentials.
"""

import asyncio
import hashlib
import hmac
import os
import re
import time
from collections import defaultdict
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse

from vrr import register_visitor_parking

load_dotenv()

PARK_PASSWORD = os.getenv("PARK_PASSWORD", "")
GUEST_NAME = os.getenv("GUEST_NAME", "")
GUEST_PHONE = os.getenv("GUEST_PHONE", "")
GUEST_EMAIL = os.getenv("GUEST_EMAIL", "")

SESSION_COOKIE = "park_session"
SESSION_MAX_AGE = 7 * 24 * 3600  # 7 days

# Rate limits: registrations per hour, login attempts per 5 min — per IP,
# in-memory. Generous for a household, useless for abuse.
RATE_LIMIT = 5
RATE_WINDOW = 3600
LOGIN_RATE_LIMIT = 10
LOGIN_RATE_WINDOW = 300

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

_rate_log = defaultdict(list)
_login_log = defaultdict(list)
_run_lock = asyncio.Lock()

PLATE_RE = re.compile(r"^[A-NP-Z0-9 ]{1,10}$", re.IGNORECASE)  # VRR forbids O

_STATIC = Path(__file__).parent


def _session_token() -> str:
    # Deterministic token keyed on the password: stable across restarts,
    # unforgeable without the password, invalidated by changing it.
    return hmac.new(PARK_PASSWORD.encode(), b"parking-session-v1", hashlib.sha256).hexdigest()


def _valid_session(request: Request) -> bool:
    if not PARK_PASSWORD:
        return False  # fail closed when unconfigured
    token = request.cookies.get(SESSION_COOKIE, "")
    return hmac.compare_digest(token, _session_token())


def require_auth(request: Request):
    if not _valid_session(request):
        if request.url.path == "/register":
            raise HTTPException(status_code=401, detail="Session expired. Reload the page.")
        raise HTTPException(status_code=303, headers={"Location": "/login"}, detail="login")


@app.exception_handler(303)
async def redirect_to_login(request: Request, exc: HTTPException):
    return RedirectResponse(exc.headers["Location"], status_code=303)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


@app.get("/healthz")
async def healthz():
    return {"ok": True}


@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request, error: str = ""):
    if _valid_session(request):
        return RedirectResponse("/", status_code=303)
    html = (_STATIC / "login.html").read_text()
    return HTMLResponse(html.replace("{{ERROR}}", "show" if error else ""))


@app.post("/login")
async def login_submit(request: Request):
    ip = request.client.host if request.client else "unknown"
    now = time.time()
    _login_log[ip] = [t for t in _login_log[ip] if now - t < LOGIN_RATE_WINDOW]
    if len(_login_log[ip]) >= LOGIN_RATE_LIMIT:
        raise HTTPException(status_code=429, detail="Too many attempts. Try again in a few minutes.")
    _login_log[ip].append(now)

    form = await request.form()
    password = str(form.get("password", ""))
    if PARK_PASSWORD and hmac.compare_digest(password, PARK_PASSWORD):
        response = RedirectResponse("/", status_code=303)
        response.set_cookie(
            SESSION_COOKIE, _session_token(),
            max_age=SESSION_MAX_AGE, httponly=True, secure=True, samesite="lax",
        )
        return response
    await asyncio.sleep(1)  # slow down online guessing
    return RedirectResponse("/login?error=1", status_code=303)


@app.get("/logout")
async def logout():
    response = RedirectResponse("/login", status_code=303)
    response.delete_cookie(SESSION_COOKIE)
    return response


@app.get("/", response_class=HTMLResponse)
async def index(_=Depends(require_auth)):
    html = (_STATIC / "index.html").read_text()
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

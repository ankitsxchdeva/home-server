# Build context is the repo ROOT (see park/docker-compose.yml) so this image
# can reuse the VRR registration flow from autovrr/vrr.py — one copy of the
# scraper, shared by the Discord bot and this page.
FROM python:3.12-slim

WORKDIR /app

COPY park/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Chromium and its OS dependencies. --with-deps pulls the required apt
# packages itself, so no manual apt-get list is needed (works on AMD64 and ARM64).
RUN playwright install --with-deps chromium

COPY autovrr/vrr.py .
COPY park/main.py .
COPY park/index.html .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8003"]

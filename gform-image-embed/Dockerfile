FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Chromium and its OS dependencies. --with-deps pulls the required apt
# packages itself, so no manual apt-get list is needed (works on AMD64 and ARM64).
RUN playwright install --with-deps chromium

COPY bot.py .

CMD ["python", "-u", "bot.py"]

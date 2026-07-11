FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py fetch.py discover.py db.py ./
COPY scrapers ./scrapers

CMD ["python", "-u", "app.py"]

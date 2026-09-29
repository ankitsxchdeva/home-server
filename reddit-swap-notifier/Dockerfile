FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY bot.py poller.py db.py reddit_feed.py site_feed.py ./

CMD ["python", "-u", "bot.py"]

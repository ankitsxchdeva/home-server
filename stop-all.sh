#!/bin/bash
# Stop all home server services

echo "🛑 Stopping all home server services..."

# Check if Docker Compose supports the include directive
if docker compose config --quiet 2>/dev/null; then
    echo "✅ Using include directive (Docker Compose v2.20+)"
    docker compose down
else
    echo "⚠️  Using multiple compose files (fallback for older Docker Compose)"
    docker compose \
        -f homer/docker-compose.yml \
        -f uptime-kuma/docker-compose.yml \
        -f commute-bot/docker-compose.yml \
        -f home-assistant/docker-compose.yml \
        -f cups/docker-compose.yml \
        down
fi

echo "✅ All services stopped!"

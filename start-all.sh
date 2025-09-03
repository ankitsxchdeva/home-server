#!/bin/bash
# Start all home server services

echo "🚀 Starting all home server services..."

# Check if Docker Compose supports the include directive
if docker compose config --quiet 2>/dev/null; then
    echo "✅ Using include directive (Docker Compose v2.20+)"
    docker compose up -d
else
    echo "⚠️  Using multiple compose files (fallback for older Docker Compose)"
    docker compose \
        -f homer/docker-compose.yml \
        -f uptime-kuma/docker-compose.yml \
        -f commute-bot/docker-compose.yml \
        -f home-assistant/docker-compose.yml \
        -f cups/docker-compose.yml \
        up -d
fi

echo "✅ All services started!"
echo ""
echo "📋 Access your services:"
echo "  - Homer Dashboard: http://$(hostname -I | awk '{print $1}'):8080"
echo "  - Uptime Kuma: http://$(hostname -I | awk '{print $1}'):3001"
echo "  - Home Assistant: http://$(hostname -I | awk '{print $1}'):8123"
echo "  - CUPS Print Server: http://$(hostname -I | awk '{print $1}'):631"
echo ""
echo "📊 Check status with: docker ps"

#!/bin/bash
# Setup .env files from templates

echo "🔧 Setting up .env files from templates..."

services=("homer" "commute-bot" "cups" "home-assistant" "pihole" "netalertx" "glances")

for service in "${services[@]}"; do
    if [ -f "$service/.env.example" ]; then
        if [ ! -f "$service/.env" ]; then
            cp "$service/.env.example" "$service/.env"
            echo "✅ Created $service/.env from template"
        else
            echo "⚠️  $service/.env already exists, skipping"
        fi
    else
        echo "❌ $service/.env.example not found"
    fi
done

echo ""
echo "📝 Next steps:"
echo "1. Edit each .env file with your actual secrets:"
for service in "${services[@]}"; do
    if [ -f "$service/.env" ]; then
        echo "   - $service/.env"
    fi
done
echo ""
echo "2. Start services with: ./start-all.sh"
echo ""
echo "📋 After starting, access your services at:"
echo "  - 🏠 Homer Dashboard: http://$(hostname -I | awk '{print $1}'):8080"
echo "  - 🏡 Home Assistant: http://$(hostname -I | awk '{print $1}'):8123"
echo "  - 📊 Uptime Kuma: http://$(hostname -I | awk '{print $1}'):3001"
echo "  - 🛡️  Pi-hole Admin: http://$(hostname -I | awk '{print $1}'):8053/admin"
echo "  - 📈 Glances: http://$(hostname -I | awk '{print $1}'):61208"
echo "  - 📡 NetAlertX: http://$(hostname -I | awk '{print $1}'):20211"
echo "  - 🖨️  CUPS Print Server: http://$(hostname -I | awk '{print $1}'):631"

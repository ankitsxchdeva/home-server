
# Home Server

A complete home server setup running on Raspberry Pi with Docker containers.

## Services

### Currently Deployed
- **[Homer](./homer/)** - Dashboard/homepage (port 8080)
- **[Uptime Kuma](./uptime-kuma/)** - Service monitoring (port 3001)
- **[Commute Bot](./commute-bot/)** - Discord bot for commute times
- **[Home Assistant](./home-assistant/)** - Home automation (port 8123)
- **[CUPS](./cups/)** - Print server (port 631)

### Planned Services
- Pi-hole - DNS ad blocker
- WireGuard - VPN server
- NetAlertX - Network monitoring
- Glances - System monitoring
- Homepage/Glance - Alternative dashboard

## Quick Start

1. **Setup environment files:**
   ```bash
   cd home-server
   # Copy and configure .env files for each service
   cp homer/.env.example homer/.env
   cp commute-bot/.env.example commute-bot/.env
   cp cups/.env.example cups/.env
   cp home-assistant/.env.example home-assistant/.env
   ```

2. **Start all services:**
   ```bash
   # Option 1: Use the convenience script
   ./start-all.sh
   
   # Option 2: Use docker compose directly (requires v2.20+ for include support)
   docker compose up -d
   ```

3. **Stop all services:**
   ```bash
   ./stop-all.sh
   # or: docker compose down
   ```

4. **Start individual services:**
   ```bash
   cd homer && docker compose up -d
   cd ../uptime-kuma && docker compose up -d
   # etc...
   ```

## Access URLs

- Homer Dashboard: http://your-pi-ip:8080
- Uptime Kuma: http://your-pi-ip:3001
- Home Assistant: http://your-pi-ip:8123
- CUPS Web Interface: http://your-pi-ip:631

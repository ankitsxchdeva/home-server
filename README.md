
# Home Server

A complete home server setup running on Raspberry Pi with Docker containers.

## Services

### Currently Deployed
- **[Homer](./homer/)** - Dashboard/homepage (port 8080)
- **[Home Assistant](./home-assistant/)** - Home automation (port 8123)
- **[Uptime Kuma](./uptime-kuma/)** - Service monitoring (port 3001)
- **[Pi-hole](./pihole/)** - DNS ad blocker (port 8053)
- **[Glances](./glances/)** - System monitoring (port 61208)
- **[NetAlertX](./netalertx/)** - Network monitoring (port 20211)
- **[CUPS](./cups/)** - Print server (port 631)
- **[Commute Bot](./commute-bot/)** - Discord bot for commute times

### Planned Services
- WireGuard - VPN server
- Grafana - Data visualization
- InfluxDB - Time series database

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

2. **Setup environment files for new services:**
   ```bash
   # Copy templates for new services
   cp pihole/.env.example pihole/.env
   cp netalertx/.env.example netalertx/.env
   cp glances/.env.example glances/.env
   # Edit each .env file with your settings
   ```

3. **Start all services:**
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

- **Homer Dashboard**: http://your-pi-ip:8080
- **Home Assistant**: http://your-pi-ip:8123
- **Uptime Kuma**: http://your-pi-ip:3001
- **Pi-hole Admin**: http://your-pi-ip:8053/admin
- **Glances**: http://your-pi-ip:61208
- **NetAlertX**: http://your-pi-ip:20211
- **CUPS Print Server**: http://your-pi-ip:631

## Configuration Files

### 📁 Safe to Track in Git
- **Glances**: `glances.conf` - Monitoring thresholds and display settings
- **Pi-hole**: `custom.list`, `adlists.list`, `whitelist.txt` - DNS records and blocking rules  
- **NetAlertX**: `netalertx.conf` - Network scanning and alert settings
- **All**: `.env.example` files - Environment templates

### 🚫 Never Track in Git  
- **All**: `.env` files - Contains secrets and API keys
- **All**: `data/`, `config/`, `db/` directories - Runtime data and user settings
- **Home Assistant**: `secrets.yaml` - Contains all HA secrets

### 🎯 Benefits
- **Consistent deployments** across multiple Pi setups
- **Version-controlled configurations** for Pi-hole blocklists and DNS
- **Optimized defaults** for monitoring and alerting
- **Easy customization** while maintaining security

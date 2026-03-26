
# Home Server

A complete home server setup running on Raspberry Pi with Docker containers.

## Services

### Infrastructure
- **[Traefik](./traefik/)** - Reverse proxy / TLS termination (ports 80, 443; dashboard 8080)
- **[WireGuard (wg-easy)](./wg-easy/)** - VPN server (port 51820/UDP; web UI via Traefik)

### Home Automation
- **[Home Assistant](./home-assistant/)** - Home automation hub (port 8123, host network)
- **[Matter Server](./matter-server/)** - Matter protocol bridge (internal)

### Dashboard & Monitoring
- **[Homepage](./homepage/)** - Dashboard (port 3000)
- **[Uptime Kuma](./uptime-kuma/)** - Service monitoring (port 3001)
- **[Glances](./glances/)** - System resource monitoring (port 61208)

### Network
- **[Pi-hole](./pihole/)** - DNS ad blocker (DNS port 53; web UI port 8053)
- **[NetAlertX](./netalertx/)** - Network device scanner (port 20211, host network)

### Services
- **[CUPS](./cups/)** - Print server (port 631, host network)
- **[13ft](./13ft/)** - Paywall bypass reader proxy (port 5000)

### Maintenance
- **[Watchtower](./watchtower/)** - Automatic container updates (checks nightly at 4am)

### Discord Bots
- **[Commute Bot](./commute-bot/)** - Commute time lookup via Google Maps
- **[AutoVRR](./autovrr/)** - Visitor parking registration automation

## Quick Start

1. **Setup environment files:**
   ```bash
   cd home-server
   # Copy and configure .env files for each service
   for dir in traefik wg-easy homepage home-assistant uptime-kuma pihole glances netalertx cups commute-bot autovrr; do
     cp $dir/.env.example $dir/.env
   done
   # Edit each .env with your actual values
   ```

2. **Start all services:**
   ```bash
   docker compose up -d
   ```

3. **Stop all services:**
   ```bash
   docker compose down
   ```

4. **Start a single service:**
   ```bash
   docker compose up -d <service-name>
   # e.g.: docker compose up -d homepage
   ```

## Access URLs

- **Homepage Dashboard**: http://your-pi-ip:3000
- **Home Assistant**: http://your-pi-ip:8123
- **Uptime Kuma**: http://your-pi-ip:3001
- **Pi-hole Admin**: http://your-pi-ip:8053/admin
- **Glances**: http://your-pi-ip:61208
- **NetAlertX**: http://your-pi-ip:20211
- **CUPS Print Server**: http://your-pi-ip:631
- **13ft Reader**: http://your-pi-ip:5000
- **Traefik Dashboard**: http://your-pi-ip:8080
- **WireGuard**: vpn.your-domain (via Traefik)

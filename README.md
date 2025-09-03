
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

## Architecture

This setup uses a **modular approach** to eliminate code duplication:

- **Main `docker-compose.yml`** - Uses `include` directive to reference individual service files
- **Individual service folders** - Each contains its own self-contained `docker-compose.yml`
- **No duplication** - Service definitions exist only once, in their respective folders

Each service folder contains:
- `docker-compose.yml` - Service definition
- `.env.example` - Environment template  
- `README.md` - Service-specific documentation
- Configuration files and data volumes

### Benefits:
- ✅ **No code duplication** between main and individual compose files
- ✅ **Modular design** - services can be managed independently
- ✅ **Easy maintenance** - update service configs in one place only
- ✅ **Flexible deployment** - start all services together or individually

## Security

- **All secrets are managed via `.env` files** (not tracked in git)
- **Copy `.env.example` to `.env`** and fill in your values
- **Never commit actual `.env` files** to version control
- **Read [SECURITY.md](./SECURITY.md)** for comprehensive security guidelines
- **Run `./check-secrets.sh`** before committing to scan for sensitive data

### Quick Security Check
```bash
./check-secrets.sh  # Run before git commit
```

## Access URLs

- Homer Dashboard: http://your-pi-ip:8080
- Uptime Kuma: http://your-pi-ip:3001
- Home Assistant: http://your-pi-ip:8123
- CUPS Web Interface: http://your-pi-ip:631

## Deployment

### Setting up on a New Pi
See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for complete instructions on deploying to a new Raspberry Pi.

**Quick setup:**
```bash
git clone https://github.com/your-username/home-server.git
cd home-server
./new-pi-setup.sh  # Interactive setup wizard
```

## Next Steps

Consider setting up Ansible for automated deployment and configuration management.

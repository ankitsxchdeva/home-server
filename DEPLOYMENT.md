# Deployment Guide - Setting up on a New Pi

When deploying your home-server to a new Raspberry Pi, you'll need to recreate all the secret files that are protected by `.gitignore`.

## 🔧 Step-by-Step Setup

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/home-server.git
cd home-server
```

### 2. Create Environment Files
```bash
# Run the setup script to create .env files from templates
./setup-env.sh
```

### 3. Configure Each Service's Secrets

#### 🏠 **Homer Dashboard** - `homer/.env`
```bash
# Edit homer/.env with:
OPENWEATHERMAP_API_KEY=your_openweathermap_api_key_here
HOME_ASSISTANT_TOKEN=your_home_assistant_token_here
```

#### 🤖 **Commute Bot** - `commute-bot/.env`
```bash
# Edit commute-bot/.env with:
DISCORD_TOKEN=your_discord_token_here
GUILD_ID=your_discord_guild_id_here
GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
APARTMENT_ADDRESS=your_apartment_address_here
WORK_ADDRESS=your_work_address_here
```

#### 🖨️ **CUPS Print Server** - `cups/.env`
```bash
# Edit cups/.env with:
CUPSADMIN=pi
CUPSPASSWORD=your_secure_cups_password_here
TZ=America/Chicago
```

#### 🏡 **Home Assistant** - `home-assistant/.env`
```bash
# Edit home-assistant/.env with:
TZ=America/Chicago
# Add any other environment variables you need
```

#### 🏡 **Home Assistant Secrets** - `home-assistant/config/secrets.yaml`
```bash
# Copy the template and fill in your secrets:
cp home-assistant/config/secrets.yaml.example home-assistant/config/secrets.yaml

# Edit home-assistant/config/secrets.yaml with your actual secrets:
# - API keys for integrations
# - Database passwords
# - MQTT credentials
# - Notification service tokens
# - etc.
```

### 4. Service-Specific Setup

#### Home Assistant - First Run Setup
- On first run, Home Assistant will create new `.storage/` files
- You'll need to go through the initial setup wizard at `http://your-pi-ip:8123`
- Recreate users, device registrations, and integrations
- Import your automations (these are preserved in git)

#### CUPS - Printer Configuration
- Printer configurations in `cups/config/printers.conf` are not tracked
- You'll need to re-add your printers via the web interface at `http://your-pi-ip:631`
- SSL certificates will be regenerated automatically

#### Uptime Kuma - Monitoring Setup
- Database in `uptime-kuma/data/` is not tracked
- You'll need to recreate your monitoring checks
- Set up notifications again

### 5. Start Services
```bash
# Start all services
./start-all.sh

# Or start individually
docker compose up -d
```

## 📋 Complete Checklist

### ✅ Files You Need to Recreate:

**Environment Files:**
- [ ] `homer/.env` - Weather & HA tokens
- [ ] `commute-bot/.env` - Discord, Google Maps, addresses
- [ ] `cups/.env` - Admin credentials
- [ ] `home-assistant/.env` - Timezone and other env vars

**Home Assistant:**
- [ ] `home-assistant/config/secrets.yaml` - All HA secrets
- [ ] Complete HA initial setup wizard
- [ ] Recreate user accounts
- [ ] Reconfigure integrations (Zigbee, etc.)
- [ ] Re-pair devices

**CUPS:**
- [ ] Re-add printers via web interface
- [ ] Configure printer sharing settings

**Uptime Kuma:**
- [ ] Recreate monitoring checks
- [ ] Configure notification channels

**Homer:**
- [ ] Customize `homer/assets/config.yml` (if you had custom changes)

### ✅ Files That Are Preserved:
- All `docker-compose.yml` files
- Home Assistant `configuration.yaml`, `automations.yaml`, `scripts.yaml`, `scenes.yaml`
- All documentation and README files
- Service configurations (non-sensitive parts)

## 🔒 Security Notes

1. **Never store secrets in the repository** - always use the template approach
2. **Use strong, unique passwords** on the new Pi
3. **Rotate API keys** if the old Pi was compromised
4. **Enable 2FA** where possible
5. **Run security scan** before first commit: `./check-secrets.sh`

## 🚀 Quick Start Commands

```bash
# Complete setup in one go:
git clone https://github.com/your-username/home-server.git
cd home-server
./setup-env.sh
# Edit all .env files with your secrets
# Create secrets.yaml from template
./start-all.sh
```

## 📱 Access URLs After Setup

- Homer Dashboard: http://new-pi-ip:8080
- Uptime Kuma: http://new-pi-ip:3001  
- Home Assistant: http://new-pi-ip:8123
- CUPS: http://new-pi-ip:631

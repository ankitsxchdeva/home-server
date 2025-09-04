# Dynamic DNS (DDNS) Service

Automatically updates Cloudflare DNS records when your public IP changes.

## Setup

1. **Copy environment template:**
   ```bash
   cp .env.example .env
   ```

2. **Configure your credentials in `.env`:**
   - Get Cloudflare API token from: https://dash.cloudflare.com/profile/api-tokens
   - Get Zone ID from your domain's Overview page in Cloudflare
   - Update domain name

3. **Test the script:**
   ```bash
   ./ddns-updater.sh
   ```

4. **Set up automatic updates (cron):**
   ```bash
   # Add to crontab (runs every 5 minutes)
   */5 * * * * /home/ankit/home-server/ddns/ddns-updater.sh >> /home/ankit/home-server/ddns/cron.log 2>&1
   ```

## Files

- `ddns-updater.sh` - Main DDNS script
- `.env` - Configuration (not in git)
- `.env.example` - Configuration template
- `ddns.log` - Update history
- `cron.log` - Cron job output

## Monitoring

```bash
# View recent updates
tail -f ddns.log

# View cron output  
tail -f cron.log

# Test manually
./ddns-updater.sh
```

## Features

- ✅ Updates both root domain and VPN subdomain
- ✅ Only updates when IP actually changes
- ✅ Comprehensive logging
- ✅ Error handling and validation
- ✅ Secure credential management

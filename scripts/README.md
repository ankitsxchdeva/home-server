# Homepage Dynamic IP Management

This directory contains scripts to automatically manage IP address changes for your homepage dashboard.

## Files

- `update-homepage-ip.sh` - Main script that detects IP changes and updates homepage configuration
- `homepage-ip-monitor.service` - Systemd service definition
- `homepage-ip-monitor.timer` - Systemd timer to run the service every 10 minutes
- `update-homepage-ip.log` - Log file for all IP update activities

## Usage

### Manual Update
To manually update the homepage IP addresses:
```bash
/home/ankit/home-server/scripts/update-homepage-ip.sh
```

### Automatic Updates
The systemd timer runs every 10 minutes and checks for IP changes:
- **Status**: `sudo systemctl status homepage-ip-monitor.timer`
- **Logs**: `sudo journalctl -u homepage-ip-monitor.service -f`
- **Stop**: `sudo systemctl stop homepage-ip-monitor.timer`
- **Start**: `sudo systemctl start homepage-ip-monitor.timer`

### Quick Commands
Add this to your `~/.zshrc` or `~/.bashrc` for easy access:
```bash
alias homepage-ip-update='/home/ankit/home-server/scripts/update-homepage-ip.sh'
alias homepage-ip-status='sudo systemctl status homepage-ip-monitor.timer'
alias homepage-ip-logs='sudo journalctl -u homepage-ip-monitor.service -f'
```

## How It Works

1. **Detection**: Script detects current system IP using multiple methods
2. **Comparison**: Compares current IP with IP in homepage configuration
3. **Update**: If different, updates all service URLs in `services.yaml`
4. **Backup**: Creates timestamped backup before making changes
5. **Restart**: Restarts homepage container to apply changes
6. **Logging**: Logs all activities with timestamps

## Configuration

The script automatically updates these services in your homepage:
- Home Assistant (port 8123)
- Matter Server (port 5580)
- Uptime Kuma (port 3001)
- Glances (port 61208)
- NetAlertX (port 20211)
- Pi-hole (port 8053)
- CUPS Print Server (port 631)
- Traefik Dashboard (port 8080)
- WireGuard VPN (port 51821)

## Troubleshooting

- Check logs: `cat /home/ankit/home-server/scripts/update-homepage-ip.log`
- Manual test: `/home/ankit/home-server/scripts/update-homepage-ip.sh`
- Restore backup: `cp /home/ankit/home-server/homepage/config/services.yaml.backup.YYYYMMDD_HHMMSS /home/ankit/home-server/homepage/config/services.yaml`

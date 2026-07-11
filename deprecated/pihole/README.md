# Pi-hole

Network-wide ad blocker and DNS server.

## Setup

1. Copy `.env.example` to `.env` and configure:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your settings:
   - `WEBPASSWORD`: Admin password for web interface
   - `LOCAL_IPV4`: Your Pi's IP address
   - `TZ`: Your timezone

3. Start the service:
   ```bash
   docker compose up -d
   ```

4. Access the web interface at `http://your-pi-ip:8053/admin`

## Configuration

### Runtime Data (Not in Git)
- Configuration files are stored in `./etc-pihole/`
- DNS configuration in `./etc-dnsmasq.d/`
- Data persists between container restarts

### Custom Configuration Files (In Git)
- **`custom.list`**: Custom DNS records for local hostnames
- **`adlists.list`**: Additional blocklists beyond defaults
- **`whitelist.txt`**: Domains that should never be blocked

These files are automatically loaded into Pi-hole on startup and provide:
- Local hostname resolution (e.g., homeserver.local → 192.168.1.227)
- Enhanced ad blocking with curated lists
- Whitelist for essential services

## Network Setup

To use Pi-hole as your network DNS:

### Router Configuration (Recommended)
1. Access your router's admin panel
2. Change DNS servers to your Pi's IP: `192.168.1.227`
3. All devices will automatically use Pi-hole

### Individual Device Configuration
Point DNS to your Pi's IP address:
- Primary DNS: `192.168.1.227`
- Secondary DNS: `1.1.1.1` (fallback)

## Features

- **Ad blocking**: Blocks ads, trackers, and malicious domains
- **DNS filtering**: Custom blocklists and whitelists
- **Query logging**: See what domains are being requested
- **Network overview**: Monitor DNS queries across devices
- **Custom DNS**: Set custom DNS records for local services

## Ports

- `53/tcp & 53/udp`: DNS server
- `8053/tcp`: Web interface (http://your-pi-ip:8053/admin)

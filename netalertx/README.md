# NetAlertX

Network monitoring and device discovery tool. Monitors your network for new devices, changes, and potential security issues.

## Setup

1. Copy `.env.example` to `.env` and configure:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your timezone (`TZ`).

3. Start the service:
   ```bash
   docker compose up -d
   ```

4. Access the web interface at `http://your-pi-ip:20211`

## Configuration

### Runtime Data (Not in Git)
- Configuration lives in `./config/app.conf` (created on first start; edit it or
  use the web UI's Settings page — scan subnets, schedules, notifications)
- Database files are stored in `./db/`
- Uses host networking for comprehensive network scanning

## Features

- **Device Discovery**: Automatically discovers devices on your network
- **Change Monitoring**: Alerts when new devices join or leave
- **Device Fingerprinting**: Identifies device types and manufacturers
- **Historical Tracking**: Keeps history of network changes
- **Notifications**: Email alerts for network events
- **Web Interface**: Modern web UI for monitoring

## Network Requirements

- Uses host networking mode for optimal scanning capabilities
- Requires access to your local network subnet
- May need to configure firewall rules for ICMP and ARP scanning

## Default Port

- `20211/tcp`: Web interface (http://your-pi-ip:20211)

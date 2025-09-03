# NetAlertX

Network monitoring and device discovery tool. Monitors your network for new devices, changes, and potential security issues.

## Setup

1. Copy `.env.example` to `.env` and configure:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your network settings:
   - `TZ`: Your timezone
   - `SCAN_SUBNETS`: Your network subnet (usually 192.168.1.0/24)

3. Start the service:
   ```bash
   docker compose up -d
   ```

4. Access the web interface at `http://your-pi-ip:20211`

## Configuration

### Runtime Data (Not in Git)
- Configuration files are stored in `./config/`
- Database files are stored in `./db/`
- Uses host networking for comprehensive network scanning

### Configuration Template (In Git)
- **`netalertx.conf`**: Default configuration template with optimized settings
- Contains network scanning parameters, notification settings, and security options
- Automatically loaded on container startup
- Customize scan frequency, subnets, and alert preferences

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

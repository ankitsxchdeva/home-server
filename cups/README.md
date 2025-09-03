# CUPS Print Server

CUPS (Common UNIX Printing System) running in Docker for network printing.

## Setup

1. Copy `.env.example` to `.env` and fill in your values:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your credentials:
   - `CUPSADMIN`: Admin username (default: pi)
   - `CUPSPASSWORD`: Admin password
   - `TZ`: Your timezone

3. Start the service:
   ```bash
   docker-compose up -d
   ```

4. Access the web interface at `http://your-pi-ip:631`

## Configuration

- Configuration files are stored in `./config/`
- Printers and settings persist between container restarts
- USB printers are automatically detected via device mapping

## Network Access

- Uses `network_mode: "host"` to bind directly to the Pi's IP address
- This makes the printer accessible to all devices on your local network
- Clients can add the printer using `http://your-pi-ip:631`

## Notes

- The container needs access to `/dev/bus/usb` for USB printer detection
- Configuration files may require special permissions  
- Port 631 is the standard CUPS port
- `/var/run/dbus` volume is required for proper printer communication

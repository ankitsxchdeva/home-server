# Glances

Real-time system monitoring tool with web interface.

## Setup

1. Copy `.env.example` to `.env` and configure:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your settings:
   - `TZ`: Your timezone
   - `GLANCES_USERNAME`: Web interface username (optional)
   - `GLANCES_PASSWORD`: Web interface password (optional)

3. Start the service:
   ```bash
   docker compose up -d
   ```

4. Access the web interface at `http://your-pi-ip:61208`

## Configuration

- Main config file: `glances.conf`
- Thresholds and display options are customizable
- Docker socket mounted for container monitoring

## Features

- **System Monitoring**: CPU, memory, disk, network usage
- **Process Monitoring**: Running processes and resource usage
- **Docker Integration**: Monitor Docker containers
- **Historical Data**: Charts and graphs of system metrics
- **Alerts**: Configurable thresholds and warnings
- **Web Interface**: Clean, responsive web UI
- **API Access**: RESTful API for integration

## Monitoring Capabilities

- CPU usage and load average
- Memory and swap usage
- Disk I/O and space usage
- Network interface statistics
- Running processes
- Docker container stats
- System temperatures (if available)

## Default Port

- `61208/tcp`: Web interface (http://your-pi-ip:61208)

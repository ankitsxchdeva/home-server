# Uptime Kuma

Self-hosted monitoring tool for tracking service uptime and performance.

## Setup

1. Start the service:
   ```bash
   docker-compose up -d
   ```

2. Access the web interface at `http://your-pi-ip:3001`

3. Complete the initial setup wizard

## Features

- Monitor HTTP/HTTPS, TCP, Ping, DNS, and more
- Beautiful status pages
- Notifications via Discord, Slack, email, etc.
- Multi-language support
- Mobile-friendly interface

## Data

- All data is stored in `./data/`
- Database and uploads persist between container restarts

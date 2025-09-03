# Homepage Dashboard

A modern, responsive dashboard for your home server services, built with [Homepage](https://github.com/benphelps/homepage).

## Features

- **Modern UI**: Clean, responsive design with dark/light theme support
- **Docker Integration**: Automatic container discovery and status monitoring
- **Service Groups**: Organized service categories for easy navigation
- **Widgets**: Interactive widgets for services like Home Assistant and Pi-hole
- **LAN Access**: Available to all devices on your local network

## Quick Setup

1. **Copy environment file:**
   ```bash
   cp env.example .env
   # Edit .env if you need custom environment variables
   ```

2. **Start the service:**
   ```bash
   docker compose up -d
   ```

3. **Access the dashboard:**
   - URL: http://your-pi-ip:3000
   - The dashboard will automatically discover your Docker containers

## Configuration

The main configuration files are in the `config/` directory:

- `settings.yaml` - Dashboard appearance and behavior
- `services.yaml` - Service links and organization
- `bookmarks.yaml` - External links and documentation
- `docker.yaml` - Docker integration settings

## Service Discovery

Homepage automatically discovers Docker containers and can display:
- Container status (running/stopped)
- Resource usage
- Service health
- Custom labels and metadata

## Widgets

Some services support interactive widgets:
- **Home Assistant**: Shows entity states and allows control
- **Pi-hole**: Displays blocking statistics and recent queries

## Customization

- Edit `config/settings.yaml` to change themes, colors, and language
- Modify `config/services.yaml` to reorganize or add new services
- Add custom CSS in `config/custom.css` for advanced styling

## Migration from Homer

This Homepage setup includes all the services from your previous Homer dashboard:
- Home Assistant
- Uptime Kuma
- Glances
- NetAlertX
- Pi-hole
- CUPS Print Server
- Commute Bot

## Troubleshooting

- **Container not showing**: Ensure the container has proper labels
- **Widgets not working**: Check API keys and service URLs
- **Access issues**: Verify port 3000 is accessible on your network

## Documentation

- [Homepage Official Docs](https://homepage.0xcc.pw/)
- [Configuration Examples](https://homepage.0xcc.pw/configuration/services)
- [Widget Documentation](https://homepage.0xcc.pw/configuration/widgets)

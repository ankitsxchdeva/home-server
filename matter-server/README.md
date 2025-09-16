# Matter Server

This directory contains the configuration for the Open Home Foundation Matter Server, which provides Matter/Thread support for smart home devices.

## About

The Matter Server is an officially certified Software Component that creates a Matter controller. It's designed to work with Home Assistant but can be used in other projects as well.

## Configuration

- **Container**: `ghcr.io/matter-js/python-matter-server:latest`
- **Port**: 5580 (WebSocket API)
- **Data Directory**: `./data` (persistent storage for Matter fabric data)
- **Network Mode**: Host (required for Matter device discovery)

## Usage

The Matter Server provides a WebSocket API on port 5580 that can be used by:
- Home Assistant (via the Matter integration)
- Other applications that need Matter controller functionality

## Data Persistence

The `./data` directory contains:
- Matter fabric certificates and keys
- Device commissioning data
- Network credentials for Thread networks

## Security

The container runs with:
- `apparmor:unconfined` for hardware access
- Host network mode for device discovery
- Access to D-Bus for system integration

## Links

- [GitHub Repository](https://github.com/matter-js/python-matter-server)
- [Matter Specification](https://csa-iot.org/all-solutions/matter/)
- [Home Assistant Matter Integration](https://www.home-assistant.io/integrations/matter/)

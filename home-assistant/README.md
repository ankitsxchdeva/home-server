# Home Assistant

Open source home automation platform.

## Setup

1. Copy `.env.example` to `.env` and configure:
   ```bash
   cp .env.example .env
   ```

2. Edit configuration files in `./config/`:
   - `configuration.yaml`: Main configuration
   - `secrets.yaml`: Sensitive data (consider moving to .env)
   - `automations.yaml`: Automations
   - `scripts.yaml`: Scripts

3. Start the service:
   ```bash
   docker-compose up -d
   ```

4. Access at `http://your-pi-ip:8123`

## Configuration

- Configuration files are in `./config/`
- Database and logs persist in `./config/`
- Uses host networking for device discovery

## Security

Consider moving secrets from `secrets.yaml` to environment variables in `.env` for better security.

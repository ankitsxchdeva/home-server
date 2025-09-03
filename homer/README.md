# Homer Dashboard

A modern homepage/dashboard for your services.

## Setup

1. Copy `.env.example` to `.env` and fill in your values:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your API keys:
   - `OPENWEATHERMAP_API_KEY`: For weather widget
   - `HOME_ASSISTANT_TOKEN`: For Home Assistant integration

3. Configure your dashboard by editing `assets/config.yml`

4. Start the service:
   ```bash
   docker-compose up -d
   ```

5. Access at `http://your-pi-ip:8080`

## Configuration

- Main config: `assets/config.yml`
- Custom CSS: `assets/custom.css`
- Icons: `assets/icons/`
- Themes: `assets/themes/`

## Features

- Weather integration via OpenWeatherMap
- Home Assistant integration
- Customizable themes and layouts
- Service status monitoring

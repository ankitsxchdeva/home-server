# Homeview

An Apple Home style dashboard for Home Assistant, made for an iPad in landscape and
installable as a home-screen web app.

- **Rooms** come straight from your Home Assistant areas (sidebar in landscape, pills in portrait).
- **Home tab** shows status chips (climate, lights on, air quality), your scenes, then every room.
- **Tap** a tile to toggle it. **Press and hold** for big controls: brightness and warmth for
  lights, target temperature and mode for the thermostat, speed and presets for the Winix purifier.
- **Thermostat** taps always open its controls instead of toggling.
- **Live updates** over Home Assistant's WebSocket API, with automatic reconnects when the Pi reboots.
- **Hide** anything from its press-and-hold sheet; bring it back in Settings.

It is a static site (React + TypeScript + Vite) served by nginx at `https://home.ankit.casa`.
The browser talks to Home Assistant directly at `wss://ha.ankit.casa/api/websocket`. The
container holds no secrets.

## Set up the iPad

1. The iPad needs Tailscale, like every other `*.ankit.casa` device.
2. In Home Assistant (https://ha.ankit.casa), open your **profile → Security → Long-lived access
   tokens → Create token**. Name it something like `iPad Homeview`. Use an **admin** user: reading
   areas needs admin rights. Without it, everything shows in one room.
3. Open https://home.ankit.casa in Safari, keep the address `https://ha.ankit.casa`, paste the
   token and tap **Connect**. The token is stored only in this iPad's browser storage.
4. **Share → Add to Home Screen**. It opens full screen with its own icon.
5. For a wall or counter iPad: Settings → Display & Brightness → Auto-Lock → Never, and
   optionally Guided Access to pin it to the app.

To revoke access, delete the token in Home Assistant, or use **Settings → Forget token on this iPad**.

## Getting the rooms right

Tiles land in the room that Home Assistant assigns to the entity, or to its device. Set areas in
**Settings → Areas, labels & zones** in Home Assistant and the dashboard picks them up live.
Anything without an area shows in **Default Room**. Hidden, disabled, config and diagnostic
entities are skipped. Sensors only get a tile for temperature, humidity, AQI, PM2.5 and CO₂.

Tile names drop the room name, like Apple Home does: "Bedroom Lamp Left" in Bedroom shows as
"Lamp Left". Rename entities in Home Assistant to change what a tile says.

## Preview without Home Assistant

Open `/?demo` (for example `http://localhost:5173/?demo`) to try the layout with sample
devices modelled on this house. Nothing is saved or sent in demo mode.

## Develop

```bash
cd homeview
npm install
npm run dev        # http://localhost:5173 (also on your LAN, for testing on the iPad)
npm run build      # type-checks and writes dist/
```

## Deploy

`homeview/docker-compose.yml` is included from the root `docker-compose.yml`, and Caddy routes
`home.ankit.casa` to `homeview:80`. Merging to `main` lets the GitOps cron build the image
(Node build stage, then nginx) and reload Caddy, the same as every other service.
The wildcard cert already covers `home.ankit.casa`.

## Files

- `src/ha.ts`: connection, entity and registry subscriptions, service calls
- `src/model.ts`: which entities become tiles, room grouping, state text, status chips
- `src/components/`: `Dashboard`, `Tile`, `Sheet` (device controls), `VSlider`, `Setup`, `SettingsPanel`
- `src/demo.ts`: sample data for `?demo`

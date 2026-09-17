# Dynacat

Dashboard at **https://ankit.casa** (tailnet-only Caddy vhost, no published port). Replaced gethomepage (now in [`deprecated/homepage`](../deprecated/homepage/)).

- Upstream: [Panonim/dynacat](https://github.com/Panonim/dynacat) (Glance fork), image `panonim/dynacat:latest` (multi-arch; watchtower tracks updates).
- Config: [`config/dynacat.yml`](./config/dynacat.yml) — service links + live status (`monitor` widgets), Pi resources (`server-stats`), loaded Ollama model (`custom-api` against `https://ollama.ankit.casa/api/ps`), and the container fleet (`docker-containers`, read-only socket).
- Theme: [Colophon](https://github.com/ankitsxchdeva/design) — dark by default, `colophon-light` in the on-page theme picker. Colors are dynacat HSL keys in the config; self-hosted Lato + shape tokens in [`assets/custom.css`](./assets/custom.css) (`assets/fonts/`, OFL).
- The UI editor is **disabled** (`allow-editing: false`): config is GitOps-managed, and a UI-side edit on the Pi would diverge from git and choke the deploy cron.
- `.env` holds only `TZ` (see `.env.example`); must exist on the Pi before deploy or `docker compose up` fails at parse time.

/* ============================================================================
   ankit.casa service map — data model
   Everything below is grounded in the repo source (compose files, Dockerfiles,
   service code, scripts/). Coordinates are hand-placed on a 1850x1530 canvas,
   transit-map style. Lines are routed polylines through station sequences;
   journeys are curated per station with real ports, routes and hostnames.
   ============================================================================ */

const ZONES = [
  { id: "internet", name: "PUBLIC INTERNET", x: 40, y: 60, w: 290, h: 830,
    note: "untrusted — one door in" },
  { id: "pi", name: "RASPBERRY PI 5 · raspberrypi", x: 380, y: 60, w: 960, h: 1320,
    note: "docker compose · GitOps from main" },
  { id: "studio", name: "MAC STUDIO · studio", x: 1380, y: 60, w: 430, h: 360,
    note: "headless · ethernet · Metal GPU" },
  { id: "home", name: "HOME LAN · 192.168.1.0/24", x: 1380, y: 460, w: 430, h: 920,
    note: "Zigbee · Matter · HomeKit · AirPrint" },
  { id: "apis", name: "EXTERNAL APIS · outbound only", x: 380, y: 1400, w: 1430, h: 90,
    note: "no inbound listeners" },
];

/* The tailnet membrane: drawn as a dashed boundary around pi + studio. */
const TAILNET_BOUNDARY = { x: 368, y: 48, w: 1454, h: 1344,
  label: "Tailscale tailnet · WireGuard + MagicDNS · ankit.casa resolves to the Pi's tailscale IP · subnet router 192.168.1.0/24 + exit node",
  labelAt: [1095, 70] };

const LINES = {
  public: {
    name: "Public Ingress",
    color: "#e85f3c",
    offset: -8,
    desc: "The only way in from the internet. One static Tailscale Funnel mount on :10000 (host state, never changes) terminates TLS and proxies to Caddy's localhost :8089 block, where handle_path strips the prefix and routes. 443 can never be funneled (Caddy binds it), so this single port is the whole public surface.",
  },
  tailnet: {
    name: "Tailnet (you)",
    color: "#4f9cf5",
    offset: 0,
    desc: "How you reach everything. ankit.casa + *.ankit.casa resolve (unproxied Cloudflare DNS) to the Pi's Tailscale IP, so every URL works from any tailnet device anywhere with a real wildcard Let's Encrypt cert (DNS-01 via Cloudflare). Unreachable from the public internet.",
  },
  llm: {
    name: "LLM (Ollama)",
    color: "#a578e8",
    offset: 8,
    desc: "Inference lives off-Pi: Ollama runs natively on the Mac Studio (Metal GPU, qwen3.8:27b, bound 0.0.0.0:11434). Consumers call https://ollama.ankit.casa, which Caddy reverse-proxies over the tailnet to {$OLLAMA_UPSTREAM} from caddy/.env. rss-reader and quantlab are the consumers; quantlab is the only way public visitors touch it.",
  },
  smarthome: {
    name: "Smart Home",
    color: "#58b368",
    offset: 9,
    desc: "Home Assistant is the hub: ZHA over the EZSP USB stick for Zigbee, the Matter integration over python-matter-server's websocket (:5580) for the Govee lamps, homekit_controller pulling the thermostat in, and HASS Bridge (:21064) exposing everything back out to Apple Home. CUPS prints via usblp + host avahi mDNS.",
  },
  bots: {
    name: "Bots & Outbound APIs",
    color: "#e8a83d",
    offset: 0,
    desc: "Purely outbound traffic. Four Discord bots hold gateway websockets; services call their external APIs (Kalshi signed REST, Reddit public Atom feeds, Google Maps/Forms via Playwright, RSS feeds + scrapers, Yahoo Finance via curl). Nothing here listens for the internet.",
  },
  ops: {
    name: "Ops & Safety Net",
    color: "#99917f",
    offset: 0,
    desc: "The machinery that keeps the stack alive: a 5-minute GitOps cron (git pull + compose up -d --build + caddy reload), watchtower's nightly image updates, two host systemd watchdogs with gated restarts and kuma heartbeats, and the Sunday 03:00 backup tarball that lands off-box on the Studio.",
  },
};

/* ---------------------------------------------------------------------------
   STATIONS
   kind: you | external | edge | service | bot | infra | device | store
   lines: which lines STOP here (interchanges get a capsule)
   label: [dx, dy, anchor] offset for the text label
   facts: [key, value] rows for the panel
   routes: curated end-to-end journeys; hops are {line, from, to, label}
   ------------------------------------------------------------------------- */
const NODES = [
  /* ── PUBLIC INTERNET zone ─────────────────────────────────────────── */
  { id: "guests", name: "Guest browsers", kind: "external", x: 200, y: 140,
    lines: ["public"], label: [16, 4, "start"],
    desc: "Anyone on the public internet. There is exactly one way in: Tailscale Funnel on :10000, which proxies to Caddy's localhost :8089 block where every public route lives in the Caddyfile.",
    facts: [["Entry", "https://raspberrypi.tail9476fb.ts.net:10000"], ["Reaches", "/ → kalshi-pnl · /lede → rss-reader · /quantlab → quantlab · /$PARK_PUBLIC_PATH → park page"], ["TLS", "terminated by tailscaled, then plain HTTP to 127.0.0.1:8089"]],
    routes: [
      { title: "Any public request", hops: [
        { line: "public", from: "guests", to: "funnel", label: "HTTPS :10000 (only funneled port in use)" },
        { line: "public", from: "funnel", to: "caddy", label: "static mount → 127.0.0.1:8089" },
        { line: "public", from: "caddy", to: "kalshipnl", label: "handle_path routes by longest prefix" },
      ]},
    ]},
  { id: "site", name: "ankitsachdeva.com", kind: "external", x: 200, y: 270,
    lines: ["public"], label: [16, 4, "start"],
    desc: "Your GitHub Pages site. Its pages (/kalshi, /lede, /quantlab) point visitors at the funnel endpoints; the browser does the cross-origin fetch. CORS is pinned where the app has secrets to lose (quantlab) and open where it doesn't (kalshi-pnl returns one number).",
    facts: [["Hosted", "GitHub Pages"], ["Fetches", ":10000/ · :10000/lede · :10000/quantlab"]],
    routes: [
      { title: "Page feeds itself", hops: [
        { line: "public", from: "site", to: "guests", label: "redirects / browser-side fetch" },
        { line: "public", from: "guests", to: "funnel", label: "HTTPS :10000" },
        { line: "public", from: "funnel", to: "caddy", label: "→ 127.0.0.1:8089" },
      ]},
    ]},
  { id: "you", name: "Your devices", kind: "you", x: 200, y: 400,
    lines: ["tailnet"], label: [16, 4, "start"],
    desc: "Laptop, phone, anything on the tailnet. Every *.ankit.casa URL works from anywhere with a real wildcard cert, and the public internet can't reach any of it. SSH mesh links laptop → Pi → Studio in all four legs.",
    facts: [["DNS", "ankit.casa → Pi tailscale IP (unproxied)"], ["Cert", "wildcard Let's Encrypt via Cloudflare DNS-01"], ["Also", "ssh raspberrypi · ssh studio over MagicDNS"]],
    routes: [
      { title: "Open any dashboard", hops: [
        { line: "tailnet", from: "you", to: "caddy", label: "https://name.ankit.casa :443" },
        { line: "tailnet", from: "caddy", to: "homepage", label: "vhost match → reverse_proxy by container name" },
      ]},
    ]},
  { id: "feeds", name: "RSS feeds + scrapers", kind: "external", x: 200, y: 560,
    lines: ["bots"], label: [16, 4, "start"],
    desc: "Everything rss-reader pulls: the feeds in feeds.yaml plus two scrapers for sites without feeds (HN via the official Algolia API, a Yahoo Finance topic page via HTML parsing).",
    facts: [["Pulled by", "rss-reader every 30 min"], ["How", "httpx AsyncClient, custom UA, concurrency 8"]],
    routes: []},
  { id: "github", name: "GitHub · home-server", kind: "external", x: 200, y: 740,
    lines: ["ops"], label: [16, 4, "start"],
    desc: "The public repo this map lives in. Push to main IS the deploy: the Pi's cron fetches every 5 minutes and rebuilds on change. quantlab's app image is built from its own separate repo.",
    facts: [["Deploy", "push to main → live in ≤ 5 min"], ["CI", "docker compose config -q on every push"], ["Note", "AGENTS.md / CLAUDE.md deliberately untracked"]],
    routes: [
      { title: "A push goes live", hops: [
        { line: "ops", from: "github", to: "cron", label: "git fetch every 5 min (flock-guarded)" },
        { line: "ops", from: "cron", to: "dockerd", label: "origin/main changed → git pull && docker compose up -d --build" },
      ]},
    ]},

  /* ── EXTERNAL APIS strip ──────────────────────────────────────────── */
  { id: "discord", name: "Discord", kind: "external", x: 620, y: 1445,
    lines: ["bots"], label: [0, 26, "middle"],
    desc: "Gateway for all four bots. They hold outbound websockets (discord.py); nothing inbound reaches the Pi.",
    facts: [["Consumers", "commute-bot · autovrr · gform-image-embed · reddit-swap-notifier"]], routes: []},
  { id: "google", name: "Google · Maps + Forms", kind: "external", x: 790, y: 1445,
    lines: ["bots"], label: [0, 26, "middle"],
    desc: "commute-bot calls the Directions API for drive times; gform-image-embed drives headless Chromium to fetch session-scoped form images.",
    facts: [["Maps", "Directions API, blocking requests in asyncio.to_thread"], ["Forms", "Playwright sync API, images via page.request"]], routes: []},
  { id: "reddit", name: "Reddit", kind: "external", x: 950, y: 1445,
    lines: ["bots"], label: [0, 26, "middle"],
    desc: "Public Atom feeds only, no API credentials. reddit-swap-notifier fetches combined multi-sub /new.rss feeds with a custom UA; a redirect/403/404 benches a subreddit for an hour.",
    facts: [["Shape", "r/a+b+c/new.rss?limit=100 in one request"], ["Creds", "none"]], routes: []},
  { id: "vrr", name: "VRR parking portal", kind: "external", x: 1110, y: 1445,
    lines: ["bots"], label: [0, 26, "middle"],
    desc: "app.vrrparking.com. autovrr drives it with a fresh headless Chromium per registration: form, submit, review page, I-agree checkbox, final submit. No API exists.",
    facts: [["Driven by", "Playwright async API"], ["Gotcha", "duplicate hidden buttons → :visible locators"]], routes: []},
  { id: "kalshiapi", name: "Kalshi API", kind: "external", x: 1270, y: 1445,
    lines: ["bots"], label: [0, 26, "middle"],
    desc: "Two consumers. kalshi-pnl signs trade-API requests RSA-PSS/SHA-256 (key + PEM, scp'd by hand) and reads balance/deposits/withdrawals. quantlab reads public market data for the arb scan, unsigned.",
    facts: [["kalshi-pnl", "signed · /portfolio/* + /margin/balance"], ["quantlab", "unsigned · public markets"]], routes: []},
  { id: "yahoo", name: "Yahoo Finance", kind: "external", x: 1430, y: 1445,
    lines: ["bots"], label: [0, 26, "middle"],
    desc: "Price bars for quantlab backtests. Yahoo TLS/UA-fingerprints and 429s Node/undici, so the app shells out to curl with a minimal UA.",
    facts: [["Consumer", "quantlab /api/run"], ["Transport", "curl subprocess, not undici"]], routes: []},

  /* ── PI: edge ─────────────────────────────────────────────────────── */
  { id: "funnel", name: "Tailscale Funnel :10000", kind: "edge", x: 500, y: 140,
    lines: ["public"], label: [-4, -18, "middle"],
    desc: "Host state, not Docker: one static `tailscale funnel` mount that survives `compose down` and must be re-created on rebuild (RESTORE.md). Terminates TLS, proxies to Caddy 127.0.0.1:8089. The Pi's tailnet node name must stay `raspberrypi` or every funnel URL breaks.",
    facts: [["Type", "host state · static mount"], ["Ports", "10000 only (443 un-funnelable, 8443 retired)"], ["Survives", "docker compose down"]],
    routes: [
      { title: "Public ingress", hops: [
        { line: "public", from: "guests", to: "funnel", label: "HTTPS :10000" },
        { line: "public", from: "funnel", to: "caddy", label: "→ 127.0.0.1:8089 (localhost only)" },
      ]},
    ]},
  { id: "caddy", name: "Caddy", kind: "edge", x: 660, y: 470,
    lines: ["public", "tailnet", "llm"], label: [-16, -6, "end"],
    desc: "The interchange everything passes through. Custom xcaddy build with the Cloudflare DNS plugin for the wildcard cert. Serves ankit.casa + *.ankit.casa on :80/:443 and the public front door on 127.0.0.1:8089. All routing lives in one Caddyfile, versioned in git; the GitOps cron force-reloads it because --watch misses git's inode swap.",
    facts: [
      ["Ports", "80 · 443 published · 8089 on 127.0.0.1"],
      ["Cert", "wildcard LE, DNS-01 (CF_API_TOKEN in caddy/.env)"],
      ["Vhosts", "13 named + default → homepage"],
      ["Public routes", "/ kalshi-pnl · /lede rss-reader · /quantlab quantlab · /$PARK_PUBLIC_PATH autovrr"],
      ["Env", "CF_API_TOKEN · OLLAMA_UPSTREAM · PARK_PUBLIC_PATH · LAN_IP"],
      ["DNS", "container uses 1.1.1.1 (host resolv.conf is MagicDNS)"],
    ],
    routes: [
      { title: "Tailnet vhost", hops: [
        { line: "tailnet", from: "you", to: "caddy", label: "https://kuma.ankit.casa :443" },
        { line: "tailnet", from: "caddy", to: "kuma", label: "reverse_proxy uptime-kuma:3001" },
      ]},
      { title: "Public path route", hops: [
        { line: "public", from: "guests", to: "funnel", label: "HTTPS :10000" },
        { line: "public", from: "funnel", to: "caddy", label: "→ 127.0.0.1:8089" },
        { line: "public", from: "caddy", to: "rss", label: "handle_path /lede* strips prefix → rss-reader:8000" },
      ]},
      { title: "Off-box proxy", hops: [
        { line: "llm", from: "caddy", to: "ollama", label: "ollama.ankit.casa → {$OLLAMA_UPSTREAM} = studio:11434" },
      ]},
    ]},

  /* ── PI: trunk 1 — public-facing web services (y=470) ─────────────── */
  { id: "f13ft", name: "13ft", kind: "service", x: 830, y: 470,
    lines: ["tailnet"], label: [0, -20, "middle"],
    desc: "Self-hosted paywall-bypass reader (Flask). Fetches any pasted URL with a Googlebot UA and rewrites the HTML with a <base> tag. Tailnet-only; rss-reader can optionally route paywalled sources through it (PAYWALL_PROXY, currently commented out).",
    facts: [["URL", "https://13ft.ankit.casa"], ["Port", "5000 (Flask dev server)"], ["Stack", "requests + BeautifulSoup · no DB, no auth"]],
    routes: [
      { title: "Read an article", hops: [
        { line: "tailnet", from: "you", to: "caddy", label: "https://13ft.ankit.casa" },
        { line: "tailnet", from: "caddy", to: "f13ft", label: "reverse_proxy 13ft:5000" },
      ]},
    ]},
  { id: "rss", name: "rss-reader", kind: "service", x: 950, y: 470,
    lines: ["public", "tailnet", "llm", "bots"], label: [0, 26, "middle"],
    desc: "The lede digest engine. FastAPI on :8000 with a background build loop (every 30 min) that pulls feeds.yaml + two scrapers, summarizes through Ollama with a circuit breaker and per-cycle cap, and atomically writes data/data.json. SQLite holds read-later items and the summary cache. Degrades to raw feed summaries when Ollama is down.",
    facts: [
      ["URL", "https://rss.ankit.casa/docs · public :10000/lede"],
      ["Port", "8000 · uvicorn"],
      ["Loop", "POLL_INTERVAL_SECONDS=1800 · concurrency 8"],
      ["LLM", "OLLAMA_URL → ollama.ankit.casa · qwen3.8:27b"],
      ["State", "data/data.json (atomic) · data/saved.db (sqlite)"],
      ["Guard", "/saved needs X-Lede-Token · /healthz for kuma"],
    ],
    routes: [
      { title: "Guest reads lede", hops: [
        { line: "public", from: "guests", to: "funnel", label: "HTTPS :10000" },
        { line: "public", from: "funnel", to: "caddy", label: "→ :8089" },
        { line: "public", from: "caddy", to: "rss", label: "handle_path /lede* → rss-reader:8000" },
      ]},
      { title: "Digest build (every 30 min)", hops: [
        { line: "bots", from: "rss", to: "feeds", label: "httpx: feeds.yaml + HN Algolia + Yahoo HTML scrapers" },
        { line: "llm", from: "rss", to: "caddy", label: "POST /api/generate → ollama.ankit.casa" },
        { line: "llm", from: "caddy", to: "ollama", label: "→ studio:11434 · item summaries + daily themes" },
      ]},
      { title: "You check the API", hops: [
        { line: "tailnet", from: "you", to: "caddy", label: "https://rss.ankit.casa/docs" },
        { line: "tailnet", from: "caddy", to: "rss", label: "reverse_proxy rss-reader:8000" },
      ]},
    ]},
  { id: "kalshipnl", name: "kalshi-pnl", kind: "service", x: 1070, y: 470,
    lines: ["public", "tailnet", "bots"], label: [0, -20, "middle"],
    desc: "Lifetime Kalshi P/L as one bare number. FastAPI on :8000; per request it signs trade-API calls (RSA-PSS over key + timestamp) for balance, deposits, withdrawals and the perps wallet, then returns account value + withdrawals − deposits. Totals never leave the wire. The funnel's default route, so it answers on / for the whole public hostname.",
    facts: [
      ["URL", "https://kalshi.ankit.casa/pnl · public :10000/"],
      ["Port", "8000 · uvicorn · CORS *"],
      ["Auth", "KALSHI_API_KEY_ID + PEM (scp'd by hand)"],
      ["Response", "{\"pnl\": -267.52} · computed per request"],
    ],
    routes: [
      { title: "Visitor sees the number", hops: [
        { line: "public", from: "guests", to: "funnel", label: "HTTPS :10000/ (default route)" },
        { line: "public", from: "funnel", to: "caddy", label: "→ :8089" },
        { line: "public", from: "caddy", to: "kalshipnl", label: "handle (fallback) → kalshi-pnl:8000" },
        { line: "bots", from: "kalshipnl", to: "kalshiapi", label: "signed GET /portfolio/* + /margin/balance" },
      ]},
    ]},
  { id: "quantlab", name: "quantlab", kind: "service", x: 1190, y: 470,
    lines: ["public", "tailnet", "llm", "bots"], label: [0, 26, "middle"],
    desc: "Backtest API + Kalshi parlay scan. The app source lives in its own repo and the image git-clones it at build, so deploys need --no-cache. /api/run compiles a strategy with an LLM (default: the keyless local Ollama, rate-limited and concurrency-capped; or visitor BYOK, never stored), fetches Yahoo bars via curl, and runs the backtest. Stateless, holds no secrets.",
    facts: [
      ["URL", "https://quantlab.ankit.casa · public :10000/quantlab"],
      ["Port", "3000 · cpus capped at 2.0"],
      ["Build", "from github.com/ankitsxchdeva/quantlab #main"],
      ["LLM", "ollama provider → ollama.ankit.casa/v1 · pinned qwen3.8:27b"],
      ["Abuse guards", "5/min/IP + 60/hr global + 2 concurrent (ollama)"],
      ["Env", "ALLOWED_ORIGINS only · no env_file"],
    ],
    routes: [
      { title: "Visitor runs a backtest", hops: [
        { line: "public", from: "guests", to: "funnel", label: "HTTPS :10000/quantlab" },
        { line: "public", from: "funnel", to: "caddy", label: "→ :8089" },
        { line: "public", from: "caddy", to: "quantlab", label: "handle_path /quantlab* → quantlab:3000" },
        { line: "llm", from: "quantlab", to: "caddy", label: "POST /api/run → ollama.ankit.casa/v1 (keyless)" },
        { line: "llm", from: "caddy", to: "ollama", label: "→ studio:11434 · strategy → code" },
        { line: "bots", from: "quantlab", to: "yahoo", label: "price bars via curl (undici gets 429'd)" },
      ]},
      { title: "Parlay scan", hops: [
        { line: "bots", from: "quantlab", to: "kalshiapi", label: "POST /api/arb → public Kalshi market data" },
      ]},
    ]},

  /* ── PI: trunk 2 — dashboards (y=620) ─────────────────────────────── */
  { id: "homepage", name: "homepage", kind: "service", x: 860, y: 620,
    lines: ["tailnet", "ops"], label: [0, -20, "middle"],
    desc: "The dashboard at ankit.casa, and the wildcard's catch-all: any unmatched subdomain lands here. Tiles get live status dots and CPU/mem from the docker socket (read-only), and one real widget watches Ollama.",
    facts: [
      ["URL", "https://ankit.casa (default route)"],
      ["Port", "3000 · gethomepage"],
      ["Socket", "docker.sock ro · PUID 1000 / PGID 991 (docker group)"],
      ["Widget", "ollama → https://ollama.ankit.casa"],
    ],
    routes: [
      { title: "Open the dashboard", hops: [
        { line: "tailnet", from: "you", to: "caddy", label: "https://ankit.casa (or any unmatched subdomain)" },
        { line: "tailnet", from: "caddy", to: "homepage", label: "default handle → homepage:3000" },
      ]},
      { title: "Tile status dots", hops: [
        { line: "ops", from: "homepage", to: "dockerd", label: "docker.sock (ro): container status + CPU/mem" },
      ]},
    ]},
  { id: "kuma", name: "uptime-kuma", kind: "service", x: 980, y: 620,
    lines: ["tailnet", "ops"], label: [0, 26, "middle"],
    desc: "Monitoring and alerting. Its one published port (3001) is bound to localhost purely so the host watchdogs can push heartbeats; humans use the Caddy vhost. Monitor targets live in the UI, not in git; the DB rides the backup tarball.",
    facts: [
      ["URL", "https://kuma.ankit.casa"],
      ["Port", "3001 on 127.0.0.1 (for watchdog heartbeats)"],
      ["Push URL shape", "http://127.0.0.1:3001/api/push/<token>"],
    ],
    routes: [
      { title: "Watchdog heartbeat", hops: [
        { line: "ops", from: "watchdogs", to: "kuma", label: "curl $KUMA_PUSH_URL?status=up|down every 5 min" },
      ]},
      { title: "You check status", hops: [
        { line: "tailnet", from: "you", to: "caddy", label: "https://kuma.ankit.casa" },
        { line: "tailnet", from: "caddy", to: "kuma", label: "reverse_proxy uptime-kuma:3001" },
      ]},
    ]},
  { id: "glances", name: "glances", kind: "service", x: 1100, y: 620,
    lines: ["tailnet", "ops"], label: [0, -20, "middle"],
    desc: "System resources in web mode (-w, 2s refresh). Runs with pid: host so it sees the Pi's real processes, plus a read-only docker socket for container stats.",
    facts: [["URL", "https://glances.ankit.casa"], ["Port", "61208"], ["Host depth", "pid: host + docker.sock ro"]],
    routes: [
      { title: "Check the Pi's vitals", hops: [
        { line: "tailnet", from: "you", to: "caddy", label: "https://glances.ankit.casa" },
        { line: "tailnet", from: "caddy", to: "glances", label: "reverse_proxy glances:61208" },
      ]},
    ]},
  { id: "dozzle", name: "dozzle", kind: "service", x: 1220, y: 620,
    lines: ["tailnet", "ops"], label: [0, 26, "middle"],
    desc: "Live container logs. The whole service is a read-only docker socket and a web UI; no auth, because the tailnet is the boundary.",
    facts: [["URL", "https://logs.ankit.casa"], ["Port", "8080"], ["Socket", "docker.sock ro"]],
    routes: [
      { title: "Read logs", hops: [
        { line: "tailnet", from: "you", to: "caddy", label: "https://logs.ankit.casa" },
        { line: "tailnet", from: "caddy", to: "dozzle", label: "reverse_proxy dozzle:8080" },
        { line: "ops", from: "dozzle", to: "dockerd", label: "docker.sock (ro): stream container logs" },
      ]},
    ]},

  /* ── PI: trunk 3 — host-network services (y=780) ──────────────────── */
  { id: "ha", name: "Home Assistant", kind: "service", x: 820, y: 780,
    lines: ["tailnet", "smarthome"], label: [-2, -20, "middle"],
    desc: "The smart-home hub, host-networked on :8123 and behind ha.ankit.casa (Caddy is a trusted proxy). All integrations (ZHA, Matter, homekit_controller, HASS Bridge) live in .storage, invisible to git but present in the backup tarball. Automations: sunset lights, 06:15 sunrise alarm, scheduled lights-out, and the RODRET brightness cycle that fires once the dimmer re-pairs.",
    facts: [
      ["URL", "https://ha.ankit.casa · :8123 on LAN"],
      ["Network", "host · privileged"],
      ["Integrations", "ZHA · Matter · homekit_controller · HASS Bridge :21064"],
      ["Config", "integrations in .storage (not in git)"],
    ],
    routes: [
      { title: "You open HA", hops: [
        { line: "tailnet", from: "you", to: "caddy", label: "https://ha.ankit.casa" },
        { line: "tailnet", from: "caddy", to: "ha", label: "reverse_proxy {$LAN_IP}:8123 (host network)" },
      ]},
      { title: "Lights via Zigbee", hops: [
        { line: "smarthome", from: "ha", to: "stick", label: "ZHA · EZSP coordinator /dev/ttyUSB0" },
        { line: "smarthome", from: "stick", to: "mesh", label: "Zigbee mesh (TRADFRI routers)" },
      ]},
      { title: "Lamps via Matter", hops: [
        { line: "smarthome", from: "ha", to: "matter", label: "Matter integration → ws :5580" },
        { line: "smarthome", from: "matter", to: "govee", label: "mDNS / LAN commissioning" },
      ]},
      { title: "To Apple Home", hops: [
        { line: "smarthome", from: "ha", to: "apple", label: "HASS Bridge :21064 exposes climate + lights" },
      ]},
    ]},
  { id: "netalertx", name: "netalertx", kind: "service", x: 960, y: 780,
    lines: ["tailnet", "smarthome"], label: [0, 26, "middle"],
    desc: "LAN device discovery and change alerting via ARP scanning. Host-networked (that's why Caddy routes to it via $LAN_IP) with NET_ADMIN/NET_RAW caps; config and DB are runtime state, not git.",
    facts: [["URL", "https://netalertx.ankit.casa"], ["Port", "20211 on host network"], ["Caps", "NET_ADMIN · NET_RAW"]],
    routes: [
      { title: "Scan the LAN", hops: [
        { line: "smarthome", from: "netalertx", to: "printer", label: "ARP scan of 192.168.1.0/24" },
      ]},
    ]},
  { id: "cups", name: "CUPS", kind: "service", x: 1100, y: 780,
    lines: ["tailnet", "smarthome", "ops"], label: [0, -20, "middle"],
    desc: "Print server for the Beeprt label printer, host-networked on :631. USB access comes from device_cgroup_rules (not a hard /dev/usb/lp0 mapping, which blocked container start when the printer was off). mDNS advertisement is done by the HOST avahi over the dbus mount, which is exactly what the printer watchdog re-asserts.",
    facts: [
      ["URL", "https://cups.ankit.casa · :631 on LAN"],
      ["Queue", "PL70e-BT via raw usblp backend"],
      ["mDNS", "host avahi-daemon (eth0, IPv4) over /var/run/dbus"],
    ],
    routes: [
      { title: "AirPrint a label", hops: [
        { line: "smarthome", from: "cups", to: "printer", label: "usblp:/dev/usb/lp0 · job data cat'd to kernel device" },
      ]},
      { title: "Watchdog keeps it discoverable", hops: [
        { line: "ops", from: "watchdogs", to: "cups", label: "mDNS check fails → restart avahi, then cups" },
      ]},
    ]},
  { id: "matter", name: "matter-server", kind: "service", x: 900, y: 880,
    lines: ["smarthome", "ops"], label: [14, 22, "start"],
    desc: "python-matter-server, host-networked for mDNS. HA's Matter integration consumes its websocket API on :5580. /info returns 200 even when every node is dead, so health runs through healthcheck.py (get_nodes, at least one available) — the container healthcheck reports, the host watchdog remediates.",
    facts: [
      ["API", "websocket :5580/ws · /info (HTTP)"],
      ["State", "fabric certs in ./data (backup tarball)"],
      ["Health", "2 layers: container check (report) + host watchdog (restart)"],
    ],
    routes: [
      { title: "Command a lamp", hops: [
        { line: "smarthome", from: "ha", to: "matter", label: "Matter integration → ws://host:5580/ws" },
        { line: "smarthome", from: "matter", to: "govee", label: "operational over LAN (mDNS discovery)" },
      ]},
      { title: "Wedge recovery", hops: [
        { line: "ops", from: "watchdogs", to: "matter", label: "docker exec healthcheck.py; 3 fails + 1/hr cap → restart" },
      ]},
    ]},

  /* ── PI: bots row (y=1100) ────────────────────────────────────────── */
  { id: "commute", name: "commute-bot", kind: "bot", x: 680, y: 1100,
    lines: ["bots"], label: [0, 30, "middle"],
    desc: "Slash commands /gowork and /gohome reply with current drive time including traffic. The simplest bot in the stack: no ports, no DB, just a Discord websocket and the Directions API.",
    facts: [["Stack", "discord.py + Google Directions API"], ["Ports", "none (pure outbound)"]],
    routes: [
      { title: "/gowork", hops: [
        { line: "bots", from: "commute", to: "discord", label: "gateway websocket: slash command" },
        { line: "bots", from: "commute", to: "google", label: "Directions API: home → work with traffic" },
      ]},
    ]},
  { id: "gform", name: "gform-image-embed", kind: "bot", x: 830, y: 1100,
    lines: ["bots"], label: [0, 30, "middle"],
    desc: "Watches a channel for Google Forms links and replies with every embedded image (collage past 10). Extraction runs in a --worker child process because a wedged Playwright ignores asyncio cancellation; the parent SIGKILLs the whole process group at 120s. Also: a pears.gif gag on a timer.",
    facts: [["Stack", "discord.py + Playwright (sync) + Pillow"], ["Safety", "init: true reaps zombie chromium"], ["Ports", "none"]],
    routes: [
      { title: "Form link posted", hops: [
        { line: "bots", from: "gform", to: "discord", label: "gateway: on_message (message_content intent)" },
        { line: "bots", from: "gform", to: "google", label: "headless Chromium: session-scoped image URLs" },
      ]},
    ]},
  { id: "autovrr", name: "autovrr", kind: "bot", x: 980, y: 1100,
    lines: ["public", "tailnet", "bots"], label: [6, 34, "middle"],
    desc: "Guest parking registration, and an interchange: launcher.py runs BOTH the Discord bot and uvicorn (web:app on :8003) in one container, sharing vrr.py and the installed Chromium. The guest page sits behind a login (HMAC session cookie keyed on PARK_PASSWORD), rate limits, and a single-flight lock; /healthz is public for kuma.",
    facts: [
      ["URL", "https://park.ankit.casa · public at unguessable /$PARK_PUBLIC_PATH"],
      ["Port", "8003 (web) + Discord gateway (bot) · one container"],
      ["Auth", "password → HMAC-SHA256 cookie, 7d, fail-closed"],
      ["Guards", "5 regs/hr/IP · 10 logins/5min · asyncio single-flight"],
      ["Public path", "PARK_PUBLIC_PATH in caddy/.env"],
    ],
    routes: [
      { title: "Guest registers parking", hops: [
        { line: "public", from: "guests", to: "funnel", label: "HTTPS :10000/$PARK_PUBLIC_PATH" },
        { line: "public", from: "funnel", to: "caddy", label: "→ :8089 (prefix stripped)" },
        { line: "public", from: "caddy", to: "autovrr", label: "reverse_proxy autovrr:8003 → login → form" },
        { line: "bots", from: "autovrr", to: "vrr", label: "fresh Chromium: form → review → I-agree → submit" },
      ]},
      { title: "/park from Discord", hops: [
        { line: "bots", from: "autovrr", to: "discord", label: "gateway: /park /quickpark" },
        { line: "bots", from: "autovrr", to: "vrr", label: "same vrr.py flow as the web path" },
      ]},
    ]},
  { id: "swap", name: "reddit-swap-notifier", kind: "bot", x: 1130, y: 1100,
    lines: ["bots"], label: [0, 30, "middle"],
    desc: "Pings you when new swap-subreddit posts match your keywords. One process, two halves: the discord.py client and a Poller loop sharing a SQLite connection. Watches survive rebuilds via the ./data volume; a created_at gate means old posts never ping.",
    facts: [["Stack", "discord.py + aiohttp + sqlite"], ["Poll", "every 60s · combined multi-sub Atom feed"], ["DB", "/app/data/bot.db (host-mounted)"], ["Ports", "none"]],
    routes: [
      { title: "Keyword match → ping", hops: [
        { line: "bots", from: "swap", to: "reddit", label: "poll /new.rss (no creds, custom UA)" },
        { line: "bots", from: "swap", to: "discord", label: "gateway: DM/channel ping on match" },
      ]},
    ]},

  /* ── PI: ops row (y=1260) ─────────────────────────────────────────── */
  { id: "cron", name: "ankit crontab", kind: "infra", x: 500, y: 1260,
    lines: ["ops"], label: [-16, 4, "end"],
    desc: "Three jobs. Every 5 min: flock-guarded git fetch, and if origin/main moved, pull + compose up -d --build + a graceful caddy reload (the deterministic path; --watch is unreliable across inode swaps). Sunday 04:30: docker system prune of week-old build cache. Sunday 03:00: the backup.",
    facts: [
      ["GitOps", "*/5 * * * * · push to main = deploy"],
      ["Prune", "Sun 04:30 · system prune -af until=168h"],
      ["Backup", "Sun 03:00 · sudo scripts/backup.sh"],
    ],
    routes: [
      { title: "Deploy", hops: [
        { line: "ops", from: "github", to: "cron", label: "git fetch; origin/main changed?" },
        { line: "ops", from: "cron", to: "dockerd", label: "git pull && compose up -d --build && caddy reload" },
      ]},
      { title: "Backup", hops: [
        { line: "ops", from: "cron", to: "backup", label: "Sun 03:00 · sudo scripts/backup.sh" },
        { line: "ops", from: "backup", to: "pibackups", label: "scp as ankit (root has no Studio key)" },
      ]},
    ]},
  { id: "backup", name: "backup.sh", kind: "infra", x: 680, y: 1260,
    lines: ["ops"], label: [0, 30, "middle"],
    desc: "Tarballs everything git can't hold: every service .env, HA config (including .storage pairings), matter fabric certs, kuma + swap-notifier DBs (hot copies), netalertx DB, cups config. Keeps the newest 4 on the Pi, scp's a copy to the Studio which keeps 12.",
    facts: [
      ["Runs as", "root · scp drops to sudo -u ankit"],
      ["Local", "/home/ankit/backups · newest 4"],
      ["Off-box", "studio:~/pi-backups · newest 12"],
    ],
    routes: [
      { title: "Sunday 03:00", hops: [
        { line: "ops", from: "cron", to: "backup", label: "sudo scripts/backup.sh" },
        { line: "ops", from: "backup", to: "pibackups", label: "scp over tailnet → ~/pi-backups" },
      ]},
    ]},
  { id: "watchdogs", name: "systemd watchdogs", kind: "infra", x: 850, y: 1260,
    lines: ["ops"], label: [0, 30, "middle"],
    desc: "Two host-level systemd timers (not Docker, so they survive stack rebuilds of containers but must be re-installed on a Pi rebuild). printer-watchdog re-asserts the CUPS/avahi mDNS fix; matter-watchdog restarts matter-server only when the LAN is up, after 3 consecutive failures, max once an hour. Both heartbeat to kuma's localhost push port.",
    facts: [
      ["Units", "printer-watchdog.timer · matter-watchdog.timer (5 min)"],
      ["Host units", "not covered by GitOps · see scripts/*.md"],
      ["Gating", "LAN-up check · FAIL_THRESHOLD=3 · 1 restart/hr"],
    ],
    routes: [
      { title: "Printer loop", hops: [
        { line: "ops", from: "watchdogs", to: "cups", label: "CUPS answers? mDNS resolves? else restart avahi + cups" },
        { line: "ops", from: "watchdogs", to: "kuma", label: "push heartbeat → 127.0.0.1:3001" },
      ]},
      { title: "Matter loop", hops: [
        { line: "ops", from: "watchdogs", to: "matter", label: "docker exec healthcheck.py → gated restart" },
        { line: "ops", from: "watchdogs", to: "kuma", label: "push heartbeat → 127.0.0.1:3001" },
      ]},
    ]},
  { id: "dockerd", name: "docker engine", kind: "infra", x: 1030, y: 1260,
    lines: ["ops"], label: [0, 30, "middle"],
    desc: "The Pi's Docker daemon. Socket consumers: homepage, glances and dozzle read-only; watchtower is the only one with read-write. daemon.json (snapshot in scripts/) sets log rotation.",
    facts: [["Socket ro", "homepage · glances · dozzle"], ["Socket rw", "watchtower (only)"]],
    routes: []},
  { id: "watchtower", name: "watchtower", kind: "infra", x: 1200, y: 1260,
    lines: ["ops"], label: [0, 30, "middle"],
    desc: "Nightly image auto-updates (4 AM, maintained nickfedor fork) with cleanup of old images. No skip-list in the active stack, so it updates everything; locally-built images are skipped by design.",
    facts: [["Schedule", "0 0 4 * * * · WATCHTOWER_CLEANUP=true"], ["Socket", "docker.sock rw"]],
    routes: [
      { title: "Nightly update", hops: [
        { line: "ops", from: "watchtower", to: "dockerd", label: "pull new images → recreate containers → prune old" },
      ]},
    ]},

  /* ── MAC STUDIO ───────────────────────────────────────────────────── */
  { id: "ollama", name: "Ollama · qwen3.8:27b", kind: "store", x: 1560, y: 240,
    lines: ["llm", "tailnet"], label: [-18, 4, "end"],
    desc: "Native macOS LaunchAgent on the Studio (Metal GPU; Mac Docker has no GPU passthrough, so never a container), bound to 0.0.0.0:11434 on ethernet. Headless-verified: cold boot brings up SSH → auto-login → Ollama with nobody at the console. Single model, kept warm by rss-reader's keep-alive.",
    facts: [
      ["API", "https://ollama.ankit.casa/v1 (OpenAI-compatible)"],
      ["Serve", "com.local.ollama.plist · 0.0.0.0:11434"],
      ["Model", "qwen3.8:27b (only model)"],
      ["Consumers", "rss-reader summaries · quantlab compile · homepage widget"],
    ],
    routes: [
      { title: "A summary request", hops: [
        { line: "llm", from: "rss", to: "caddy", label: "POST /api/generate → ollama.ankit.casa" },
        { line: "llm", from: "caddy", to: "ollama", label: "reverse_proxy {$OLLAMA_UPSTREAM} over tailnet" },
      ]},
      { title: "You query it directly", hops: [
        { line: "tailnet", from: "you", to: "caddy", label: "https://ollama.ankit.casa/v1" },
        { line: "tailnet", from: "caddy", to: "ollama", label: "tailnet-only by design" },
      ]},
    ]},
  { id: "pibackups", name: "pi-backups", kind: "store", x: 1560, y: 350,
    lines: ["ops"], label: [18, 4, "start"],
    desc: "The off-box copy of every Sunday tarball. Pi keeps the newest 4 locally; the Studio keeps 12. RESTORE.md rebuilds the Pi from a bare SD card plus one of these.",
    facts: [["Path", "~/pi-backups on studio"], ["Retention", "newest 12"], ["Feed", "scp from backup.sh as ankit"]],
    routes: [
      { title: "Weekly arrival", hops: [
        { line: "ops", from: "cron", to: "backup", label: "Sun 03:00" },
        { line: "ops", from: "backup", to: "pibackups", label: "scp over tailnet (ssh key mesh)" },
      ]},
    ]},

  /* ── HOME LAN ─────────────────────────────────────────────────────── */
  { id: "stick", name: "EZSP Zigbee stick", kind: "device", x: 1560, y: 560,
    lines: ["smarthome"], label: [18, 4, "start"],
    desc: "USB Zigbee coordinator on /dev/ttyUSB0, consumed by ZHA. The root of the Zigbee mesh.",
    facts: [["Device", "/dev/ttyUSB0"], ["Integration", "ZHA"]],
    routes: []},
  { id: "mesh", name: "Zigbee mesh", kind: "device", x: 1560, y: 670,
    lines: ["smarthome"], label: [18, 4, "start"],
    desc: "TRADFRI bulbs (the only routers, so the mesh is thin) plus the H6006 counter lights. A bulb once got Touchlink-stolen off ZHA by a nearby pairing dimmer; fixed with a 6x power-toggle reset.",
    facts: [["Routers", "1-2 TRADFRI bulbs (weak until more lights)"], ["Endpoint", "H6006 counter lights ×2"]],
    routes: []},
  { id: "rodret", name: "RODRET dimmer", kind: "device", x: 1560, y: 760,
    lines: ["smarthome"], label: [18, 4, "start"], dashed: true,
    desc: "IKEA dimmer, currently NOT on the network (re-pairing paused). The cycle automation is deployed and fires the moment a press lands. Re-pair gotcha: hold the pinhole near the Pi but AWAY from bulbs, or Touchlink steals one.",
    facts: [["State", "pending re-pair"], ["IEEE", "ec:f6:4c:ff:fe:1e:02:61"], ["Automation", "rodret_living_room_cycle: 30/60/100/off"]],
    routes: []},
  { id: "govee", name: "Govee H600B ×2", kind: "device", x: 1560, y: 880,
    lines: ["smarthome"], label: [18, 4, "start"],
    desc: "Bedroom and nightstand lamps, Matter over mDNS. matter-server rediscovers them after a power-cycle.",
    facts: [["Protocol", "Matter / mDNS"], ["Via", "python-matter-server :5580"]],
    routes: []},
  { id: "t6", name: "Honeywell T6 thermostat", kind: "device", x: 1560, y: 990,
    lines: ["smarthome"], label: [18, 4, "start"],
    desc: "T6 Pro Smart on the LAN, pulled INTO Home Assistant via homekit_controller (climate.living_room_t6), then mirrored back out to Apple Home through HASS Bridge.",
    facts: [["IP", "192.168.1.199"], ["Integration", "homekit_controller"]],
    routes: []},
  { id: "apple", name: "Apple Home", kind: "device", x: 1560, y: 1100,
    lines: ["smarthome"], label: [18, 4, "start"],
    desc: "Sees the thermostat and lights through HASS Bridge on :21064. HA is the source of truth; Apple Home is a client.",
    facts: [["Bridge", "HASS Bridge :21064"], ["Exposes", "climate + lights"]],
    routes: []},
  { id: "printer", name: "Printer · PL70e-BT", kind: "device", x: 1560, y: 1230,
    lines: ["smarthome"], label: [18, 4, "start"],
    desc: "Beeprt label printer on USB, advertised as AirPrint by the host avahi-daemon (eth0, IPv4 only). If mDNS wedges, devices can't find it; that's the printer watchdog's whole job.",
    facts: [["Queue", "PL70e-BT (raw usblp backend)"], ["Discovery", "AirPrint via host avahi"], ["Watched by", "printer-watchdog + netalertx ARP"]],
    routes: []},
];

/* ---------------------------------------------------------------------------
   LINE GEOMETRY
   Each path is an ordered list of station ids and/or literal [x,y] waypoints.
   A line passes THROUGH the stations listed; stations with that line in their
   `lines` array are stops, others are express-passed (line rides its offset).
   segLabels: optional per-segment text, keyed "fromId>toId", always visible.
   ------------------------------------------------------------------------- */
const LINE_PATHS = {
  public: {
    paths: [
      ["guests", "funnel"],
      ["funnel", "caddy"],
      ["caddy", "rss", "kalshipnl", "quantlab"],
      ["caddy", [680, 700], [700, 900], [760, 1000], "autovrr"],
    ],
    dashed: [["site", "guests"]],
    segLabels: {
      "guests>funnel": { text: ":10000", at: [350, 118] },
      "funnel>caddy": { text: "→ 127.0.0.1:8089", at: [526, 300] },
    },
  },
  tailnet: {
    paths: [
      ["you", "caddy"],
      ["caddy", "f13ft", "rss", "kalshipnl", "quantlab"],
      ["quantlab", [1330, 470], "ollama"],
      ["caddy", [740, 550], [800, 620], "homepage", "kuma", "glances", "dozzle"],
      ["caddy", [640, 620], [700, 780], "ha", "netalertx", "cups"],
      ["caddy", [680, 700], [700, 900], [760, 1000], "autovrr"],
    ],
    dashed: [],
    segLabels: {
      "you>caddy": { text: "*.ankit.casa :443", at: [480, 390] },
    },
  },
  llm: {
    paths: [
      ["caddy", "rss", "quantlab", [1330, 470], "ollama"],
    ],
    dashed: [],
    segLabels: {
      "quantlab>ollama": { text: "studio :11434", at: [1296, 502] },
    },
  },
  smarthome: {
    paths: [
      ["ha", [1460, 780], [1460, 520], "stick", "mesh"],
      ["mesh", "rodret"],
      ["ha", "matter"],
      ["matter", [1460, 880], "govee"],
      [[1460, 780], [1460, 990], "t6"],
      [[1460, 990], [1460, 1100], "apple"],
      ["cups", [1340, 780], [1340, 1230], "printer"],
    ],
    dashed: [["netalertx", [1010, 930], [1080, 1230], "printer"]],
    segLabels: {},
  },
  bots: {
    paths: [
      ["commute", "discord"],
      ["commute", "google"],
      ["gform", "discord"],
      ["gform", "google"],
      ["autovrr", [690, 1430], "discord"],
      ["autovrr", "vrr"],
      ["swap", [790, 1440], "discord"],
      ["swap", "reddit"],
      ["kalshipnl", [1330, 700], [1330, 1445], "kalshiapi"],
      ["quantlab", [1250, 720], [1250, 1445], "kalshiapi"],
      ["quantlab", [1390, 720], [1390, 1445], "yahoo"],
      ["rss", [700, 640], "feeds"],
    ],
    dashed: [["rss", "f13ft"]],
    segLabels: {},
  },
  ops: {
    paths: [
      ["github", "cron"],
      ["cron", "backup"],
      ["cron", [770, 1330], [950, 1330], "dockerd"],
      ["backup", [900, 1355], [1420, 1355], [1420, 350], "pibackups"],
      ["watchdogs", [750, 900], "kuma"],
      ["watchdogs", [940, 1000], "matter"],
      ["watchdogs", [1050, 1000], "cups"],
      ["watchtower", "dockerd"],
    ],
    dashed: [
      ["homepage", [790, 1330], "dockerd"],
      ["glances", [1180, 1330], "dockerd"],
      ["dozzle", [1300, 1330], "dockerd"],
    ],
    segLabels: {
      "github>cron": { text: "push main = deploy", at: [216, 880] },
      "backup>pibackups": { text: "scp Sun 03:00", at: [1000, 1343] },
    },
  },
};

const KIND_LABEL = {
  you: "you",
  external: "external",
  edge: "edge / proxy",
  service: "web service",
  bot: "discord bot",
  infra: "host automation",
  device: "home device",
  store: "off-Pi",
};

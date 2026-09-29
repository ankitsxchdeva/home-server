# reddit-swap-notifier

Discord bot that pings you when a new post on a swap subreddit matches your
keywords, or when a watched webpage's text changes. Built for the
first-come-first-served nature of r/hardwareswap and r/mechmarket and of
small-batch shop drops: pages poll every 10 seconds (Reddit every 60 — its
public RSS rate-limits anything faster), and each user in the server keeps
their own watchlist.

## Commands

| Command | Effect |
|---|---|
| `/setup subreddit:hardwareswap keywords:3080, gmk olivia` | Watch a subreddit. Pings arrive in the channel you run this in. |
| `/watch url:https://example.com/drop` | Watch a webpage; ping when its visible text changes. First watch records a silent baseline. |
| `/unwatch url:https://example.com/drop` | Stop watching a page. Autocompletes from your watches. |
| `/show` | Your watches: subreddits, keywords, pages, ping channels. Only you see the reply. |
| `/remove subreddit:hardwareswap` | Stop watching a subreddit. Autocompletes from your watches. |
| `/remove subreddit:hardwareswap keyword:3080` | Drop one keyword, keep the rest. |

Worth knowing:

- Keywords are comma-separated, whole-word, case-insensitive, and matched
  against title + body: `3080` matches "RTX 3080," but not "30801". Phrases
  (`gmk olivia`) and punctuation (`[H]`) work as written.
- Re-running `/setup` for a subreddit **adds** keywords (up to 25 per
  subreddit, 80 chars each) — and moves all of that subreddit's pings to the
  channel you ran it in. The confirmation says so when it happens.
- Users matching the same post in the same channel are pinged together in one
  message.
- Page watches ping when text appears that hasn't been on the page recently
  (last 6 hours): new products, price edits, restocks. Text disappearing,
  reordering, or flickering between page variants never pings. The baseline
  recorded at `/watch` is silent. Fetch errors never count as changes; a page
  that 404/410s is benched and re-checked hourly. JavaScript-rendered pages
  (no readable text in the HTML) can't be watched — the bot is plain HTTP, no
  browser. URLs are capped at 100 characters.

## Configuration

`cp .env.example .env`, then:

| Variable | Required | Notes |
|---|---|---|
| `DISCORD_TOKEN` | yes | Bot token — see setup step 1. |
| `REDDIT_USER_AGENT` | no | User-Agent for RSS requests; Reddit asks that it name the app and your reddit username. |
| `POLL_INTERVAL_SECONDS` | no | Default 10. Page-watch cadence; each cycle is one fetch per watched URL. |
| `REDDIT_INTERVAL_SECONDS` | no | Default 60. Reddit's RSS 429s well under 4 req/min; 60 is the proven rate. |
| `GUILD_ID` | no | Your server ID makes slash commands appear instantly; without it the first global sync can take an hour. Developer Mode → right-click server → *Copy Server ID*. |
| `SITE_USER_AGENT` | no | User-Agent for page fetches; some hosts reject generic ones. |
| `TZ` | no | Timezone for log timestamps; defaults to UTC. |

## Setup

1. **Discord app** — <https://discord.com/developers/applications> → New
   Application → *Bot* → **Reset Token** (revealed once; put it in `.env`).
   Then *OAuth2 → URL Generator*: scopes `bot` + `applications.commands`,
   permissions *View Channel*, *Send Messages*, *Embed Links*. Open the
   generated URL to invite the bot to your server.
2. ```sh
   docker compose up -d --build
   ```

No Reddit account or API credentials needed: posts come from Reddit's public
RSS feeds.

State lives in `./data/bot.db` (volume-mounted SQLite), so watches survive
rebuilds and restarts.

## How it decides what to ping

Each poll cycle makes one RSS request for the newest 100 posts across every
watched subreddit combined (`r/a+b+c/new.rss`). A post pings you when all three
hold: it's newer than your subscription, it matches one of your keywords, and
it hasn't been notified before. Consequences:

- Downtime is caught up on restart, bounded by that 100-post window.
- Adding a subreddit never replays its backlog.
- A watched subreddit that's later banned or made private is benched and
  re-checked hourly; the others keep working. Re-running `/setup` for it
  un-benches it immediately.

Rate math: 1 unauthenticated RSS request per minute + 6 page fetches per
minute per watched URL. (If Reddit rate-limits a cycle anyway, the bot just
skips it and tries again.)

## Troubleshooting

- **Slash commands don't appear.** With `GUILD_ID` set they're instant;
  without it, Discord's first global sync can take up to an hour. If they
  never appear, the bot was invited without the `applications.commands`
  scope — re-invite.
- **No pings.** Read `docker compose logs -f reddit-swap-notifier`. Healthy
  output is `Poll cycle done: N subreddits, M new posts` every cycle and
  `Notified users …` on matches. Things to look for:
  - `r/<name> is banned, private, or gone` — that sub is benched; `/remove`
    it or wait for the hourly re-check.
  - `Channel <id> is gone or blocks the bot` — the ping channel was deleted
    or the bot lost permissions; re-run `/setup` from a channel it can post
    in.
  - `Combined listing failed …` — Reddit-side trouble; the bot retries by
    itself.
  - `<url> returned HTTP 404 — the page is gone` — that page is benched;
    `/unwatch` it or re-run `/watch` once it's back.
- **Container exits immediately.** The last log line names the missing `.env`
  variable.

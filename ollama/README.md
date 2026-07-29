# Ollama

Shared local LLM service. Runs the [Ollama](https://ollama.com) engine and
serves models over HTTP on the internal compose network at
`http://ollama:11434`.

**No host port; tailnet-only.** No published host port and no Tailscale Funnel,
so it is off the LAN and off the public internet. Other containers reach it
in-network at `http://ollama:11434`; tailnet devices reach it through Caddy at
`https://ollama.ankit.casa` (wildcard cert, resolves to the Pi's Tailscale IP).
Ollama has no authentication of its own — the tailnet is the security boundary.
Any tailnet device (or process) can therefore use *and manage* models via the
API; add Caddy basic-auth on `ollama.ankit.casa` if you want more than that.

## Models

| Model | Used by | Notes |
|---|---|---|
| `qwen2.5:1.5b` | rss-reader | Per-item summaries + daily themes overview |

`ollama-init` pulls the model into the `ollama_models` volume on first boot and
then exits. The volume survives restarts, recreations, and the weekly
`docker system prune`, so the model is downloaded once.

## Using it from another service

Any container on the compose network can call it. Point the service at
`http://ollama:11434` and use the [Ollama API](https://github.com/ollama/ollama/blob/main/docs/api.md):

```
POST http://ollama:11434/api/generate
{"model": "qwen2.5:1.5b", "prompt": "...", "stream": false}
```

rss-reader (`rss-reader/summarize.py`) is the first consumer and shows the
pattern: new-items-only, cached, with a graceful fallback when Ollama is down.

From a tailnet device (laptop, phone) point any OpenAI-compatible client at
`https://ollama.ankit.casa/v1` (model `qwen2.5:1.5b`, no API key). No SSH tunnel
needed once the Caddy route is deployed.

## Adding a model

Add an `ollama pull <model>` line to `ollama-init`'s command, then redeploy.
On a memory-constrained Pi, keep `OLLAMA_MAX_LOADED_MODELS=1` in mind — loading
several large models at once will thrash.

## Upgrading the hardware

The engine is addressed only by `OLLAMA_URL` in each consumer. To move to a
beefier host (e.g. a Mac Studio running Ollama natively for Metal GPU
acceleration), point consumers' `OLLAMA_URL` at the new host and bump
`OLLAMA_MODEL` — no code changes.

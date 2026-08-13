# Self-hosting Komorebi

Komorebi is a self-hosted web app for Docker, Proxmox, or Arcane. The same
responsive PWA works on desktop and mobile and connects to your Ollama host.

## Local development

Create `.env.local` with:

```env
OLLAMA_HOST=http://192.168.0.223:11434
OLLAMA_MODEL=gpt-oss:120b-cloud
OLLAMA_WEB_SEARCH_API_KEY=your-ollama-api-key
```

Then run:

```sh
pnpm dev
```

## Proxmox / Arcane

Use `compose.yml` in Arcane.

Set these environment variables in Arcane:

```env
OLLAMA_WEB_SEARCH_API_KEY=your-ollama-api-key
KOMOREBI_API_TOKEN=
```

`KOMOREBI_API_TOKEN` is optional on a trusted LAN. If you set it, open the app
once with `?token=your-token` appended to the URL so the browser can store it
for future API calls.

The compose file persists app data in the `komorebi-data` Docker volume and
points generation at:

```env
OLLAMA_HOST=http://192.168.0.223:11434
OLLAMA_MODEL=gpt-oss:120b-cloud
```

## Notes

`gpt-oss:120b-cloud` runs through your LAN Ollama host, then Ollama Cloud handles
the model compute. To avoid cloud inference entirely, pull a local model on the
Ollama host and change `OLLAMA_MODEL`.

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

## Database operations

Komorebi applies ordered, transactional migrations at startup. The local SQLite
database uses WAL mode, foreign-key enforcement, and a five-second busy timeout.
Run an integrity check at any time:

```sh
docker compose exec komorebi node dist-server/database.cjs integrity
```

Create a consistent online backup while the app remains available:

```sh
docker compose exec komorebi node dist-server/database.cjs backup
```

The default destination is `/data/backups/komorebi-<timestamp>.db` in the
persistent `komorebi-data` volume. The command refuses to overwrite a backup and
verifies the new file with `PRAGMA integrity_check` before reporting success.
Copy important backups out of the Docker host or volume on a regular schedule.

To choose a destination in the volume:

```sh
docker compose exec komorebi \
  node dist-server/database.cjs backup /data/backups/before-upgrade.db
```

### Restore and rollback

> [!WARNING]
> Never restore while the app container is running. Stop it first so no process
> retains the old database or WAL file.

Restore a verified backup from the persistent volume:

```sh
docker compose stop komorebi
docker compose run --rm komorebi \
  node dist-server/database.cjs restore /data/backups/before-upgrade.db
docker compose up -d komorebi
```

Restore first validates the source and a same-filesystem temporary copy. It then
atomically places the copy at `/data/komorebi.db` and retains the previous
database beside it as `komorebi.db.before-restore-<timestamp>`.

For an application rollback:

1. Create `/data/backups/before-upgrade.db` before deploying.
2. Deploy the new image and run the integrity command.
3. If rollback is required, stop Komorebi.
4. Select the previous image tag in `compose.yml`.
5. Restore the pre-upgrade backup with the command above.
6. Start Komorebi and confirm `/health/ready` returns HTTP 200.

Migrations are forward-only. Do not run an older image against a database that a
newer image migrated unless that release explicitly documents compatibility.

For a non-container installation after `pnpm build`, the equivalent commands are
`pnpm db:migrate`, `pnpm db:integrity`, `pnpm db:backup`, and
`pnpm db:restore -- <backup.db>`.

## Logs and request tracing

Server and database-operation logs are newline-delimited JSON. Every HTTP
response includes `X-Request-Id`; clients may provide a safe request ID in the
same header. Generation worker logs include `requestId`, `jobId`,
`generationId`, `jobKind`, and `workerId`, allowing a request to be traced from
acceptance through durable retries to completion.

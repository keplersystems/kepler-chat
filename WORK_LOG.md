# Kepler Chat Work Log

Single-user LLM chat with one always-on OpenCode server. See `SPEC.md` for architecture.

## Current State

- Backend starts one sandboxed OpenCode server on startup and stops it on shutdown.
- Each conversation has an isolated directory under `KEPLER_SESSIONS_PATH/conversations/{conversationId}`.
- OpenCode SDK clients select the conversation directory through the latest SDK directory option.
- Auth is a shared passcode stored as an HttpOnly cookie.
- Obsolete UI, API, and schema paths from the previous architecture have been removed.
- Provider credentials and env profiles are single-user records encrypted at rest.
- Provider env profile changes restart the one OpenCode server.

## Validation

- `bun run check-types`
- `bun run --filter server test`
- `bun run --filter web check`
- `bun run --filter web test`

## Runtime

```bash
bun run dev:server
bun run dev:web
```

Web: `http://localhost:5173`

API: `http://localhost:3000`

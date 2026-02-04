# Kepler Chat Work Log

Multi-user LLM chat with sandboxed OpenCode instances. See `SPEC.md` for architecture.

## Progress Summary

| Component | Status | Notes |
|-----------|--------|-------|
| Database Schema | ✅ Done | `opencode_instance`, `conversation` tables |
| Environment Config | ✅ Done | KEPLER_* env vars for sessions, ports, timeout |
| Sandbox Package | ✅ Done | Per-user filesystem/network isolation |
| OpenCode Manager | ✅ Done | Instance lifecycle, port allocation, health checks |
| Auth Middleware | ✅ Done | Better-Auth session validation |
| Conversations API | ✅ Done | CRUD operations |
| Messages API | ✅ Done | SSE streaming to frontend |
| Requests API | ✅ Done | Permission/question list + reply/reject |
| OpenAPI Docs | ✅ Done | Swagger at /swagger |
| Graceful Shutdown | ✅ Done | SIGINT/SIGTERM handlers |
| Port Allocator | ✅ Done | System-level availability checks |
| Frontend | ❌ TODO | SvelteKit chat UI with EventSource |
| Files API | ❌ TODO | Upload/download for input/output dirs |
| Admin API | ❌ TODO | List/teardown instances |
| Testing | ❌ TODO | Multi-user isolation, unit tests |

## Current State

**Backend is functional.** Server runs at http://localhost:3000, docs at /swagger.

```bash
bun run dev:server  # Start backend
```

## What's Next

1. **Frontend** - SvelteKit chat interface with SSE
2. **Files API** - Upload to input/, download from output/
3. **Admin API** - Instance management endpoints
4. **Testing** - Multi-user isolation verification

## Key Files

```
packages/
├── db/src/schema/opencode.ts      # DB schema
├── sandbox/src/index.ts           # Sandbox config
├── opencode-manager/src/
│   ├── instance-manager.ts        # Core lifecycle
│   └── port-allocator.ts          # Port management

apps/server/src/
├── index.ts                       # Main server
├── middleware/auth.ts             # Auth
├── routes/
│   ├── conversations.ts           # CRUD
│   └── messages.ts                # SSE streaming
│   └── requests.ts                # Permission/question routes
└── services/opencode.ts           # Manager singleton
```

## Environment Setup

```bash
# apps/server/.env
DATABASE_URL="file:../../local.db"
CORS_ORIGIN="http://localhost:5173"
BETTER_AUTH_SECRET="..."
BETTER_AUTH_URL="http://localhost:3000"

KEPLER_SESSIONS_PATH="/tmp/kepler-sessions"
KEPLER_INSTANCE_IDLE_TIMEOUT="1800000"
KEPLER_PORT_RANGE_START="5000"
KEPLER_PORT_RANGE_END="6000"

OPENCODE_API_KEY_ANTHROPIC="sk-ant-..."
```

## Architecture Decisions

- **One instance per user** - OpenCode handles multiple sessions internally
- **On-demand spawning** - 30-min idle timeout, respawn on next request
- **Path-based sandbox** - No root required, adequate for MVP
- **Port allocator** - Async with system-level availability check (prevents EADDRINUSE)
- **Permissions** - Client must reply via API (no auto-approve)

## Known Issues

- Drizzle-orm duplicate versions in node_modules causing LSP type errors (runtime works fine)
- SSE completion now waits for terminal finish (not `tool-calls`/`unknown`); verify client handles extended streams

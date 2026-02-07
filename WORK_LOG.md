# Kepler Chat Work Log

Multi-user LLM chat with sandboxed OpenCode instances. See `SPEC.md` for architecture.

## Progress Summary

| Component | Status | Notes |
|-----------|--------|-------|
| Database Schema | ✅ Done | `opencode_instance`, `conversation` tables |
| Environment Config | ✅ Done | `KEPLER_*` vars for sessions, ports, timeout, and admin allowlist |
| Sandbox Package | ✅ Done | Per-user filesystem/network isolation |
| OpenCode Manager | ✅ Done | Instance lifecycle, port allocation, health checks, teardown hardening |
| Auth Middleware | ✅ Done | Better-Auth session validation |
| Conversations API | ✅ Done | CRUD operations |
| Messages API | ✅ Done | SSE streaming to frontend |
| Requests API | ✅ Done | Permission/question list + reply/reject |
| Files API | ✅ Done | Upload/list/download for user-scoped input/output dirs |
| Admin API | ✅ Done | Admin-only list + force teardown of instances |
| Shared Contracts | ✅ Done | `@kepler-chat/contracts` for API/SSE types |
| Web Logic Layer (No UI) | ✅ Done | Typed API client, SSE parser, rune state, chat route loaders |
| Automated Tests (Important Parts) | ✅ Done | Non-mock tests for backend file safety and frontend SSE/state logic |
| OpenAPI Docs | ✅ Done | Swagger at `/swagger` |
| Graceful Shutdown | ✅ Done | SIGINT/SIGTERM handlers |
| Port Allocator | ✅ Done | System-level availability checks |
| Provider Auth APIs | ✅ Done | Provider catalog + auth set/remove + OAuth authorize/callback |
| Provider Env Profiles | ✅ Done | Guided multi-env schema/profile endpoints with encrypted storage and restart-on-update |
| Model Selection Backend | ✅ Done | Conversation model endpoints + required per-message model in messages API |
| Attachment-to-Prompt Wiring | ✅ Done | Uploaded files are now included in OpenCode `session.prompt` file parts (`file://...`) |
| Attachment Compatibility Warning UX | ✅ Done | Local pre-send warning in composer for unsupported audio/image/video/pdf modalities; non-blocking |
| Chat UI Rendering | ✅ Done | Interactive chat UI with sidebar, streaming, requests, and file panel |
| End-to-End Integration Tests | ⏳ Pending | No full auth+server+opencode E2E suite yet |

## Current State

The project now has:

1. A production-ready backend API surface for conversations, messages, requests, files, and admin instance operations.
2. A shared contracts package that frontend/backend can import to reduce API drift.
3. A working Svelte chat UI that consumes POST-SSE streams, renders assistant output incrementally, and handles permission/question requests in real time.
4. A file artifacts experience with preview/download/actions and a collapsible right files panel.
5. A focused automated test baseline for critical stream/state logic, intentionally avoiding mock-heavy route tests.
6. Backend-only provider authentication and model selection primitives with encrypted credential mirroring and per-message model persistence.

Backend server still runs at `http://localhost:3000` with docs at `/swagger`.

```bash
bun run dev:server
```

## Branch A: Backend Contracts + Files/Admin APIs

This branch/batch implemented backend and shared-type foundations.

### Added

- New workspace package:
  - `packages/contracts/`
    - `src/api.ts`
    - `src/sse.ts`
    - `src/index.ts`
- Backend routes:
  - `apps/server/src/routes/files.ts`
  - `apps/server/src/routes/admin.ts`
- Backend helpers:
  - `apps/server/src/lib/files.ts`
  - `apps/server/src/lib/admin.ts`
  - `apps/server/src/lib/conversation.ts`

### Key behavior added

1. Files upload: `POST /api/conversations/:id/files/upload`
   - Stores uploads in per-user `input/`.
   - Sanitizes filenames.
   - Avoids overwrite via numeric suffix (`-1`, `-2`, ...).
2. Files listing: `GET /api/conversations/:id/files/output`
   - Recursive listing of `output/` metadata (`path`, `size`, `mtime`, `isDir`).
   - Supports optional `prefix`.
3. File download: `GET /api/conversations/:id/files/*`
   - Supports `scope=input|output`.
   - Enforces traversal-safe path resolution.
4. Admin listing: `GET /api/admin/instances`
   - Returns lifecycle metadata from `opencode_instance`.
5. Admin teardown: `DELETE /api/admin/instances/:userId`
   - Force stops a target user’s instance.

### Backend hardening

- `packages/opencode-manager/src/instance-manager.ts`
  - Teardown now handles both in-memory and DB-only records.
  - Releases reserved ports and updates DB status consistently.

### Environment additions

- `packages/env/src/server.ts`
  - Added `KEPLER_ADMIN_USER_IDS` (comma-separated allowlist).

### Server wiring updates

- `apps/server/src/index.ts`
  - Registered `filesRoute` and `adminRoute`.
  - Added Swagger tags for `Files` and `Admin`.

## Branch B: Frontend Logic + Automated Tests (No UI)

This branch/batch intentionally focused on logic and tests, not visual chat components.

### Frontend logic added

- API client:
  - `apps/web/src/lib/api/chat.ts`
  - Typed wrappers for conversations/messages/requests/files/admin endpoints.
  - Includes streaming request helper for message SSE.
- SSE parser:
  - `apps/web/src/lib/sse.ts`
  - Handles chunked `text/event-stream` parsing and malformed payload fallback.
- Chat state (Svelte 5 runes):
  - `apps/web/src/lib/state/chat.svelte.ts`
- Pure state reducers/helpers (test-friendly):
  - `apps/web/src/lib/state/chat-reducer.ts`
  - `apps/web/src/lib/state/chat-types.ts`
- Authenticated route scaffolding and loaders:
  - `apps/web/src/routes/(authenticated)/+layout.svelte`
  - `apps/web/src/routes/(authenticated)/chat/+page.ts`
  - `apps/web/src/routes/(authenticated)/chat/+page.svelte` (placeholder)
  - `apps/web/src/routes/(authenticated)/chat/[id]/+page.ts`
  - `apps/web/src/routes/(authenticated)/chat/[id]/+page.svelte` (placeholder)

### Test infrastructure added

- `apps/server/vitest.config.ts`
- `apps/web/vitest.config.ts`
- package scripts/dependencies updated in:
  - `apps/server/package.json`
  - `apps/web/package.json`

### Non-mock tests added (important parts only)

- Backend critical filesystem logic:
  - `apps/server/src/lib/files.test.ts`
  - Covers traversal protection, filename sanitization, collision naming, recursive listing.
- Frontend stream/state logic:
  - `apps/web/src/lib/sse.test.ts`
  - `apps/web/src/lib/state/chat.svelte.test.ts`
  - Covers chunked SSE parsing, malformed payload handling, deterministic message/state transitions.

### Validation completed

- `bun run --filter server test` -> passing
- `bun run --filter web test` -> passing
- `bun run --filter web check` -> passing
- `bun run --filter server build` -> passing
- `bun run --filter web build` -> passing

## Recent Updates

### Streaming + Requests

- Frontend stream adapter now normalizes OpenCode SSE payloads into stable `MessageView` updates.
- Fixed out-of-order event handling so user messages are never misclassified as assistant.
- Added live handling for:
  - `permission.asked` / `question.asked` (immediate request dialog without refresh)
  - `permission.replied` / `question.replied` / `question.rejected` (request removal)
- Reply APIs now use real request IDs end-to-end (removed placeholder `"pending"` behavior).

### Conversation Titles

- Backend now persists OpenCode-generated user summary titles from `message.updated.info.summary.title`.
- Frontend consumes title updates from stream and updates chat header + sidebar title in real time.

### Files UX

- Fixed file download route validation for wildcard paths (`/:id/files/*`) by accepting `"*"` in params schema.
- Reworked file panel:
  - row click previews file content (for supported text/code types)
  - explicit preview/download buttons
  - more actions (`copy path`, `copy link`, `open raw`)
- Removed vertical in-panel collapsible; files list is always visible when files panel is expanded.
- Added true horizontal collapse/expand for the right files panel (reclaims chat width).
- Model selector dropdown is now scrollable for long provider/model lists.

### Attachments + Modality UX

- File uploads now flow into message send payload and are attached to OpenCode prompt parts (instead of only being stored under `input/`).
- Backend validates attachment paths under the authenticated user's `input/` scope and sends `file` parts with MIME metadata.
- Added local (frontend) compatibility warning when attached files use modalities the selected model may not natively support.
  - Warning is shown before send.
  - Sending is still allowed.
  - Warning explicitly states tools may still handle these files.
  - Implemented locally in composer (no custom SSE warning event).

### Provider Env Save/Restart Reliability

- Fixed a teardown recursion path in `opencode-manager` for DB-restored instances.
- Env-profile save/delete endpoints now return success immediately and trigger teardown asynchronously to avoid long “Saving...” UI stalls.

### Sidebar UX

- Added left conversation sidebar collapse/expand behavior.
- Persisted left-sidebar collapse state in `localStorage`.
- Persisted right-files-panel collapse state per conversation in `localStorage`.

### Regression Tests Added

- Stream tests now cover:
  - assistant/user role classification with out-of-order events
  - generated title extraction from user summaries
  - live permission request event mapping
  - suppression of empty tool-phase assistant placeholders
  - suppression of whitespace-only tool-phase text updates

## Key Files (Current Snapshot)

```text
packages/
├── contracts/src/
│   ├── api.ts
│   ├── sse.ts
│   └── index.ts
├── db/src/schema/opencode.ts
├── sandbox/src/index.ts
└── opencode-manager/src/
    ├── instance-manager.ts
    └── port-allocator.ts

apps/server/src/
├── index.ts
├── middleware/auth.ts
├── routes/
│   ├── conversations.ts
│   ├── messages.ts
│   ├── requests.ts
│   ├── files.ts
│   └── admin.ts
└── lib/
    ├── conversation.ts
    ├── files.ts
    └── admin.ts

apps/web/src/
├── lib/
│   ├── api/chat.ts
│   ├── sse.ts
│   └── state/
│       ├── chat.svelte.ts
│       ├── chat-reducer.ts
│       └── chat-types.ts
├── components/chat/
│   └── MessageInput.svelte
└── routes/(authenticated)/chat/
    ├── +page.ts
    ├── +page.svelte
    └── [id]/
        ├── +page.ts
        └── +page.svelte
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
KEPLER_ADMIN_USER_IDS="user-id-1,user-id-2"

OPENCODE_API_KEY_ANTHROPIC="sk-ant-..."
```

## Architecture Decisions (Implemented)

- One OpenCode instance per user, multiple sessions inside OpenCode.
- On-demand spawn with idle cleanup and respawn.
- Path-based filesystem sandboxing for MVP.
- Network-sensitive tools remain permission-gated.
- Thin translation layer around OpenCode SDK.
- Shared contracts package added to reduce frontend/backend type drift.
- Test strategy prioritizes non-mock, high-value logic tests first.

## Safe-to-Delete Later

These files are useful now but may be removed/refactored once full chat UI and broader integration tests are in place.

1. `apps/web/src/routes/(authenticated)/chat/+page.svelte`
   - Placeholder shell file for route existence.
   - Replace with real chat list UI.
2. `apps/web/src/routes/(authenticated)/chat/[id]/+page.svelte`
   - Placeholder logic shell.
   - Replace with full chat message pane/input UI.
3. `apps/web/src/lib/state/chat-reducer.ts`
   - Kept for pure deterministic tests.
   - Could be merged into rune store later if you switch testing strategy.
4. `apps/web/src/lib/state/chat-types.ts`
   - Split out for reuse and test isolation.
   - Could be inlined later if module boundaries simplify.
5. `apps/web/src/lib/index.ts` re-exports
   - Optional convenience layer.
   - Can be removed if the project prefers explicit per-file imports.

## Known Issues

1. Drizzle duplicate type declarations still produce noisy TypeScript/LSP errors in some contexts (runtime behavior remains fine).
2. No full end-to-end integration suite yet (auth + server + opencode process + streamed UI assertions).
3. Chat UI rendering is intentionally not implemented yet, so product flow is logic-ready but not UX-complete.

## Next Steps

1. Implement chat UI components on top of existing loaders/state/API client.
2. Add integration tests for authenticated route flows and streaming behavior against a real server instance.
3. Tighten observability: structured logs around file/admin actions and stream lifecycle.

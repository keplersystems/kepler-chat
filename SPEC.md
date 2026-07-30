# Kepler Chat Architecture Specification

Single-user agentic chat application using one always-on OpenCode server as the agent backend.

## Core Concept

- One authenticated local user, protected by a shared passcode.
- One sandboxed OpenCode server for the whole app.
- One OpenCode session per Kepler conversation.
- Per-conversation isolation is directory-scoped: each conversation gets its own root directory, and OpenCode requests are sent with that directory selected through the SDK.
- Projects group conversations and own a directory whose contents (instructions, config, skills) every conversation under it inherits via OpenCode's directory up-walk.
- The filesystem is the source of truth for everything OpenCode reads (opencode.json, AGENTS.md, SKILL.md). The DB stores only what OpenCode cannot: grouping, titles, encrypted provider credentials.

## Stack

- Frontend: SvelteKit + TailwindCSS v4 (Kepler design system, IBM Plex Sans/Mono, light+dark)
- Backend: Elysia on Bun (mounted in SvelteKit)
- Database: SQLite + Drizzle ORM
- Agent: OpenCode SDK v2
- Markdown/code: marked lexer → Svelte token renderer, shiki dual-theme highlighting
- Sandboxing: `@anthropic-ai/sandbox-runtime`
- Auth: shared passcode cookie

## Runtime Layout

```
Browser
  <-> Elysia API
      <-> OpenCode SDK client with per-conversation directory
          <-> single sandboxed `opencode serve` process
```

The OpenCode server is started during backend startup and kept running until backend shutdown. Conversation clients are lightweight SDK clients targeting the same server URL with a different `directory`.

## Filesystem Layout

```
KEPLER_SESSIONS_PATH/
  .opencode/
    data/  cache/  state/  tmp/
    config/opencode/            global OpenCode config dir (XDG_CONFIG_HOME redirect)
      opencode.json             global MCP servers / config written by Kepler
      skills/{name}/SKILL.md    global skills
  provider-env/{providerId}/{envKey}/...
  projects/{projectId}/
    AGENTS.md                   project instructions
    opencode.json               project MCP servers / config
    .opencode/skills/{name}/SKILL.md
    conversations/{convId}/{input,output}/
  conversations/{convId}/{input,output}/   standalone conversations
```

The OpenCode server runs with `KEPLER_SESSIONS_PATH` as its working directory, XDG paths and TMPDIR under `.opencode` (the sandbox only allows writes there). Because OpenCode resolves config, instructions, and skills by walking up from the request `directory`, a conversation nested under a project inherits everything the project defines.

## Config application semantics

OpenCode caches per-directory instances until disposed, and the global config layer process-wide:

- Project-scope changes (opencode.json, AGENTS.md, skills): write files, then dispose the project root instance and every conversation instance in the project (`instance.dispose`).
- Global-scope changes: write files, then **restart the OpenCode server** — `POST /global/dispose` does not flush the cached global config layer, so a restart is the only reliable application (same mechanism as provider env changes).
- `client.config.update` and `client.mcp.add` are never used for persistence: the former writes a file OpenCode does not read back; the latter is in-memory only.

## MCP and Connectors

- MCP servers live in the `mcp` map of the scope's opencode.json (`local` command servers or `remote` URL servers with optional OAuth).
- Connectors are curated remote presets (`src/lib/connectors.ts`); adding one writes a `remote` entry named after the preset. OAuth tokens are stored by OpenCode keyed globally by server name.
- OAuth flow: Kepler rewrites `oauth.redirectUri` to `<origin>/api/mcp/oauth/callback`, calls `mcp.auth.start`, tracks the `state` parameter server-side (OpenCode's split flow does not validate it), and completes via `mcp.auth.callback` on redirect. Adding a preset only launches OAuth when live status reports `needs_auth`.

## Security Model

- The browser authenticates with `POST /api/auth/login` using `KEPLER_PASSCODE`.
- The backend stores an HttpOnly cookie containing a deterministic token derived from the passcode.
- All app API routes require that cookie except `/api/auth/*` and health/docs routes.
- The OpenCode server is bound to `127.0.0.1`.
- The OpenCode process is wrapped with sandbox-runtime and write access is scoped to `KEPLER_SESSIONS_PATH`.
- `OPENCODE_PERMISSION.external_directory` is forced to `deny`.
- `webfetch`, `websearch`, and `codesearch` default to `ask` unless explicitly overridden.
- Artifact HTML previews render in an iframe with `sandbox="allow-scripts"` (no same-origin access).

This is logical per-conversation isolation on one trusted-user system. It is not a multi-tenant security boundary.

## Database Schema

- `project`: id, name, timestamps.
- `conversation`: Kepler conversation id, OpenCode session id, optional project id, title, optional selected provider/model, timestamps.
- `conversation_message_model`: model used for an OpenCode message.
- `provider_credential`: encrypted mirrored provider auth payload, keyed by provider id.
- `provider_env_profile`: encrypted provider environment values, keyed by provider id and env key.

OpenCode stores its own sessions, messages, parts, permissions, and related state in its SQLite database under the configured XDG data path.

## Message rendering

The client renders OpenCode message parts in order (`text`, `reasoning`, `tool`, `file`, `subtask`, `command`, `retry`) from a typed view model (`src/lib/messages.ts`). SSE payload types are derived from the SDK `Event` union (`src/lib/contracts.ts`); the server's session-id extractor map is exhaustive over the same names so client and server cannot drift.

## API

### Auth

```
GET  /api/auth/session
POST /api/auth/login
POST /api/auth/logout
```

### Projects

```
GET    /api/projects
POST   /api/projects
GET    /api/projects/:id            (includes AGENTS.md instructions)
PATCH  /api/projects/:id
PUT    /api/projects/:id/instructions
DELETE /api/projects/:id
```

### Conversations

```
GET    /api/conversations
POST   /api/conversations           (optional projectId)
GET    /api/conversations/:id
PATCH  /api/conversations/:id       (rename)
POST   /api/conversations/:id/branch
DELETE /api/conversations/:id
```

### Messages and Requests

```
GET    /api/conversations/:id/messages
POST   /api/conversations/:id/messages       (SSE stream)
DELETE /api/conversations/:id/messages/:messageID
POST   /api/conversations/:id/abort

GET  /api/conversations/:id/requests
POST /api/conversations/:id/permissions/:requestId/reply
POST /api/conversations/:id/questions/:requestId/reply
POST /api/conversations/:id/questions/:requestId/reject
```

### Files

```
POST /api/conversations/:id/files/upload
GET  /api/conversations/:id/files/output
GET  /api/conversations/:id/files/*          (?scope=input|output&disposition=inline|attachment)
```

### MCP

```
GET    /api/mcp                      (?projectId; config + live status)
PUT    /api/mcp/:name                (scope via body projectId)
DELETE /api/mcp/:name                (?projectId)
POST   /api/mcp/:name/auth           (start OAuth; returns authorization URL)
DELETE /api/mcp/:name/auth
GET    /api/mcp/oauth/callback       (redirect target; completes flow)
```

### Skills

```
GET    /api/skills                   (?projectId)
PUT    /api/skills/:name             (scope via body projectId)
DELETE /api/skills/:name             (?projectId)
```

### Providers and Models

```
GET    /api/providers
GET    /api/providers/:providerId/env-schema
GET    /api/providers/:providerId/env-profile
PUT    /api/providers/:providerId/env-profile
DELETE /api/providers/:providerId/env-profile
POST   /api/providers/:providerId/env-file/:envKey
POST   /api/providers/:providerId/auth
DELETE /api/providers/:providerId/auth
POST   /api/providers/:providerId/oauth/authorize
POST   /api/providers/:providerId/oauth/callback

GET /api/conversations/:id/model
PUT /api/conversations/:id/model
```

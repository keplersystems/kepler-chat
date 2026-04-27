# Kepler Chat Architecture Specification

Single-user LLM chat application using one always-on OpenCode server as the agent backend.

## Core Concept

- One authenticated local user, protected by a shared passcode.
- One sandboxed OpenCode server for the whole app.
- One OpenCode session per Kepler conversation.
- Per-conversation isolation is directory-scoped: each conversation gets its own root directory, and OpenCode requests are sent with that directory selected through the SDK.
- Provider env changes restart the single OpenCode server so the new environment is loaded.

## Stack

- Frontend: SvelteKit + TailwindCSS + shadcn/ui-style components
- Backend: Elysia on Bun
- Database: SQLite + Drizzle ORM
- Agent: OpenCode SDK
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
    data/
    cache/
    config/
    state/
  provider-env/
    {providerId}/{envKey}/...
  conversations/
    {conversationId}/
      input/
      output/
```

The OpenCode server runs with `KEPLER_SESSIONS_PATH` as its working directory and XDG paths under `.opencode`. Conversation work happens inside `conversations/{conversationId}`.

## Security Model

- The browser authenticates with `POST /api/auth/login` using `KEPLER_PASSCODE`.
- The backend stores an HttpOnly cookie containing a deterministic token derived from the passcode.
- All app API routes require that cookie except `/api/auth/*` and health/docs routes.
- The OpenCode server is bound to `127.0.0.1`.
- The OpenCode process is wrapped with sandbox-runtime and write access is scoped to `KEPLER_SESSIONS_PATH`.
- `OPENCODE_PERMISSION.external_directory` is forced to `deny`.
- `webfetch`, `websearch`, and `codesearch` default to `ask` unless explicitly overridden.

This is logical per-conversation isolation on one trusted-user system. It is not a multi-tenant security boundary.

## Database Schema

Kepler stores only app metadata and encrypted provider setup:

- `conversation`: Kepler conversation id, OpenCode session id, title, optional selected provider/model, timestamps.
- `conversation_message_model`: model used for an OpenCode message.
- `provider_credential`: encrypted mirrored provider auth payload, keyed by provider id.
- `provider_env_profile`: encrypted provider environment values, keyed by provider id and env key.

OpenCode stores its own sessions, messages, parts, permissions, and related state in its SQLite database under the configured XDG data path.

## API

### Auth

```
GET  /api/auth/session
POST /api/auth/login
POST /api/auth/logout
```

### Conversations

```
GET    /api/conversations
POST   /api/conversations
GET    /api/conversations/:id
DELETE /api/conversations/:id
```

### Messages and Requests

```
GET  /api/conversations/:id/messages
POST /api/conversations/:id/messages

GET  /api/conversations/:id/requests
POST /api/conversations/:id/permissions/:requestId/reply
POST /api/conversations/:id/questions/:requestId/reply
POST /api/conversations/:id/questions/:requestId/reject
```

### Files

```
POST /api/conversations/:id/files/upload
GET  /api/conversations/:id/files/output
GET  /api/conversations/:id/files/*
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

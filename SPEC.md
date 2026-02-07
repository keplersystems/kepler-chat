# Kepler Chat Architecture Specification

Multi-user LLM chat application using OpenCode as the agent backend with per-user sandboxing.

## System Architecture

### Core Concept
- Each user gets ONE sandboxed OpenCode instance (not per-conversation)
- OpenCode instance manages multiple internal sessions (conversations)
- Strict filesystem isolation per user
- On-demand spawning with idle timeout

### High-Level Flow
```
User Browser (SvelteKit)
  ↕ SSE (real-time events)
Elysia Backend
  ↕ OpenCode SDK (TypeScript)
OpenCode Server (sandboxed process)
  ↕ LLM Providers
```

## Technology Stack

- **Frontend**: SvelteKit + TailwindCSS + shadcn/ui
- **Backend**: Elysia (Bun runtime)
- **Database**: SQLite + Drizzle ORM
- **Agent Framework**: OpenCode (via SDK)
- **Sandboxing**: @anthropic-ai/sandbox-runtime
- **Auth**: Better-Auth (already configured)

## Data Model

### Kepler Database Schema

```typescript
// packages/db/src/schema/opencode.ts

// OpenCode instance lifecycle tracking
export const opencodeInstance = sqliteTable("opencode_instance", {
  user_id: text().primaryKey().references(() => user.id, { onDelete: "cascade" }),
  server_url: text().notNull(), // e.g. http://localhost:4096
  port: integer().notNull(),
  pid: integer(), // process ID
  spawned_at: integer({ mode: "timestamp_ms" }).notNull(),
  last_active_at: integer({ mode: "timestamp_ms" }).notNull(),
  status: text().notNull(), // "starting" | "running" | "stopping" | "stopped" | "error"
  error: text(), // error message if status is "error"
  ...Timestamps,
})

// Conversation list (OpenCode calls them sessions)
export const conversation = sqliteTable("conversation", {
  id: text().primaryKey(),
  user_id: text().notNull().references(() => user.id, { onDelete: "cascade" }),
  opencode_session_id: text().notNull(), // OpenCode's internal session ID
  title: text().notNull(),
  provider_id: text(), // optional conversation-level model default
  model_id: text(), // optional conversation-level model default
  ...Timestamps,
}, (table) => [
  index("conversation_user_idx").on(table.user_id),
])

// User-scoped mirrored provider credentials (encrypted payload)
export const providerCredential = sqliteTable("provider_credential", {
  user_id: text().notNull().references(() => user.id, { onDelete: "cascade" }),
  provider_id: text().notNull(),
  auth_type: text().notNull(), // "api" | "wellknown" | "oauth"
  encrypted_payload: text().notNull(),
  iv: text().notNull(),
  auth_tag: text().notNull(),
  key_version: integer().notNull(),
  ...Timestamps,
})

// Per-message model audit trail (for per-message model switching)
export const conversationMessageModel = sqliteTable("conversation_message_model", {
  conversation_id: text().notNull().references(() => conversation.id, { onDelete: "cascade" }),
  user_id: text().notNull().references(() => user.id, { onDelete: "cascade" }),
  opencode_message_id: text().notNull(),
  provider_id: text().notNull(),
  model_id: text().notNull(),
  created_at: integer({ mode: "timestamp_ms" }).notNull(),
})
```

### OpenCode Database
OpenCode maintains its own SQLite database per instance with:
- Sessions (conversations)
- Messages (assistant/user messages)
- Parts (text chunks, tool calls, reasoning blocks)
- Todos, permissions, etc.

This DB is stored under the per-user XDG data directory (see Filesystem
Structure). We do NOT replicate this data in Kepler's database.

## Filesystem Structure

Each user gets an isolated directory:
```
/sessions/{userId}/
  ├── input/       # User-uploaded files, media
  ├── output/      # Agent-generated files
  ├── playground/  # Scratch space for experiments
  └── .opencode/   # Per-user OpenCode state (XDG dirs)
      ├── data/
      ├── cache/
      ├── config/
      └── state/
```

OpenCode's SQLite database lives under the per-user XDG data path
(e.g., `/sessions/{userId}/.opencode/data`).

## Security Model

### Sandboxing Configuration
Uses `@anthropic-ai/sandbox-runtime` primarily for filesystem isolation:

```json
{
  "filesystem": {
    "denyRead": ["~/.ssh", "~/.aws", "~/.env", "/etc/passwd", "/etc/shadow"],
    "allowWrite": ["/sessions/{userId}/"],
    "denyWrite": [".env", ".git/", ".bashrc", ".zshrc"]
  }
}
```

**Network policy** is enforced through OpenCode permissions (not OS network
restrictions) to keep the local OpenCode server reachable on Linux. The server
sets `OPENCODE_PERMISSION` so `webfetch`, `websearch`, and `codesearch` require
user approval by default.

### Multi-User Isolation Strategy
**Path-based isolation** (MVP approach):
- All OpenCode instances run as same system user (e.g., `kepler`)
- Isolation enforced by sandbox-runtime path restrictions
- Each instance configured with `allowWrite: ["/sessions/{userId}/"]`
- Simpler, no root required

**Production upgrade path**: System user separation
- Each instance runs as separate system user `opencode-user-{userId}`
- OS-level filesystem permissions enforce isolation
- Sandbox-runtime adds defense-in-depth
- Requires privileged user creation

## Package Structure

### New Packages

#### packages/opencode-manager
```
packages/opencode-manager/
├── src/
│   ├── index.ts              # exports
│   ├── instance-manager.ts   # spawn/teardown OpenCode instances
│   ├── lifecycle.ts          # idle timeout, health checks
│   └── port-allocator.ts     # allocate unique ports per user
└── package.json
```

**Key exports:**
```typescript
class OpencodeInstanceManager {
  async getOrSpawn(userId: string): Promise<{ client: OpencodeClient, url: string }>
  async teardown(userId: string): Promise<void>
  async healthCheck(userId: string): Promise<boolean>
}
```

#### packages/sandbox
```
packages/sandbox/
├── src/
│   ├── index.ts          # exports
│   └── config.ts         # SandboxManager wrapper, per-user config
└── package.json
```

**Key exports:**
```typescript
function createSandboxConfig(userId: string): SandboxRuntimeConfig
async function wrapWithSandbox(command: string, userId: string): Promise<string>
```

## API Endpoints

### Conversation Management
```
GET    /api/conversations                    # List user's conversations
POST   /api/conversations                    # Create new conversation
GET    /api/conversations/:id                # Get conversation details
DELETE /api/conversations/:id                # Delete conversation
```

### Messages
```
GET    /api/conversations/:id/messages       # Get message history
POST   /api/conversations/:id/messages       # Send message (streams SSE)
```

### Requests (permissions/questions)
```
GET    /api/conversations/:id/requests                     # List pending requests
POST   /api/conversations/:id/permissions/:requestId/reply # Reply to permission
POST   /api/conversations/:id/questions/:requestId/reply   # Reply to question
POST   /api/conversations/:id/questions/:requestId/reject  # Reject question
```

### Providers (auth + catalog)
```
GET    /api/providers                                  # Provider/model catalog + auth methods + mirrored credential metadata
GET    /api/providers/:providerId/env-schema           # Provider env variable schema for guided setup
GET    /api/providers/:providerId/env-profile          # Get saved provider env profile (secrets masked)
PUT    /api/providers/:providerId/env-profile          # Save provider env profile (encrypted, async instance restart)
DELETE /api/providers/:providerId/env-profile          # Delete provider env profile (async instance restart)
POST   /api/providers/:providerId/auth                 # Set provider auth (api/wellknown)
DELETE /api/providers/:providerId/auth                 # Remove provider auth
POST   /api/providers/:providerId/oauth/authorize      # Start OAuth flow for provider
POST   /api/providers/:providerId/oauth/callback       # Complete OAuth callback
```

### Model Selection
```
GET    /api/conversations/:id/model                    # Get conversation-level model selection
PUT    /api/conversations/:id/model                    # Persist conversation-level model selection
POST   /api/conversations/:id/messages                 # Send message with required per-message model
```

### Files
```
POST   /api/conversations/:id/files/upload   # Upload file to input/
GET    /api/conversations/:id/files/output   # List output files
GET    /api/conversations/:id/files/*        # Download file (wildcard path)
```

### Instance Management (admin/debug)
```
GET    /api/admin/instances                  # List running instances
DELETE /api/admin/instances/:userId          # Force teardown instance
```

## Implementation Details

### Backend Routes Structure
```
apps/server/src/
├── routes/
│   ├── conversations.ts      # conversation CRUD
│   ├── messages.ts           # message handling + SSE streaming
│   ├── requests.ts           # permission/question handling
│   ├── files.ts              # file upload/download
│   └── admin.ts              # instance management
├── services/
│   ├── opencode.ts           # thin wrapper over OpencodeInstanceManager
│   └── auth.ts               # authentication helpers
└── index.ts
```

### OpenCode Instance Lifecycle

**Spawning (lazy initialization)**
```typescript
// On first message from user
const instanceManager = new OpencodeInstanceManager()
const { client, url } = await instanceManager.getOrSpawn(userId)

// instanceManager handles:
// 1. Check if instance already running
// 2. If not, allocate port
// 3. Create sandbox config
// 4. Spawn OpenCode server via CLI wrapped by sandbox-runtime
//    (sets per-user XDG_* paths and OPENCODE_PERMISSION)
// 5. Store instance metadata in DB
// 6. Return SDK client
```

**Idle Timeout**
- Background task checks `last_active_at` every 5 minutes
- If `now - last_active_at > 30 minutes`, teardown instance
- Update `status` to "stopping" then "stopped"
- Kill process, clean up DB record

**Respawning**
- When user sends message after timeout, spawn fresh instance
- OpenCode's internal DB persists between spawns (per-user XDG data dir)
- Conversations/messages are not lost

### Message Flow (SSE Streaming)

**Client sends message:**
```
POST /api/conversations/{id}/messages
Body: { text: "Hello", model: { providerID, modelID }, attachments: [...] }
```

**Backend handles request:**
```typescript
// 1. Get OpenCode client for this user
const { client } = await instanceManager.getOrSpawn(userId)

// 2. Get OpenCode session ID from conversation
const conv = await db.query.conversation.findFirst({
  where: eq(conversation.id, conversationId)
})

// 3. Send prompt to OpenCode
const response = await client.session.prompt({
  sessionID: conv.opencode_session_id,
  parts: [
    { type: "text", text: message },
    { type: "file", url: "file:///.../input/foo.png", filename: "foo.png", mime: "image/png" },
  ],
  model: { providerID, modelID },
})

// 4. Subscribe to OpenCode SSE events
const { stream } = await client.event.subscribe()

// 5. Re-broadcast session-scoped events to frontend via SSE
for await (const event of stream) {
  // Filter by sessionID and forward event payloads
  // Keep streaming after tool calls; close only when assistant finish is terminal
}
```

### Attachment Compatibility Warning (Current UX)

- Compatibility checks are done locally in the message composer using provider/model metadata from `GET /api/providers`.
- For attached `audio/image/video/pdf` files, the frontend compares file modality against model capability metadata (`capabilities.input.*`, `modalities.input`, `capabilities.attachment` when present).
- If a mismatch is detected, the UI shows a pre-send warning.
- Message sending is still allowed (warning only).
- Warning copy explicitly notes that tools may still handle unsupported modalities.

The SSE stream ends only after an assistant message reports a terminal finish
reason (e.g., `stop`, `length`, `content-filter`). It must **not** close on
`tool-calls` or `unknown` because the model continues after tool results.

When OpenCode emits a user summary title (`message.updated.info.summary.title`),
the backend updates the conversation title in Kepler DB to keep sidebar/chat
titles synchronized with OpenCode-generated naming.

**Frontend consumes SSE (POST stream):**
```typescript
const response = await fetch(`/api/conversations/${id}/messages`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ text }),
})

const reader = response.body?.getReader()
// Parse text/event-stream chunks and dispatch by `event:` name
```

### OpenCode SDK Usage Patterns

**Creating conversation:**
```typescript
const { data: session } = await client.session.create({
  title: "New Chat",
  directory: `/sessions/${userId}/playground`,
})

// Store in Kepler DB
await db.insert(conversation).values({
  id: generateId(),
  user_id: userId,
  opencode_session_id: session.id,
  title: session.title,
})
```

**Sending message:**
```typescript
await client.session.prompt({
  sessionID: opencodeSessionId,
  parts: [
    { type: "text", text: userMessage },
    // optional: { type: "image", data: base64, mimeType: "..." }
  ],
  model: { providerID: "opencode", modelID: "big-pickle" },
})
```

**Getting message history:**
```typescript
const { data: messages } = await client.session.messages({
  sessionID: opencodeSessionId,
})
// Returns messages with parts
```

**Responding to permissions/questions:**
```typescript
// list pending requests (server-side)
const { data: permissions } = await client.permission.list()
const { data: questions } = await client.question.list()

// reply to a permission request
await client.permission.reply({ requestID, reply: "once" })

// reply or reject a question
await client.question.reply({ requestID, answers: [["option-1"]] })
await client.question.reject({ requestID })
```

## Event Types (SSE)

OpenCode emits many event types over SSE. The backend forwards all
**session-scoped** events (events that include `sessionID`) and ignores
events that have no session context.

Common session-scoped events:
- `message.updated` - message info updated (role, tokens, finish)
- `message.part.updated` - part updated; streaming text uses the `delta` field
- `message.removed`
- `permission.asked` / `permission.replied`
- `question.asked` / `question.replied` / `question.rejected`
- `session.created` / `session.updated` / `session.deleted`
- `session.status` / `session.idle` / `session.error`
- `session.diff`
- `todo.updated`
- `command.executed`

Frontend should handle these for real-time UI updates and respond to
permission/question requests via the Requests API.

## Error Handling

### Strategy
Backend handlers throw on OpenCode SDK errors; the Elysia `onError` handler
maps them to HTTP responses. Routes return 404 for missing conversations or
missing pending requests; unauthorized requests return 401.

Common OpenCode errors:
- `NotFoundError` - session/message not found
- `ModelNotFoundError` - invalid model ID
- `PermissionError` - operation denied
- Network errors (OpenCode server unreachable)

## Configuration

### Environment Variables
```bash
# Backend (apps/server/.env)
DATABASE_URL="file:./local.db"
CORS_ORIGIN="http://localhost:5173"

# OpenCode instances will use:
OPENCODE_API_KEY_ANTHROPIC="sk-ant-..."
OPENCODE_API_KEY_OPENAI="sk-..."

# Sandbox
KEPLER_SESSIONS_PATH="/absolute/path/to/sessions"

# Instance management
KEPLER_INSTANCE_IDLE_TIMEOUT="1800000"  # 30 minutes in ms
KEPLER_PORT_RANGE_START="5000"
KEPLER_PORT_RANGE_END="6000"
```

### OpenCode Instance Config
OpenCode is spawned via CLI (`opencode serve`) with:
- `--hostname` and `--port`
- per-user `XDG_*` environment variables to isolate OpenCode state
- `OPENCODE_PERMISSION` enforced so network tools require approval

## Frontend Structure

### Routes
```
apps/web/src/routes/
├── (authenticated)/
│   ├── chat/
│   │   ├── +page.svelte           # Conversation list
│   │   └── [id]/
│   │       └── +page.svelte       # Chat interface
│   └── +layout.svelte             # Auth wrapper
├── login/
│   └── +page.svelte
└── +layout.svelte
```

### State Management
```typescript
// $lib/stores/chat.svelte.ts
export const conversations = $state<Conversation[]>([])
export const currentConversation = $state<Conversation | null>(null)
export const messages = $state<Message[]>([])
export const isStreaming = $state(false)
```

### SSE Client
```typescript
// $lib/api/chat.ts
export async function streamMessage(id, input, callbacks) {
  for await (const envelope of sendMessageStream(id, input)) {
    // message.updated / message.part.updated -> normalized MessageView updates
    // permission.asked / question.asked -> pending request state updates
    // permission.replied / question.replied / question.rejected -> resolve requests
    // message.updated.info.summary.title -> conversation title update callback
  }
}
```

Frontend uses `fetch(POST /messages)` + `ReadableStream` parsing (not `EventSource`)
because message send and response streaming happen in one request/response flow.

## Key Design Decisions

### Why one instance per user (not per conversation)?
- Simpler resource management (fewer processes)
- OpenCode designed to handle multiple sessions internally
- Easier lifecycle management (spawn once, reuse)
- Users likely to have concurrent conversations

### Why SSE instead of WebSocket?
- OpenCode uses SSE natively
- Simpler protocol (HTTP + text/event-stream)
- Good enough for one-way streaming (server → client)
- Works cleanly with POST request streaming for prompt+response in one flow

### Why thin translation layer?
- OpenCode SDK is well-designed
- Avoid reimplementing OpenCode's logic
- Faster development
- Easier to upgrade OpenCode versions

### Why path-based sandboxing (vs system users)?
- No root privileges required
- Simpler deployment
- Adequate for MVP/single-server deployment
- Can upgrade to system user separation later if needed

## Open Questions

1. **File cleanup**: When to delete user session folders?
   - Option A: On user account deletion
   - Option B: TTL-based cleanup (e.g., 30 days)
   - Option C: User-triggered manual cleanup

2. **Conversation title generation**:
   - ✅ Implemented via OpenCode summary title events persisted on backend
   - Future: allow user overrides/rename API

3. **Rate limiting**:
   - Per-user message rate limits?
   - Instance spawn rate limits?

4. **Observability**:
   - Log aggregation from sandboxed processes?
   - Metrics collection (message count, token usage)?

## Next Steps

1. Create database schema (`packages/db/src/schema/opencode.ts`)
2. Implement `packages/opencode-manager`
3. Implement `packages/sandbox`
4. Add API routes in `apps/server`
5. Build frontend chat interface
6. Test multi-user isolation
7. Add file upload/download
8. Polish UX

## Current UX Notes

- Left conversation sidebar is collapsible; collapse state is persisted in `localStorage`.
- Right generated-files panel is collapsible (reclaims horizontal space); state is persisted per conversation in `localStorage`.
- Files list is always visible when the files panel is expanded.
- File actions include preview, download, copy path, copy link, and open raw.

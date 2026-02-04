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
  ...Timestamps,
}, (table) => [
  index("conversation_user_idx").on(table.user_id),
])
```

### OpenCode Database
OpenCode maintains its own SQLite database per instance with:
- Sessions (conversations)
- Messages (assistant/user messages)
- Parts (text chunks, tool calls, reasoning blocks)
- Todos, permissions, etc.

We do NOT replicate this data in Kepler's database.

## Filesystem Structure

Each user gets isolated directory:
```
/sessions/{userId}/
  ├── input/       # User-uploaded files, media
  ├── output/      # Agent-generated files
  └── playground/  # Scratch space for experiments
```

OpenCode's SQLite database is stored in its own internal location (managed by OpenCode).

## Security Model

### Sandboxing Configuration
Uses `@anthropic-ai/sandbox-runtime` with these restrictions:

```json
{
  "filesystem": {
    "denyRead": ["~/.ssh", "~/.aws", "~/.env", "/etc/passwd", "/etc/shadow"],
    "allowWrite": ["/sessions/{userId}/"],
    "denyWrite": [".env", ".git/", ".bashrc", ".zshrc"]
  },
  "network": {
    "allowedDomains": ["api.openai.com", "api.anthropic.com", "*.googleapis.com"],
    "deniedDomains": []
  }
}
```

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

### Files
```
POST   /api/conversations/:id/files/upload   # Upload file to input/
GET    /api/conversations/:id/files/output   # List output files
GET    /api/conversations/:id/files/:path    # Download file
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
// 4. Spawn OpenCode server with createOpencodeServer()
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
- OpenCode's internal DB persists between spawns (in user's session folder)
- Conversations/messages are not lost

### Message Flow (SSE Streaming)

**Client sends message:**
```
POST /api/conversations/{id}/messages
Body: { text: "Hello", attachments: [...] }
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
  path: { id: conv.opencode_session_id },
  body: {
    parts: [{ type: "text", text: message }],
  }
})

// 4. Subscribe to OpenCode SSE events
const { stream } = client.event.subscribe()

// 5. Re-broadcast relevant events to frontend via SSE
for await (const event of stream) {
  if (event.type === "message.part.delta" || event.type === "message.updated") {
    // Forward to frontend SSE stream
  }
}
```

**Frontend consumes SSE:**
```typescript
const eventSource = new EventSource('/api/conversations/123/messages')
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data)
  // Update UI with incremental text/tool calls
}
```

### OpenCode SDK Usage Patterns

**Creating conversation:**
```typescript
const { data: session } = await client.session.create({
  title: "New Chat",
  directory: `/sessions/${userId}/playground`,
}, { throwOnError: true })

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
  path: { id: opencodeSessionId },
  body: {
    parts: [
      { type: "text", text: userMessage },
      // optional: { type: "image", data: base64, mimeType: "..." }
    ],
  }
})
```

**Getting message history:**
```typescript
const { data: messages } = await client.session.messages({
  path: { id: opencodeSessionId }
})
// Returns MessageV2.WithParts[] array
```

## Event Types (SSE)

OpenCode emits these events over SSE:

**Server lifecycle:**
- `server.connected` - SSE connection established
- `server.heartbeat` - keepalive ping (every 30s)

**Message events:**
- `message.updated` - message info updated (role, model, tokens, etc.)
- `message.part.updated` - part finalized (text, tool call, reasoning)
- `message.part.delta` - incremental text chunk
- `message.removed` - message deleted

**Session events:**
- `session.created` - new session created
- `session.updated` - session metadata changed
- `session.deleted` - session deleted
- `session.diff` - file changes in session directory
- `session.error` - error during processing

**Permission events:**
- `permission.asked` - agent requesting permission for tool use
- `permission.replied` - user granted/denied permission

Frontend should handle these for real-time UI updates.

## Error Handling

### Strategy
Propagate OpenCode errors mostly as-is, add context:

```typescript
try {
  await client.session.prompt(...)
} catch (error) {
  // Add context
  throw {
    ...error,
    userId,
    conversationId,
    timestamp: Date.now(),
  }
}
```

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
Passed to `createOpencodeServer()`:

```typescript
{
  hostname: "127.0.0.1",
  port: allocatedPort,
  config: {
    // OpenCode config passed via OPENCODE_CONFIG_CONTENT
    providers: {
      anthropic: { apiKey: process.env.OPENCODE_API_KEY_ANTHROPIC },
      openai: { apiKey: process.env.OPENCODE_API_KEY_OPENAI },
    },
    // Other OpenCode settings
  }
}
```

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
// $lib/sse.ts
export function subscribeToConversation(id: string, onMessage: (msg) => void) {
  const eventSource = new EventSource(`/api/conversations/${id}/messages`)
  
  eventSource.addEventListener("message.part.delta", (event) => {
    const data = JSON.parse(event.data)
    // Append delta to message
  })
  
  eventSource.addEventListener("message.updated", (event) => {
    const data = JSON.parse(event.data)
    // Update message metadata
  })
  
  return () => eventSource.close()
}
```

## Key Design Decisions

### Why one instance per user (not per conversation)?
- Simpler resource management (fewer processes)
- OpenCode designed to handle multiple sessions internally
- Easier lifecycle management (spawn once, reuse)
- Users likely to have concurrent conversations

### Why SSE instead of WebSocket?
- OpenCode uses SSE natively
- Simpler protocol (HTTP + text/event-stream)
- Auto-reconnect built into EventSource API
- Good enough for one-way streaming (server → client)

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
   - Let OpenCode auto-generate titles (it has built-in title generation)
   - Or extract from first message on frontend?

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

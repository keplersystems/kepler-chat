# Kepler Chat

Single-user LLM chat application using one always-on OpenCode server as the agent backend.

## Stack

- **SvelteKit + Elysia (mounted)**: one process, one port. Browser hits same-origin `/api/*` served by the catch-all `routes/api/[...slugs]/+server.ts` which forwards to the Elysia app at `$lib/server/app.ts`.
- **Eden treaty**: typed client (`$lib/api.ts`) for components AND server loaders (`serverApi(event.fetch)`). Method chaining on Elysia routes is mandatory for type inference.
- **TailwindCSS v4** + **Drizzle + SQLite/Turso**
- **OpenCode SDK**: agent backend, supervisor booted once in `apps/web/src/hooks.server.ts` behind a `globalThis` HMR guard
- **@anthropic-ai/sandbox-runtime**
- **Auth**: shared passcode cookie (`isAuthenticated(request.headers)` middleware in Elysia + `+layout.server.ts` redirect)

## Architecture

- One sandboxed OpenCode server for the application
- Per-conversation directory isolation through the OpenCode SDK directory option
- Supervisor boot/shutdown via SvelteKit `hooks.server.ts` (top-level await + SIGINT/SIGTERM handlers)
- SSE streaming for real-time responses (raw `fetch` + `parseSSEStream` in the singleton `chat` store at `$lib/state/chat.svelte.ts`)
- Server data flows top-down: `+layout.server.ts` (conversations) → `+page.server.ts` (per-route data) → page consumes `data` directly. Mutations call `invalidateAll()` to re-load.
- Runtime/streaming state lives in the singleton store; **server data is never mirrored** in the store.

See `SPEC.md` for full architecture documentation.

See `references/opencode` for OpenCode codebase references.

## Code Standards

Since this is a production codebase:

- No silent fallbacks
- No unnecessary try/catch blocks
- No overengineering or overcomplication
- Only write ESSENTIAL comments
- Prefer proper JSDoc/docstrings where code is not obvious instead of inline comments
- Clean, readable code is expected

## Communication

Only interact with the user using the question tool, even if it's end of your response.

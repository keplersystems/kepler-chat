# Kepler Chat

Single-user agentic chat application using one always-on OpenCode server as the agent backend. Features: projects (grouped conversations with inherited AGENTS.md/config/skills), MCP servers + OAuth connectors, skills management, artifact previews, markdown/shiki message rendering.

## Stack

- **SvelteKit + Elysia (mounted)**: one process, one port. Browser hits same-origin `/api/*` served by the catch-all `routes/api/[...slugs]/+server.ts` which forwards to the Elysia app at `$lib/server/app.ts`.
- **Eden treaty**: typed client (`$lib/api.ts`) for components AND server loaders (`serverApi(event.fetch)`). Method chaining on Elysia routes is mandatory for type inference.
- **TailwindCSS v4** + **Drizzle + SQLite/Turso**
- **OpenCode SDK**: agent backend, supervisor booted once in `apps/web/src/hooks.server.ts` behind a `globalThis` HMR guard
- **@anthropic-ai/sandbox-runtime**
- **Auth**: shared passcode cookie (`isAuthenticated(request.headers)` middleware in Elysia + `+layout.server.ts` redirect)

## Architecture

- One sandboxed OpenCode server for the application
- Per-conversation directory isolation through the OpenCode SDK directory option; projects nest conversation dirs under `projects/{id}/conversations/{id}` so project files (AGENTS.md, opencode.json, .opencode/skills) inherit via OpenCode's directory up-walk
- **Filesystem is the source of truth** for everything OpenCode reads; the DB stores only grouping/titles/credentials. Project-scope config changes dispose instances; global-scope changes restart the server (OpenCode caches the global config layer process-wide — `global/dispose` does NOT flush it)
- Supervisor boot/shutdown via SvelteKit `hooks.server.ts` (top-level await + SIGINT/SIGTERM handlers)
- SSE streaming for real-time responses (raw `fetch` + `parseSSEStream` in the singleton `chat` store at `$lib/state/chat.svelte.ts`); SSE payload types derive from the SDK `Event` union in `$lib/contracts.ts`
- Messages render as ordered part views (`$lib/messages.ts`); markdown via marked-lexer → Svelte token renderer + shiki (`$lib/markdown`, `$lib/components/markdown`) — no `{@html}` for model output
- Design system: tokens in `src/app.css` ("Kepler observatory": Night surfaces, Brass primary, Phosphor `--activity` reserved for live agent states), IBM Plex Sans/Mono, light+dark via `.dark` class + `$lib/state/theme.svelte.ts`. Semantic token utilities only; primitives in `$lib/components/ui`
- Server data flows top-down: `+layout.server.ts` (conversations + projects) → `+page.server.ts` (per-route data) → page consumes `data` directly. Mutations call `invalidateAll()` to re-load.
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

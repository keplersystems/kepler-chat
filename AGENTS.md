# Kepler Chat

Single-user LLM chat application using one always-on OpenCode server as the agent backend.

## Stack

- **Frontend**: SvelteKit + TailwindCSS + shadcn/ui
- **Backend**: Elysia (Bun runtime)
- **Database**: SQLite + Drizzle ORM
- **Agent**: OpenCode SDK
- **Sandboxing**: @anthropic-ai/sandbox-runtime
- **Auth**: Shared passcode cookie

## Architecture

- One sandboxed OpenCode server for the application
- Per-conversation directory isolation through the OpenCode SDK directory option
- Server starts with the backend and stays running until backend shutdown
- SSE streaming for real-time responses

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

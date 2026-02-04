# Kepler Chat

Multi-user LLM chat application using OpenCode as the agent backend with per-user sandboxing.

## Stack

- **Frontend**: SvelteKit + TailwindCSS + shadcn/ui
- **Backend**: Elysia (Bun runtime)
- **Database**: SQLite + Drizzle ORM
- **Agent**: OpenCode SDK
- **Sandboxing**: @anthropic-ai/sandbox-runtime
- **Auth**: Better-Auth

## Architecture

- One sandboxed OpenCode instance per user (not per conversation)
- On-demand spawning with 30-min idle timeout
- Path-based filesystem isolation
- SSE streaming for real-time responses

See `SPEC.md` for full architecture documentation.

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

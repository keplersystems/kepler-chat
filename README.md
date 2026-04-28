# kepler-chat

Single-user LLM chat app using one always-on OpenCode server with per-conversation directory isolation.

## Stack

- **SvelteKit** — frontend + API in one app via mounted Elysia (catch-all `src/routes/api/[...slugs]/+server.ts`)
- **Elysia + Eden treaty** — type-safe server routes; client and `+page.server.ts` loaders consume them via the same `App` type
- **TailwindCSS v4**
- **Drizzle + SQLite/Turso**
- **OpenCode SDK** — agent backend; supervisor boots once via `src/hooks.server.ts`
- **Bun** — runtime

## Getting Started

```bash
bun install
```

Set required env in `.env`:

```
DATABASE_URL=
KEPLER_PASSCODE=                      # min 4 chars
KEPLER_SESSIONS_PATH=
KEPLER_PROVIDER_CREDENTIALS_KEY=      # base64-encoded 32-byte key
KEPLER_PORT_RANGE_START=5100
KEPLER_PORT_RANGE_END=6000
```

## Database Setup

```bash
bun run db:local        # optional local SQLite
bun run db:push         # apply schema
```

## Run

```bash
bun run dev             # web + API at http://localhost:5173
```

API endpoints are served by the same SvelteKit process under `/api/*`. Swagger UI at `/api/docs`.

## Project Structure

```
kepler-chat/
├── drizzle.config.ts
├── package.json
├── svelte.config.js
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
└── src/
    ├── hooks.server.ts                 # boots OpenCode supervisor (HMR-safe)
    ├── routes/
    │   ├── api/[...slugs]/+server.ts   # fallback → app.handle
    │   └── (authenticated)/...
    └── lib/
        ├── api.ts                      # Eden treaty client (api / serverApi / downloadFileUrl)
        ├── auth-client.ts
        ├── contracts.ts                # DTOs + SSE envelope types
        ├── env.ts                      # env validation
        ├── messages.ts                 # pure MessageView helpers
        ├── sse.ts                      # SSE parser
        ├── types.ts                    # UI shape types
        ├── components/                 # PascalCase Svelte components
        ├── state/chat.svelte.ts        # singleton runtime store
        └── server/                     # SERVER-ONLY (SvelteKit boundary)
            ├── app.ts                  # Elysia composition
            ├── auth.ts                 # passcode middleware
            ├── crypto.ts               # provider credential AES-GCM
            ├── files.ts, ids.ts, paths.ts, provider-models.ts
            ├── db/{client,schema,migrations}/
            ├── opencode/{manager,ports,provider-env,sandbox,supervisor}.ts
            └── routes/                 # Elysia routes
```

## Scripts

- `bun run dev` — start web + API
- `bun run build` — build for production
- `bun run check` — svelte-check
- `bun run test` — vitest
- `bun run db:push|studio|generate|migrate|local` — drizzle commands

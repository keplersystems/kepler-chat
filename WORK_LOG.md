# Work Log

## 2026-07-30 afternoon session: design rebuild (v2)

User verdict on the night session's "observatory" UI: worse than shadcn, dead, 2023 slop.
New references added in `references/`: **ClaudeSite** screenshots (the quality bar),
**transitions.dev** (motion patterns + tokens, in `skills/transitions-dev/`),
**thinking-orbs** (canvas loading orbs). Standing rules from this session: no banner/section
comments, no gratuitous pop/entrance transitions (motion must communicate), single-user app
(no profile UI). Identity decision (asked): claude.ai layout conventions but differentiated —
**emerald-teal accent** (user picked over amber), thinking-orb as brand mark, own wording.

### What changed

- **Tokens (`app.css`)**: warm paper-and-ink palette in OKLCH (dark #262624-family surfaces,
  ivory light theme), one emerald-teal accent (`--primary` oklch(0.68 0.115 169) dark /
  (0.55 0.1 172) light); `--activity` = brighter cut of same hue. Fonts: Inter Variable (UI),
  Source Serif 4 Variable (titles + assistant prose), IBM Plex Mono kept. Motion vocabulary
  replaced wholesale with transitions.dev tokens (verbatim from `_root.css`) — old
  `--duration-instant/normal/slower`, `--ease-out-quart/expo/spring` are gone everywhere.
- **transitions.dev patterns wired**: `.t-pop` (dropdown/select, origin-aware via bits-ui),
  `.t-modal`/`.t-overlay` (dialogs), `.t-tt` (tooltip fast-in/instant-out), `.t-icon-swap`
  (theme toggle, copy→check, send→stop), `.t-shimmer` (Thinking… label), `.t-acc`,
  `.t-stagger`, `.t-input` shake (login error), `.t-skel`, `.t-rise` (streamed content only —
  history renders instantly, no entrance animation on static chrome).
- **thinking-orbs ported**: engine vendored verbatim at `src/lib/components/ui/orb/engine/`
  (MIT), Svelte wrapper `ThinkingOrb.svelte` (theme store–aware, reduced-motion static frame,
  IntersectionObserver pause). Replaces OrbitSpinner everywhere (deleted). Brand mark =
  `state="searching"` globe on home/login.
- **Shell restructure (claude.ai IA)**: sidebar hoisted to `(authenticated)/+layout.svelte`;
  ConversationSidebar rewritten — serif Kepler wordmark, New chat (teal circled +), nav
  Chats/Projects/Customize, flat Recents (rename/delete via row menu), slim icon footer
  (theme/settings/signout; profile row removed — single user). Projects no longer nest in
  the sidebar (project page lists its own conversations).
- **Home (`/chat`)**: time-based serif greeting + orb, working composer (creates conversation
  via POST, fire-and-forget `chat.send`, navigates; providers via new shared
  `$lib/state/providers.svelte.ts` `modelCatalog` — replaces per-page loadProviders and
  last-model logic in chat/[id]), prompt-prefill chips.
- **New routes**: `/chats` (search + list), `/projects` (index + create), `/customize`
  (layout + Skills/Connectors moved from `/settings/*`; OAuth redirects in
  `server/routes/mcp.ts` updated). `/settings` keeps Providers, both use shared
  `SectionShell` (serif title + section nav).
- **Composer**: fatter (min-height 64, px-5), plus button, model picker moved bottom-right
  next to teal arrow-up send that icon-swaps to stop; typing allowed during streaming
  (submit guarded); monochrome capability badges (colored slop removed); helper caption
  removed. `text` is now bindable.
- **Messages**: assistant prose is serif via `.kepler-prose` (single prose system in
  MarkdownTokens); user bubble flat `bg-secondary` rounded-xl; caret removed — streaming
  shows inline orb; copy button icon-swaps; header title bar slimmed (h-12, no border).

### Verified in browser (agent-browser, screenshots in scratchpad)

Login+shake path untested visually but check-clean; verified: home dark/light, chats list,
conversation with serif markdown + shiki code + reasoning collapsible, streaming (orb +
shimmer + stop swap), home-composer create→navigate→stream, model picker popover, mobile
390px (drawer + adapted composer), customize/connectors + skills, providers, projects index.
`bun run check` 0/0, vitest 20/20, production build passes.

### v3 direction shift (same session, after user feedback)

Teal-on-warm-charcoal still read as a claude.ai clone ("it still looks very similar").
Root cause was the gestalt, not the hue: warm #262624 material + serif hero greeting +
soft rounded cards are Claude's signature. Shifted to a **precision instrument** voice:

- Surfaces: cold graphite (oklch hue 250, chroma ~0.005; dark bg 0.205, sidebar 0.175)
  and cool paper light theme — replaced all warm-hue neutrals.
- `--radius` 0.75rem → 0.5rem; composer and dialogs rounded-2xl → rounded-xl.
- Type: serif now ONLY in assistant prose (`.kepler-prose`). Wordmark, greeting, and
  "Recents" are mono caps with wide tracking; page titles are sans text-xl semibold.
- Home hero: orb (searching globe) + mono-caps time greeting; no serif headline.
- Teal accent unchanged — it is the identity color against graphite.

Verified in browser after the shift: login, home dark, conversation dark + light.

### Bulk chat deletion (added on request)

`DELETE /api/conversations` (body `{ids: string[]}`, max 100) looping `deleteConversation`;
/chats gets a Select mode — select-all row, per-row checkboxes (transitions.dev checkbox
pattern 25, new `Checkbox` primitive + `.t-check` in app.css), destructive confirm dialog.
Verified live: selected 2 QA chats, deleted, list and sidebar updated.

### Idempotent deletion (corrupted chats)

Six pre-sandbox-refactor conversations (April/May) had OpenCode sessions that no longer
resolve — message fetch 500s, and `session.delete` errors blocked the whole teardown.
`deleteConversation` now treats the OpenCode session delete as best effort (warn + continue)
so the directory and DB row always go; deleted all 6 via the bulk endpoint. Old sessions may
leave stale entries in OpenCode's storage, but nothing references them.

### Lazy chat creation + project page v2

"New chat" no longer creates a session up front — sidebar (expanded + rail) and /chats now
just link to `/chat`; conversations are created on first send via shared
`$lib/state/start-chat.ts` (create → upload attachments → fire-and-forget send → navigate).
The `/chat?/create` and project `?/createConversation` actions are deleted, which also stops
empty "New Chat" rows accumulating. Projects/[id] rebuilt to the claude.ai project layout:
back link, title + actions menu (rename/delete), composer that starts a project chat, chat
list with hover delete, right rail cards for Instructions / MCP servers / Skills. Verified:
New chat navigates without creating a row (conversation count unchanged), project page
renders with saved instructions and connected MCP, instructions Save disabled until dirty.
Layout fixed after feedback: title + actions menu live inside the main column (the menu had
floated to the page edge), rail top-aligned with the title, max-w-5xl, iconed empty state.
Second pass (rail towered over an empty left column): Instructions is now a compact preview
card with a pencil that opens an edit dialog (form action unchanged); MCP servers and Skills
are collapsed t-acc disclosures that expand in place. Rail and main column now balance.

### Edit user messages (revert + resend)

Pencil on a user message turns the bubble into a textarea (Enter sends, Esc cancels).
Flow: `POST /api/conversations/:id/revert {messageID}` → OpenCode `session.revert` (reverts
`id >= messageID`, restores file snapshots) → resend edited text in the same conversation;
OpenCode's prompt cleanup permanently drops the reverted tail. No fork. Attachments on the
original message are not re-sent (v1). Verified live: ALPHA exchange replaced by BETA.

### Instant-everything pass + generated-files fix (user AFK directives)

- **Model picker lag (root cause)**: 495 models across 11 connected providers, each row
  mounting up to 8 bits-ui Tooltip instances for capability badges — opening blocked the main
  thread for seconds. Fix: badges are plain spans with `title`, and the list renders a capped
  window of 80 options ("N more — search to narrow"); search filters the full catalog. Opens
  instantly now (CDP-measured click→listbox under 200ms round trip).
- **/api/providers cached**: OpenCode `provider.list()` costs ~350-400ms per call; added a
  60s module cache invalidated in all seven mutating provider handlers. 400ms → 40ms; route
  SSR timings now: all pages 20-55ms except /settings/providers ~230ms (SSR render of ~50
  provider collapsibles in dev mode; prefetch-on-hover hides it).
- **/chat/ii6g30nyqt1m8iyf5zhcd "issue"**: chat loaded fine — the real bug was the agent
  saved its deliverable to `outputs/` (plural) while the files panel only read `output/`.
  Two fixes: (1) files listing now walks the whole conversation workdir (excluding `input/`,
  dotdirs, symlinks; files only — dir rows were also making the sidebar appear for empty
  dirs), download "output" scope rebased to the workdir root; (2) a baseline AGENTS.md is
  written once (create-only, user-editable afterwards) at the sessions root telling agents:
  read attachments from ./input, save deliverables to ./output. Verified: hi.html now shows.
- **Edit preserves attachments**: `fileAttachmentInput` in $lib/messages.ts maps a persisted
  user file part (file:// URL under input/) back to a send-API attachment; edit resends them
  and shows the chips in edit mode. Verified live: model answered from the attached file
  before (42) and after edit (84).

### Scratchpad tier

Each conversation now provisions `scratchpad/` next to `input/` and `output/`; the files
panel excludes it (top-level exclude set is now {input, scratchpad}) and the baseline
AGENTS.md tells agents: notes/intermediate files go to ./scratchpad (invisible), deliverables
to ./output, everything else in the workdir is user-visible.

### Media library

ChatGPT-Library-style central attachment store. `media` table (id, sha256 hash unique,
filename, mime, size) + files at `{sessionsRoot}/library/{id}/{filename}`. Every composer
upload now goes through `saveToLibrary` (content-hash dedup) and is **hardlinked** into the
conversation's input/ — same bytes serve library + N conversations (verified links=3 after
two attaches). Deleting from the library keeps conversation copies (hardlink semantics).
Endpoints: GET/POST /api/media, GET /:id/raw, DELETE /:id, POST
/api/conversations/:id/files/from-library. UI: /media page (search, All/Images/Documents
tabs, thumbnails for images, download/delete), "Media" sidebar nav, composer plus button is
now a menu (Upload files / Add from library) with a picker dialog; library chips stage
alongside file chips through all three send paths (home, chat, project). Verified live:
upload → library row → attach in a second chat from the picker → model read the file; dedup
held at one row. Migration 0002 applied via drizzle-kit push (migrate hung; push is the
working flow for the local turso file).

### Quick wins batch + reasoning control

- **Regenerate wired**: finds the user message before the assistant one, reverts, resends
  (reuses the edit flow, attachments included). Verified live.
- **⌘K / Ctrl+K command palette**: actions (New chat) + pages + projects + chats, keyboard
  nav, mounted in the authenticated layout. Verified: search "create" + Enter navigated.
- **Paste-to-attach**: clipboard files staged from the composer textarea (untested live —
  clipboard not simulable via CDP CLI; standard handler).
- **Model favorites**: star per row (stopPropagation), persisted in localStorage via
  modelCatalog; "Favorites" pseudo-group pinned above the capped window when not searching.
- **Global instructions**: GET/PUT /api/instructions edits the sessions-root AGENTS.md;
  Settings → Instructions page. Verified render.
- **Finish notification**: chat.send requests Notification permission on first send and
  notifies when a stream ends while the tab is hidden (untested live — headless).
- **Queued send**: typing + Enter during a stream queues (chip with cancel); flushed
  automatically when the stream ends. Verified live: FIRST streamed, SECOND queued and
  auto-sent.
- **Reasoning effort control**: OpenCode models expose `variants` (e.g. GLM-5.2 high/max,
  Claude low/medium/high) and `session.prompt` takes `variant`; SendMessageInput +
  messages route pass it through, composer shows an Atom selector (Default + variants) only
  for models that have them, per-send. Verified: selector renders and switches; live send
  with a variant not exercised (no balance on variant-capable providers).
- Test messages cleaned out of the user's chat afterwards.

### Settings → General (claude.ai-style)

New default settings page (redirect now lands on /settings/general): Preferences —
Appearance (System/Light/Dark segmented, drives theme store), Motion (System/Reduced —
`.reduce-motion` root class mirrors the prefers-reduced-motion kill switch, applied by a new
`settings.svelte.ts` store persisted in localStorage); Notifications — "Response
completions" toggle using the transitions.dev toggle pattern (27) as a new `Toggle`
primitive (double-bounce thumb, `.is-init` so it doesn't animate on load). Completion
notifications now fire only when the toggle is on; enabling requests Notification
permission and refuses to stay on if denied (the request-on-send hack was removed).
Verified live: reduce-motion class toggles, theme flips, switch animates to checked.

### Usage dashboard + Permissions UI + full-text search

All three read OpenCode's own SQLite (`{root}/.opencode/data/opencode/opencode.db` — v1.14
stores sessions/messages/parts there; new read-only `opencode-db.ts` via @libsql/client).

- **Usage** (/settings/usage): 30-day totals (cost/tokens/responses), tokens-per-day CSS
  bars, by-model table (in/out/reasoning/msgs/cost, mono tabular), top conversations mapped
  through Kepler's conversation table. Aggregation is pure SQL over message JSON
  (`json_extract` on cost/tokens/model). Day labels normalized to ISO (libsql returns Date).
- **Permissions** (/customize/permissions): baseline stored in
  `{sessionsRoot}/permissions.json` (defaults: bash/edit allow, web tools ask,
  external_directory deny); manager merges it into OPENCODE_PERMISSION at spawn (env
  overrides config-file permissions in OpenCode — config.ts merges env last — so owning the
  env baseline is the only reliable path). PUT writes + `opencodeServer.restart()`.
  Verified: websearch→deny persisted to disk and the server came back healthy; reverted.
- **Search** (GET /api/search?q=): LIKE over text parts joined to messages, session→
  conversation mapping filters out non-Kepler sessions (title agents), snippet ±70 chars.
  /chats now shows an "In messages" section (200ms debounce) under the title matches.
  Verified live: "html page" surfaced the user message snippet.

### Committed + supervision niceties

Two sessions of work committed as 10 domain commits (deps → parts model → rendering →
projects/mcp/skills → media → design system → shell → usage/permissions/search → dialogs →
docs); tips build, intermediate commits are reviewable domains, not guaranteed-buildable.
Then three small features, all verified live:
- Sidebar live activity: orb next to any conversation that is currently streaming
  (chat.isStreamingFor per row) — the multi-agent supervision view.
- Context meter: "N% ctx" (mono, destructive tint ≥85%) beside the composer controls;
  last assistant message's total tokens vs the selected model's context limit, passed from
  the chat page.
- Retry on failure: the error banner gained Retry, wired to the composer's exported
  requestSubmit() — the failed draft is already restored, so retry re-sends exactly it.
  Verified with zhipuai (no balance): send failed, banner + Retry appeared, click re-fired.

### Sidebar freshness fix + manual compaction (finished after a laptop crash mid-edit)

- Root cause of "new chat missing from sidebar until the reply finishes": the layout load
  only reads url.origin, which never changes, so SvelteKit never re-ran it on navigation —
  the sidebar rode stale data until the end-of-stream invalidateAll. Fixes: startChat
  navigates with goto(..., {invalidateAll: true}); chat.send fires invalidateAll as soon as
  the stream response opens; the user echo adopts the server message id when
  message.updated arrives so the page can dedup echo-vs-persisted by id (visibleMessages
  filters streaming entries whose id is already persisted). Verified: mid-stream, the new
  chat is the top sidebar row, active, with the orb.
- Compaction: ctx% is now a button (tooltip shows exact tokens, shimmer "compacting…"
  while running) → POST /:id/compact → session.summarize. Trap: the SDK types mark
  providerID/modelID optional but the server requires them — pass the conversation's stored
  model. Verified live: 12,085 → 1,192 tokens (6% → 1%), summary message rendered.

### Compaction controls (mobile-safe + auto)

- ctx% is no longer tap-to-compact: it opens a dropdown showing exact usage
  ("~N / M tokens") with "Compact conversation" as an explicit item — safe on touch,
  richer than the old hover tooltip. Verified in browser.
- Settings → General → Context: "Auto-compact" toggle + threshold segmented (70/80/90,
  default 80, localStorage). The toggle also writes `compaction.auto` into the global
  opencode.json via updateOpencodeConfig + server restart (verified both directions on
  disk), so OFF disables OpenCode's built-in auto-compaction too. OpenCode has no percent
  knob (its trigger is buffer-based), so the threshold is Kepler-side: after a successful
  send, if lastTokens/contextLimit ≥ threshold, the page auto-runs compact. Threshold
  trigger not exercised live (needs a conversation at 80% of a 200K window); logic is the
  same handleCompact path verified manually.

### Next session cues

- zhipuai still has no balance; fireworks key invalid — first sends on those models error.
- `/chat/[id]` header could get the model/title dropdown claude has.
- Late fixes in this session: global `:focus-visible` + interactive-transition rules moved
  into `@layer base` (unlayered they beat Tailwind's layered `focus-visible:outline-none`,
  causing double focus rings on the composer); FilePanel row stagger/hover-shift removed;
  OutputFilesSidebar deduped onto `.t-smooth-width`; dialogs + files surfaces visually
  verified (env setup dialog screenshot).
- Toggle pattern (27) not yet used — no toggles exist in UI today; use it when settings grow.
- Nothing committed this session either; diff spans the v1 night session + this rebuild.


## 2026-07-30 night session: full feature build

Goal (user): finish Projects, MCPs, connectors, Skills, Artifacts; redo UI to 2026 standard
(not shadcn-default); reusability, single source of truth, no hacks; integrate agentic UX
(no separate "Code" mode); then keep adding QoL/features. User AFK, full autonomy.

### OpenCode recon findings (v1.14.28, verified against references/opencode + installed SDK)

- **MCP**: config schema in `mcp` map of opencode.json (`local`/`remote`, `oauth: {}` enables
  auto-discovery + RFC7591 DCR). Runtime API: `client.mcp.status/add/connect/disconnect`,
  `client.mcp.auth.start/callback/remove`. CRITICAL: `mcp.add` is in-memory only and doesn't
  show in later `mcp.status()`; durable source of truth = opencode.json we write ourselves +
  `client.instance.dispose({directory})` to re-read. OAuth tokens are GLOBAL per server NAME
  (`~/.local/share/opencode/mcp-auth.json` → under our XDG redirect). `auth.start` returns
  `{authorizationUrl}`; we must validate OAuth `state` ourselves (parse from URL query).
  `auth.start` calls `ensureRunning(redirectUri)` which tries to LISTEN on the redirect URI's
  port — keep default `127.0.0.1:19876` redirect and proxy, or handle carefully.
- **Projects**: OpenCode's own project concept is git-derived (non-git dirs collapse into
  `global` project) → grouping lives in Kepler DB. Per-project instructions/config are pure
  filesystem: `AGENTS.md` + `opencode.json` are picked up walking UP from the request
  `directory`. So: `<projectDir>/{AGENTS.md,opencode.json,.opencode/skills/...}` with
  conversation dirs nested inside inherits everything.
- **Skills**: `SKILL.md` (frontmatter: name, description) discovered in `.opencode/{skill,skills}/**`
  walking up + global config dir. List: `client.app.skills({directory})`. No write API — filesystem.
- **Agents/commands**: same pattern (`.opencode/agent/*.md`, `.opencode/command/*.md`);
  `client.app.agents()`, `client.command.list()`, `session.prompt({agent})` selects agent.
- **Config caching**: per-directory instance caches config until `instance.dispose({directory})`
  (or `global.dispose`). `client.config.update` is BROKEN for per-directory use (writes
  config.json which is never read back) — never use it; write files + dispose.
- **Artifacts**: nothing in OpenCode; entirely ours (file parts + `GET /file/content`).

### Done

- **Task 2 — parts refactor (foundation)**: replaced flattened MessageView (joined text/reasoning
  strings + unordered toolCalls) with ordered `parts: PartView[]` typed from SDK
  (`text|reasoning|tool|file|subtask|command`). `contracts.ts` now derives SSE payload types
  from the SDK `Event` union (`SERVER_EVENT_NAMES` + `EventPayload<K>`); server
  `sessionIdOf` map is exhaustive over the same names (compile-time sync). Store rewrite:
  typed reducer, parts arrive-before-message handled via ensureMessage, part.delta appends
  by partID (was: blindly to msg.text), part.removed/message.removed handled,
  AbortController + `stop()` + new `POST /api/conversations/:id/abort`, per-conversation
  `isStreamingFor()`. PendingRequestDTO now typed (PermissionRequest|QuestionRequest);
  `getRequestId` deleted. Tests rewritten with SDK-typed fixtures; check + 15 tests green.
  NOTE: MessageBubble/MessageList updated to compile (parts loop) but visual redesign is
  tasks 3/4. Stop button not yet in UI (wire in composer during task 4).

### Architecture decisions

- Filesystem layout (planned):
  `KEPLER_SESSIONS_PATH/projects/<projectId>/{AGENTS.md,opencode.json,.opencode/skills/,files/,conversations/<convId>/}`
  Standalone conversations stay at `conversations/<convId>`. `getConversationRoot` must
  become project-aware (DB lookup or path stored on conversation row).
- MCP/connectors: Kepler DB is source of truth; render to project/global opencode.json;
  dispose affected instances to apply. Connectors = curated remote MCP presets w/ OAuth.

### Done (continued)

- **Task 3 — design system core**: app.css rewritten. Identity "night observatory":
  Night blue-black surfaces (real chroma, oklch hue 265), Brass primary (amber, restrained),
  Phosphor teal `--activity` reserved for LIVE agent states only, light theme = cool chart
  paper + ink (deliberately not cream/terracotta). IBM Plex Sans Variable + IBM Plex Mono
  (fontsource, self-hosted) replace Inter/JetBrains. Radius 1rem→0.625rem. Role NAMES kept
  (card/muted/primary/…) so components compile; values all changed. Real light/dark:
  app.html pre-paint script + `theme` store (src/lib/state/theme.svelte.ts) + ThemeToggle.
  New primitives: ui/input (Input/Textarea/inputClass), ui/icon-button, OrbitSpinner
  (signature: elliptical orbit sweep = activity indicator). Scrollbar CSS fixed (old
  selectors were invalid and dropped), orphan keyframes pruned. NOTE: `--input` token is
  now a FIELD BACKGROUND (was ambiguous shadcn border-ish); old copy-pasted `border-input`
  usages should migrate to `border-border bg-input` during the sweep.
- **Task 4 — rich rendering (delegated infra + my integration)**: markdown pipeline
  (marked 18 lexer → Svelte-native token renderer, NO {@html} for content; shiki 4 dual-theme
  code blocks) under src/lib/markdown + src/lib/components/markdown. MessageBubble rewritten:
  assistant content flows bubble-less in a centered 52rem column, user gets compact card
  bubble; parts render in order via parts/{ToolCallCard,ReasoningBlock,FileChip}.svelte.
  ToolCallCard = instrument readout (status rail: activity teal while running, auto-open
  while running / auto-close on completion unless user toggled). ReasoningBlock live-follows
  streaming. Streaming caret on last text part. MessageList: scroll respects user position +
  jump-to-latest pill + empty state. MessageInput: Stop button (chat.stop → POST abort).
  Dead action buttons resolved: actions render only when a handler prop is wired.
- **Task 5 backend + Task 6 + 7 backend**: DB: project table + conversation.project_id
  (migration 0001 applied). paths.ts is project-aware (ConversationLocator {id, project_id});
  supervisor.conversationClient(locator) + directoryClient + disposeDirectory. Filesystem
  is source of truth: config-file.ts (typed opencode.json read/modify/write per scope
  global|project), mcp.ts (list w/ live status via scope-dir instance, upsert/remove →
  write file + dispose; OAuth: startMcpAuth rewrites oauth.redirectUri to
  <origin>/api/mcp/oauth/callback, tracks `state` server-side w/ 10min TTL since OpenCode's
  split flow doesn't validate it, completeMcpAuth on GET callback → redirect to
  /settings/connectors?connected|error), skills.ts (SKILL.md CRUD global/project +
  list via client.app.skills so shadowing matches runtime). Routes: projects, mcp, skills
  registered in app.ts. Conversation rename: PATCH /api/conversations/:id (+ session.update).
  Connector presets: src/lib/connectors.ts (github/linear/notion/sentry/context7/stripe).
- **Task 8 — artifacts**: ArtifactViewer.svelte (html → sandboxed iframe [allow-scripts only]
  with Preview/Source tabs, md → Markdown renderer + tabs, images/pdf inline via new
  `disposition=inline` file-route param, code → shiki CodeBlock, binary → download).
  FilePanel preview dialog now uses it (wide dialog); its old plain-<pre> path deleted.

### Delegated (in flight)

- Agent: settings UI — McpServerManager + SkillManager (reusable, projectId? prop),
  /settings/connectors (presets grid + custom servers + OAuth banners), /settings/skills,
  settings nav = providers/connectors/skills.
- Agent: projects UI — sidebar Projects/Chats sections (expand, create-in-project, rename
  wire-up), /projects/[id] page (instructions editor, conversations, rename/delete; has
  `<!-- project-mcp-manager -->` + `<!-- project-skill-manager -->` insertion comments for
  me to embed managers after both agents land). Transient check errors in ChatLayout/chat
  pages are this agent mid-flight adding a `projects` prop.

### Verified end-to-end in the running app (agent-browser, screenshots taken)

- Login → new identity live (Night/Brass, Plex). Theme toggle light/dark both coherent.
- Project create → sidebar section → project page (instructions editor saves to
  `projects/<id>/AGENTS.md` on disk, verified by cat) → conversation created INSIDE project
  (OpenCode cwd = project-nested dir, verified via session path) → reply followed project
  instructions (concise bullets).
- Streaming: markdown + shiki code blocks + copy button + token/model footer render;
  composer clears instantly on send; stop button aborts (POST /abort verified);
  jump-to-latest + scroll-respect; assistant error surfaces inline (bad fireworks key case).
- Titles: OpenCode only auto-titles sessions holding ITS OWN default title → sessions are
  now created without an explicit title; Kepler DB keeps the display title; title syncs via
  session.updated during stream + one session.get after stream; placeholder
  "New session - <iso>" filtered via isRealSessionTitle. Verified: fresh convo titled
  "SQLite vs Postgres for local app" automatically.
- MCP: PUT /api/mcp/context7 wrote global opencode.json + restart → status "connected".
  GOTCHA (fixed): global config layer is cached process-wide; `global/dispose` does NOT
  flush it (only Config.invalidate via PATCH /global/config, which can't delete keys) →
  global scope applies via opencodeServer.restart(); project scope via instance dispose.
  Connectors page now only launches OAuth when status === needs_auth (Context7 needs none).
- Skills: PUT /api/skills/release-notes → SKILL.md on disk under global config dir, listed
  by client.app.skills alongside the user's real ~/.claude//.agents skills (those leak in via
  Global.Path.home — intentional OpenCode behavior; note: they show as "Global" but editing
  writes to Kepler's global dir → name shadowing is nondeterministic. Left as-is.)
- Artifacts: HTML preview in sandboxed iframe (JS ran, allow-scripts only), Preview/Source
  tabs, md/code/image rendering, `disposition=inline` file param added.
- Env fixes: sandbox is read-only outside sessions root → TMPDIR + npm_config_cache now point
  under `.opencode/tmp` (OpenCode crashed on mkdir /tmp/opencode at boot before this).
- Model default: new conversations remember last-used model (localStorage kepler:last-model)
  instead of first-connected (zhipuai has no balance → was default-broken).
- Mobile: sidebar becomes off-canvas drawer (<md) w/ hamburger + backdrop; headers get
  max-md padding. Verified at 375px.
- Extras shipped: branch conversation (POST /:id/branch = fork session + cp dir),
  delete message endpoint + menu wiring, retry parts rendered ("Retry N — message"),
  per-message cost in token tooltip, todos tracked in store (todosFor — UI surface TBD),
  conversation rename (PATCH + sidebar inline edit), welcome page redo (no emoji/mode cards).

- Plan rail: TodoRail.svelte shows the agent's live todo list (todo.updated) above the
  message list while streaming — status glyphs, in-progress uses the orbit spinner.
- Final gates: check 0 errors, 20/20 tests, `bun run build` succeeds.

### Known follow-ups (next session)

- todo.updated store data has no UI panel yet (chat.todosFor(id)).
- Regenerate + Edit message actions not wired (menu items hidden — handlers absent by design).
- OAuth connector end-to-end untested against a real OAuth provider (needs live account;
  state validation + callback flow implemented per spec).
- opencode processes leak across vite SSR reloads in dev (HMR guard holds old manager;
  harmless single-user, restart dev server to clean).
- The user's personal ~/.opencode/opencode.json + ~/.claude skills are visible to the app's
  OpenCode server (HOME not redirected). Decide whether to isolate via HOME env.
- zhipuai + fireworks providers have dead credentials (balance/invalid key) — surface
  provider health in settings someday.

### Task board

1 ✓ recon; 2 ✓ parts refactor; 3 design system (me); 4 rich rendering (markdown infra me,
delegated pieces); 5 projects (backend me); 6 MCP+connectors; 7 skills; 8 artifacts;
9 sweep + browser verification. Extras backlog: rename convo, edit/regenerate/branch wiring
(session.fork/revert), theme toggle, command palette, todo.updated panel, cost display,
keyboard shortcuts, mobile drawer sidebar.

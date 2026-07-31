# Work Log

## 2026-08-01 — Failures made legible; shared-conversation management

**Provider errors reach the UI.** opencode reports a provider failure only on
the event stream: `session.error`, and `retry` parts carrying an `ApiError` with
the attempt number. The message itself comes back clean and empty, which is why
"credits depleted" cost 66 seconds of silence and lived only in a log file. The
translator now captures both and the driver throws with the real text.

Scoped deliberately: opencode's **title agent runs on the same session id** and
fails on every turn here (`small_model` points at fireworks-firepass, whose key
is invalid), so an unguarded `session.error` would fail perfectly good turns.
The captured error is only claimed when the turn produced no text of its own.
Verified both directions: a working turn is unaffected by the background title
failure, and a turn against the invalid-key provider now reads "The API key you
provided is invalid." instead of nothing.

**Elapsed time while a turn runs.** A doomed request retried with growing
backoff and the UI just said "Thinking…". Now the indicator carries a counter,
hidden for the first 3 seconds so ordinary replies stay unadorned. Verified
live at "Thinking… 12s". No hard deadline: work-mode turns are legitimately
long, and killing them would trade one wrong behaviour for another.

**Turns that end with nothing to read say so.** `finalize()` only caught turns
with zero parts, so a model that emits reasoning and stops (observed on gemini)
rendered as a blank bubble. A turn that ends normally with no text and no file
part is now reported as ending without a reply. NOT yet observed firing: the
gemini stop was transient and I could not reproduce it on demand.

**Settings → Sharing** lists every conversation with a live public link, with
copy and stop-sharing per row, since previously nothing revealed what was
public except opening each conversation.

## 2026-07-31 — Share links, header actions

Header now carries branch, the generated-files toggle, and Share, top right per
the user's reference. The files panel lost its own collapsed rail, since the
header owns that toggle now; collapsed is `w-0` rather than a 12-wide stub.

**Share is a public read-only link** (user's choice among export / public link /
copy-as-text). Migration 0008 adds `conversation.share_token`, unique and
nullable. Sharing mints a 42-char token rather than exposing the conversation
id, so a shared URL cannot be walked back to the authenticated routes, and it is
idempotent: re-sharing returns the link already in circulation.
`/share/[token]` is exempted from the auth gate in hooks.server.ts and reads the
database directly, since these requests carry no session.

Attachments needed their own route or the feature would have been a lie: the
transcript rendered but every Download and every media preview answered 401.
`/share/[token]/files/[...path]` serves them through the same
`resolveExistingSafeFilePath` guard, and the page loader rewrites file part urls
from the authenticated prefix to the token-scoped one.

Sharing is revocable from the header: once shared the button reads "Shared" and
opens a menu with Copy link / Stop sharing. State comes from
`ConversationDTO.share_token`, so it survives a reload rather than living only
in component state.

Verified: unauthenticated fetch of a share link renders the transcript; bad
token 404s; `/chat/:id` still 303s to login; encoded traversal
(`..%2f..%2f..%2fetc%2fpasswd`, and via a legitimate `output/` prefix) all 400.
Revoking nulls the token, and the old link's page and files both go to 404;
re-sharing afterwards mints a fresh token rather than resurrecting the revoked
one, so a leaked link stays dead.

**Bug caught by that work:** the generated-file parts I added earlier built urls
from output-directory-relative paths, but the download route resolves the
`output` scope against the conversation *root*, so every Download 404'd. Paths
are now root-relative (`output/second.txt`), matching the listing route.
Verified 200 both authenticated and through a share link.

## 2026-07-31 — Attachment mime normalised; file cards both sides

**One bad upload used to brick a conversation.** `resolveAttachments` preferred
the browser's mime over Kepler's own lookup, and Linux's shared-mime-info calls
a `.tsx` a Tiled tileset (`application/x-tiled-tsx`). Gemini rejects it, the
rejected part stays in the transcript, and every later turn replays it, so a
message with no attachment at all still failed. Now a mime is only relayed when
it names a modality the model can act on; otherwise Kepler reads the first 4KB
and says what the bytes are, `text/plain` or `application/octet-stream`.
Verified: the part reaches opencode as `mime: text/plain`.

**Uploads 500'd after the crash.** Uploads dedupe by content hash and hardlink
from the media library, which lives under the sessions root (tmpfs in dev), so
a reboot left rows whose bytes were gone and `link()` threw ENOENT. Every file
uploaded before the reboot failed to re-upload, silently, with the send never
starting. `saveToLibrary` now rewrites the bytes when a dedupe hit has lost its
file, and a genuinely missing library file returns 410 rather than a raw 500.

**File parts render per side.** User attachments get the compact tile (filename,
line count, extension badge); the agent's own files get the wide card with a
Download, where downloading is the point. Line counts are computed for text
attachments during the same pass that decides the mime.

**Agent-written files now appear in the reply.** They existed only in the
Generated Files sidebar, unattributed to any turn. The runner snapshots the
output dir before the turn and diffs it after, keyed by size and mtime, and
emits a file part per new or rewritten file. The sidebar is unchanged and both
show the file.

Verified end to end: `colors.md` renders as `4 lines / MD` on the user message,
and a Claude work turn writing `palette.txt` shows `Text · TXT` with Download
inline plus `Generated Files (1)` in the sidebar.

## 2026-07-31 — File parts render as previews, not chips

Every non-image attachment used to be one small monospace download chip.
FileChip now switches on `fileModality` (already in contracts):
- image: unchanged, but wrapped in a link so it opens full size
- audio: inline `<audio controls>`; this is what the transcription flow needed
- video: inline `<video controls>`, poster and duration from `preload=metadata`
- everything else: the card from the user's reference, an icon tile plus
  filename, `Kind · EXT`, and a Download button

Kind comes off the extension, not the mime type: mime goes vague
(`application/octet-stream`) exactly where the label would matter, and nothing
upstream describes what a file is to a reader.

Media captions are download links, so the affordance the old chip always had
survives a codec the browser cannot decode.

Verified in browser on a conversation carrying all four: png, mkv (poster and
0:14 duration), m4a, and a .tsx uploaded to check the card (icon, name,
`Code · TSX`, Download).

Observed while testing, not fixed: the browser typed that .tsx as
`application/x-tiled-tsx` and Gemini rejected the turn with "Unsupported MIME
type". Kepler passes the browser's mime straight through; text-ish uploads with
odd mime types will keep failing until that is normalised.

## 2026-07-31 — UI taste pass against references/

Compared references/ClaudeSite (claude.ai captures), references/transitions.dev
and references/thinking-orbs against Kepler's current screens.

**Settings de-boxed.** Both claude.ai captures use the same discipline: label +
muted description left, control hard-right, sections separated by whitespace and
one hairline, and a border only where it means something (their one bordered
card marks a *dependent* setting). Kepler wrapped every agent in its own
`rounded-xl border bg-card` with a second inner divider. Now `divide-y` sections
with `py-6`; the env-var block lost its redundant `border-t`. Same instinct as
the tool-card cleanup: the boxes carried no information.

**Versioned model labels.** claude.ai's composer reads "Sonnet 4.5"; Kepler read
"Sonnet", because that is the SDK's `displayName`. `versionedName()` derives the
version from `resolvedModel` (structured, not prose): strip `claude-` and the
`[1m]` marker, take numeric segments of one or two digits (excludes the
`-20251001` date stamp on haiku). Applied only when displayName is exactly the
family name, so "Opus (1M context)" and "Default (recommended)" keep their own
wording. Live: Fable 5 / Sonnet 5 / Haiku 4.5, composer chip reads "Sonnet 5".

**Orb states now communicate.** thinking-orbs ships six verbs; Kepler used four
and showed `working` for everything in ActivityTrail, including while a web
search ran, and while assistant text streamed. The trail's label and orb now
come from one `running` tuple so the animation cannot disagree with the words
(searching / solving / working); streaming assistant text uses `composing`,
previously unused; ToolCallCard picks `searching` for fetch/read kinds.

**One live orb per message.** User caught two spinners racing in one message:
the trail's ("Searching the web…") and the message-level one below it.
MessageBubble rendered its orb on `streaming` unconditionally, so it doubled up
with whichever child was already indicating activity — pre-existing, but the
trail made it obvious. It now yields when the last block is a live trail or a
live reasoning block, both of which already show an orb *and* say what they are
doing. Verified live: one canvas in `main` during a search (the other is the
sidebar's per-conversation generating dot, a different surface).

**New-chat screen: orb replaced by a Kepler mark, greeting became the hero.**
The generic dotted orb was doing no work there. Now `ui/KeplerMark.svelte`, and
the greeting is large serif sentence-case instead of a mono all-caps caption.
Same lockup on login, above the wordmark.

The mark is the real Kepler-16 system, drawn to the proportions in the NASA
diagram the user supplied: three face-on circles, each star on its own orbit.
- Radii derive from the actual system rather than being eyeballed: separation
  0.22 AU against the planet's 0.70 AU, split by the 0.69/0.20 M☉ mass ratio so
  the heavier star takes the tighter path. Gives rB/rA 3.45 and planet/rB 4.13,
  against ~3.0 and ~3.4 measured off the reference.
- Binary spins 229/41 faster than the planet, the real period ratio, so the
  relative motion is right without tuning.
- Hovering shows one of five facts about the system, cycling per hover.
- Two earlier geometries were wrong and got thrown away: a focus-offset
  eccentric orbit (the planet flew straight through the stars at perihelion),
  then a tilted near-circular one (better, but the pair still read as a single
  smudge because they overlapped).
- Geometry and viewBox are computed once at module scope; both animations bail
  under `prefers-reduced-motion`.

Dead end worth recording: asked what to do about the orb, I first made it static
via a `still` prop, then swapped orb states. Both were misreads — the ask was to
replace the element, not restyle it. `still` was fully reverted, no dead code.

**Motion: only one of the three proposals was real.**
- `tabs-sliding` added for the Chat|Work toggle: a `.t-tabs-pill` that JS
  measures and CSS tweens, using Kepler's existing `--duration-fast` /
  `--ease-smooth-out` (which already equal the snippet's own defaults) rather
  than importing `--tabs-*`. Kept `role="radio"`, not the snippet's `tablist`:
  it selects a mode, it does not switch panels. First paint snaps with
  transition suspended so it does not slide in from the left on mount.
- `menu-dropdown` was **already vendored as `t-pop`** (its variables are
  literally `--dropdown-*`) and already applied to select content with the
  right transform-origin. Nothing to do; I had missed it because the class name
  differs from the snippet name.
- `panel-reveal` **rejected**. ActivityTrail, ReasoningBlock and ToolCallCard
  are sibling disclosures in the same message stream and all use
  `animate-collapsible-*`. Giving one of the three its own reveal would be the
  ad-hoc inconsistency this pass is removing.
- `spinning-counter` rejected earlier for the token counters: its own doc calls
  it fanfare for "a jackpot roll", and streaming token counts are ambient state.

Verified in browser on the user's own instance (:5173): pill slides and resizes
(translateX 2px/41px → 44px/45px with transform+width transitions), de-boxed
settings, versioned names in menu and chip, and "Searching the web…" live during
a search turn (same tuple as the orb state). svelte-check 0 errors / 2476 files,
vite build clean.

Note: `bun x vite dev --port 5199` now fails with ENOSPC (inotify watcher limit,
135353 max) after this session's repeated restarts; the user's own :5173 server
is the one to use.

## 2026-07-31 — Same treatment for codex; claude helpers collapsed

User: do the other SDKs too, nothing hardcoded, and the claude code was
fragmented into trivial functions and if/else chains. Both fair.

**Codex** was already catalog-driven from `model/list` but threw away most of
what the protocol reports:
- `FALLBACK_EFFORTS = ["low","medium","high"]` stood in whenever a model
  reported none. Gone. Codex actually advertises **six** levels per model with
  a `description` each, so the fallback was hiding Xhigh, Max and **Ultra**
  behind three invented ones. The effort option is now built from
  `supportedReasoningEfforts` (value + description) and omitted entirely when a
  model has none, same rule as claude.
- `defaultReasoningEffort` was only a last-resort `??`; it is now the real
  default whenever the stored choice is no longer advertised.
- `Model.hidden` was never checked, so models codex marks hidden were listed.
- `APPROVAL_OPTIONS` restated the protocol's decision ids, and both call sites
  restated them again as inline casts. One `ApprovalDecision` type now derives
  from the generated bindings
  (`Extract<CommandExecutionApprovalDecision, string> & FileChangeApprovalDecision`)
  and the array is pinned with `satisfies`, so a protocol rename is a build
  error rather than a runtime surprise.

**OpenCode** needed nothing: its models, groups and variants already come from
the models.dev catalog. Its remaining literals are tool-name → `ToolKind`
translation, not a mirrored catalog.

**Claude** cleanup: `modelFor` / `effortsFor` / `resolveEffort` (three functions,
two if-chains, overlapping work) collapsed into one `selection()` returning the
row, its ladder and the effort to send. `STALE_MODEL` and `optionLabel` moved to
session-config-store now that both drivers use them.

Deliberately left alone, since they are Kepler's own decisions rather than
mirrored SDK state: `CHAT_TOOLS` (what chat mode grants), the tool-kind name
maps, and the `["model","effort"]` id check.

Verified live: codex lists five models with descriptions and six efforts with
theirs, default lands on the model's own `defaultReasoningEffort` (Medium), and
a codex turn completes. svelte-check 0 errors / 2476 files, vite build clean.

## 2026-07-31 — Claude model list comes from the CLI, not from constants

The picker showed "Opus"/"Sonnet"/"Haiku" because the driver carried
`MODEL_VALUES = ["default","opus","sonnet","haiku"]` and `EFFORT_VALUES`.
User: nothing hardcoded, it breaks between versions. They were right twice over
— the list had already gone stale (no **Fable** at all, and plain `opus` where
the CLI now lists `opus[1m]`).

`query().supportedModels()` returns the real catalog: `value`, `displayName`,
`description` (carries the version — "Opus 5 with 1M context", "Haiku 4.5"),
`resolvedModel`, and per-model `supportedEffortLevels`. Probed first: it answers
in ~1.2s over the control protocol with **no turn and no tokens** if the prompt
generator never yields, so `loadModels()` spawns an idle query against
`getProbeRoot("claude")` and aborts it in a `finally` (verified: no orphan CLI
process under the dev server). Cached promise cleared on failure, mirroring the
codex driver's `loadModels`.

Every hardcoded list is gone; `EffortLevel`/`ModelInfo` are imported from the
SDK rather than redeclared. Consequences:
- Fable now appears; descriptions carry the versions the user asked for.
- Reasoning effort is derived per model, so it **disappears for Haiku** (which
  advertises no ladder) instead of offering a control that does nothing. The
  default is the middle rung of whatever the model advertises, which lands on
  "high" for the 5-level ladder — same behaviour as before, now derived.
- No effort is sent on turns for models without one.
- A conversation holding a value the CLI stopped listing (one row still on
  `opus`) keeps it as a visible "No longer listed" option instead of rendering
  blank or silently reading as another model. Matching uses `resolvedModel`,
  which exists for exactly this.
- Catalog failure no longer has a fabricated fallback to hide behind; it
  propagates and the cache clears so the next call retries.

Verified in browser after a dev-server restart (the config cache is per-process,
so the old list survived HMR): all five models with versioned subtitles, effort
present on Opus and absent on Haiku, and a live Haiku turn completing with no
effort sent. svelte-check 0 errors / 2476 files, vite build clean.

## 2026-07-31 — Chat-mode tool calls become one activity trail

User: the per-call tool cards are "ad-hoc for a chat view", and showed the
claude.ai research-trail reference (summary line → rail of steps → search
results as an inner scrollable card → Done). Five stacked bordered boxes each
repeating a raw tool name and DONE became two quiet summary lines.

Decisions taken with the user: **chat mode only** (work keeps ToolCallCard,
which carries diffs, file locations and permission detail a compact trail would
bury), and **monogram chips instead of favicons** — no favicon service, no
per-domain requests, nothing leaks; the domain seeds a stable hue so a source
keeps its colour across messages.

- `lib/search-results.ts` — results are not structured on the wire, so this
  parses the two shapes engines actually emit: Claude's `Links: [{title,url}]`
  JSON blob and Exa/opencode's `Title:`/`URL:` stanzas. An unrecognised shape
  yields nothing rather than a guess, and the step degrades to its plain title.
- `chat/parts/ActivityTrail.svelte` — collapsible run of reasoning + tool steps
  on a vertical rail; search steps show the query, `N results`, and a scrollable
  card of title/domain rows linking out; other steps show the one detail worth
  seeing (url/query/path from rawInput or locations); failures show their real
  error text; terminates with Done. Auto-expands while live and collapses when
  the run ends, unless the user takes over the toggle (matches ReasoningBlock).
- `MessageBubble` groups consecutive reasoning|tool parts into one trail in chat
  mode; assistant prose still breaks the run, so the answer never hides inside a
  collapsed block. `mode` threads chat page → MessageList → MessageBubble.

Verified in browser: collapsed summaries ("Read 2 files · Used a tool",
"Searched the web 2 times"), expanded rail with both searches and their result
lists, inner card scrolls at max-height, live streaming (steps appear as they
run, orb while active) then auto-collapse on completion, permission dialog
mid-run, light and dark, work mode still rendering per-call cards.
svelte-check 0 errors / 2476 files, vite build clean.

## 2026-07-31 — Browser pass done; two real bugs found and fixed

The browser pass the previous entry deferred. Both pending items are now closed
and every finding below was caught in the browser, not by the API matrix — the
matrix drives endpoints sequentially and structurally cannot hit either bug.

**BUG 1 (visuals, user-visible): inline charts never rendered.** The theme
bridge injected Kepler's raw oklch token values into the frame. Generated
visuals build translucent shades by concatenating a hex suffix
(`colSuccess + '33'`), which is valid for hex and throws
`SyntaxError: could not be parsed as a color` on oklch. The throw lands inside
Chart.js's scriptable `backgroundColor` during draw, so the chart silently
painted nothing while the surrounding tiles and sliders kept working — which is
exactly why it looked like a CDN/CSP problem. It is not: CSP, sandbox flags, and
insertion order were each cleared by a controlled 3-path harness, and the
downloaded claude.ai artifact uses hex exclusively (zero oklch), confirming the
format models assume. Fix: `InlineVisual.toHex()` flattens each token over the
app background to opaque sRGB hex via a 1x1 canvas, so gamut mapping and alpha
compositing are the browser's job; non-colors (`--radius`) pass through.
Verified in dark and light, sliders drive live chart updates.

**BUG 2 (every new OpenCode/Codex conversation): first turn failed with
"Conversation has no OpenCode session".** `ensureSession` deduped concurrent
establishment per conversation id, but the config route, commands route, and
turn runner each hold their own `ConversationRow` object. Only the winner's row
received the in-place session write; a follower awaited the shared promise and
then ran the turn against its own row, still null. On a new chat the config
route and the turn runner race by construction, so this reproduced on every
fresh conversation (2/2) and never once in the API matrix. Fix:
`createSessionEstablisher()` in engine/core/session-config-store.ts — followers
reload the session columns after awaiting. Codex had the identical pattern and
now shares the helper; Claude was never affected (it captures its session id
during the turn). Verified: fresh OpenCode conversations now stream normally.

Also fixed while sweeping: agent versions rendered as `vunknown` (Claude — the
SDK's `exports` map omits `./package.json`, so the require threw under Vite SSR
and the catch masked it; now read beside the resolved entry) and
`vcodex-cli 0.145.0` (Codex — `codex --version` prints the binary name; now
matched to the number). Settings shows `v1.18.10 | v0.3.220 | v0.145.0`.

**Verified in-browser:** InlineVisual renders (iframe `allow-scripts` only,
657px via the postMessage height bridge, theme-matched in both themes, sliders
recalculate tiles and redraw the chart); Chat|Work toggle with radio semantics;
message actions correctly split (Copy+Edit on user, Copy+Regenerate+Branch on
assistant); agent picker lists all three; **OpenCode work-mode permission
round-trip** (websearch is `ask` by default → dialog with tool input and
Allow/Always allow/Reject → Allow → Exa search ran → answer returned) — this was
the other pending item; agents settings page; Generated Files panel; zero
console errors throughout. svelte-check 0 errors / 2473 files, vite build clean.

Not a bug: a chat-mode `webfetch FAILED` card was the model calling webfetch
with `file:///dev/null`; OpenCode rejected it and the card showed the real
reason. Chat-mode tool envelope is correct — the model reported having only
skill/websearch/webfetch and no write tool.

**NEXT**
1. Remaining known gaps unchanged: project-scope MCP for opencode, codex has no
   slash commands, visuals quality on deepseek/gpt models unassessed.
2. Watch item unchanged: the single unreproduced claude/work branch-anchor flake.
3. Branch is ready to merge to main.
4. Unrelated: /tmp tmpfs is under quota pressure (7.7G, ~76% used); the bulk is
   another project's scratch dir, left untouched.

## 2026-07-31 — Native migration COMPLETE except final browser pass (superseded by entry above)

All three native drivers are LIVE, wired, and matrix-verified on branch
`sdk-engines` (pushed, head 8be2a7c). ACP is deleted; its state is preserved on
pushed branch `acp-engine`. Conversation modes are **chat | work** (renamed
from agent, migration 0007).

**Verified per engine** (matrix script /tmp/claude-1000/kepler-probe2/verify-matrix.sh,
usage: `verify-matrix.sh <agent> <mode> [model]`; needs dev server on :5199 and
the cookie file next to it — regenerate cookie from KEPLER_PASSCODE sha256 as
in src/lib/server/auth.ts):
- claude chat 7/7; claude work 6/7; codex chat+work 6/7 each; opencode chat 4/7,
  work 5/7. EVERY failure was re-tested in isolation and passed: cancel/reattach
  fails are the fixed-sleep race vs fast models (deepseek wrote the whole
  essay before the abort — 11k words in the sse capture), opencode branch flake
  passed manually, claude/work "BLUE, OWL" branch flake did NOT reproduce in two
  targeted repros incl. the exact double-rewind sequence — WATCH ITEM: if a
  branch ever ignores its anchor again, suspect resumeSessionAt across fork
  generations and re-anchor on the newest generation.
- Permission round-trips verified live: claude Write allow → file created;
  codex shell approval (accept/acceptForSession/decline) → file created.
- Edit/regenerate/branch verified with true truncation on all three engines
  (claude fork_pending deferred forks; codex thread/fork lastTurnId; opencode
  revert + fork+moveSession).

**Chat mode surface** (user-directed): websearch/webfetch + skills + MCP on
all engines; claude uses tools whitelist [WebSearch, WebFetch, Skill, Read] +
skills:'all' + settingSources ["project"] (project-level only — user-level
~/.claude config stays excluded, that leak is fixed); opencode chat agent
permission {"*":"deny", websearch/webfetch/skill allow} via
OPENCODE_CONFIG_CONTENT; codex chat = read-only sandbox + never-approve +
developerInstructions.

**Inline interactive visuals** (claude.ai-style, user showed the downloaded
artifact /home/aun/Downloads/solar_farm_4mw_feasibility_sabarkantha.html —
KEY INSIGHT: claude.ai emits HTML FRAGMENTS styled with host CSS variables
(--color-background-secondary etc.), vanilla JS + Chart.js from cdnjs):
- Shared prompt guidance engine/core/prompts.ts (VISUAL_FRAGMENT_GUIDANCE),
  composed into all three chat prompts.
- components/markdown/InlineVisual.svelte renders ```html blocks: sandboxed
  iframe (allow-scripts only), CSP allows inline JS/CSS + scripts from
  cdnjs/jsdelivr/unpkg, connect-src 'none'; theme bridge injects Kepler's
  computed CSS vars + claude.ai-alias names; postMessage auto-height
  (token-keyed); transparent background; hover-revealed code toggle;
  streaming guard = 400ms settle debounce.
- Generation verified over API (sonnet produced fragment-style calculator);
  **RENDERING NOT YET BROWSER-VERIFIED** — see next steps.

**NEXT STEPS (in order)**
1. Browser pass (agent-browser skill, dev server :5199, login with
   KEPLER_PASSCODE from .env): open conversation in
   /tmp/claude-1000/kepler-probe2/visual-conv.txt — verify InlineVisual renders
   (iframe present, height >200, theme-matched, slider interaction works);
   then general sweep: mode toggle on new-chat, message action buttons
   (edit pencil on user msgs, regenerate + branch on assistant msgs),
   permission dialog, agents settings page, console errors.
2. opencode agent-mode permission round-trip test (not yet exercised;
   permission.asked event path implemented by driver agent, smoke-tested).
3. Known gaps, decide or defer: project-scope MCP for opencode (config-content
   can't express it; note in connectors UI?); codex commands=false (no slash
   commands); visuals quality on deepseek/gpt models unassessed.
4. Consider merging sdk-engines → main after browser pass.

## 2026-07-31 — Native multi-SDK engine migration (superseded by entry above)

ACP proved to be a lowest-common-denominator: every feature lost in the ACP
migration (revert, edit, branch-at-message, MCP status, model catalogs) died at
the protocol boundary, not in the engines. Decision (user): drop ACP entirely,
integrate claude/codex/opencode through native SDKs behind an `EngineDriver`
interface, and give every conversation an immutable mode — **chat**
(conversational, web search/fetch only, custom prompt) or **agent** (full
coding agent). Plan at ~/.claude/plans/replicated-juggling-hollerith.md.

**ACP state preserved on branch `acp-engine` (pushed, commit 82aed6a).**

Progress:
- Phase 1 probes (all PASS, scripts in session scratchpad): claude-agent-sdk
  under Bun with `resume`+`forkSession`+`resumeSessionAt` fork-truncation, incl.
  cross-cwd after copying the transcript jsonl into the target cwd's
  `~/.claude/projects/<encoded-cwd>/` dir; `tools:["WebSearch","WebFetch"]`
  really strips Bash. codex app-server JSON-RPC (initialize → thread/start
  read-only/never → deltas → thread/fork lastTurnId → model/list; official TS
  bindings via `codex app-server generate-ts`). opencode `OPENCODE_CONFIG_CONTENT`
  chat agent (`permission:{"*":"deny",websearch/webfetch allow}` strips tools
  from the schema; custom `prompt` replaces the coding system prompt),
  fork(messageID) + revert truncation verified. opencode per-session SSE URL
  still unresolved (blocking prompt API works; driver agent investigating).
- Contracts are fully Kepler-owned (8 ACP type re-exports re-declared), DB:
  `acp_session_id`→`engine_session_id`, `conversation.mode`,
  `message.engine_message_id`, `conversation.fork_pending` (deferred claude
  forks ride the next prompt — probe-verified pattern), migrations 0004-0006.
- Engine layer: `engine/types.ts` (EngineDriver + TurnSink + rewindTo),
  `engine/core/` (stream-hub/requests/catalog/env-profiles/sandbox moved from
  acp/ + turn-runner extracted from pump.ts + session-config-store),
  `engine/registry.ts`. `src/lib/server/acp/` deleted, @agentclientprotocol
  deps removed.
- Claude driver (drivers/claude/) LIVE-VERIFIED end-to-end through the app:
  chat-mode turn with streamed reasoning/text deltas, per-turn cost/tokens,
  engineMessageId capture, resume continuity, branch-at-message (deferred fork
  consumed on first branch turn; truncation confirmed: branch knew GREEN not
  FOX), regenerate and edit endpoints (rewind = fork-truncate + resend;
  edit test: GREEN/OWL, FOX gone). Chat mode sets `settingSources: []` —
  without it the user-level CLAUDE.md leaked into chat conversations.
- Edit/regenerate: `server/rewind.ts` (shared rewind-for-resend), endpoints
  `POST /:id/messages/:messageId/{edit,regenerate}`, branch takes
  `{atMessageId?}`. Session modes (`PUT /:id/mode`) removed — conversation
  mode replaced them.
- UI: chat/agent segmented toggle in the composer (locked to agent when the
  engine lacks chatMode), MessageBubble actions restored with real semantics
  (Edit & rerun from here / Regenerate / Branch from here), gated on
  `SessionConfigDTO.capabilities` + per-message `engineMessageId`.
- Codex + OpenCode drivers being built by parallel subagents against the same
  interface (specs include probe results; they don't touch registry.ts — wire
  their factories into engine/registry.ts when they land).

Remaining: wire codex/opencode factories, full Phase 9 verification matrix
(per engine per mode: send/stream, edit, regenerate, branch, permissions,
cancel, reattach), browser pass, agent-mode claude spot-check.

## 2026-07-31 — Edit and "Ask again" removed (honesty follow-up)

The earlier honesty pass reframed Edit as "send a correction as a new turn" and
Regenerate as "Ask again". User called the Edit reframing out as still dishonest:
the in-place textarea over the original bubble (pencil icon, "Edit & resend"
tooltip, Send button) promises replacement semantics that ACP cannot deliver —
the text was appended as a new message and the original bubble reappeared
unchanged. "Ask again" was honestly named but functionally weak (the agent's
first answer stays in context, so it often just restates it). Decision: delete
both rather than rename.

Removed: editing state/UI and both hover buttons in MessageBubble; the
onEdit/onRegenerate props through MessageList; handleEdit/handleRegenerate in
chat/[id]/+page.svelte; `fileAttachmentInput` (its only caller was handleEdit)
and the `path` field on file PartView (existed solely so re-send could rebuild
attachments — pump, echo, and contract no longer write it; old persisted rows
carrying it are ignored harmlessly). Message actions are now Copy only.

Verified: svelte-check 0 errors, vite build clean.

## 2026-07-31 — ACP migration (in progress)

### Goal
Rewrite Kepler's engine layer from OpenCode-SDK-specific to a proper ACP client.
Agents become pluggable subprocesses speaking ACP v1 over stdio:
- `opencode acp` (existing engine, now one agent among several)
- `@agentclientprotocol/claude-agent-acp` (Claude Code via Agent SDK; subscription auth via `~/.claude/.credentials.json`)
- `codex-acp` (Codex CLI; ChatGPT auth via `~/.codex/auth.json`)

Breaking changes allowed, nothing in prod, no compatibility shims. Kepler DB becomes
the source of truth for conversations/messages/usage; model metadata comes from
models.dev `api.json` directly (same dataset OpenCode uses).

### Verified groundwork (probed live earlier this session)
- `opencode acp` (1.17.20): protocol v1, loadSession, session list/resume/fork/close,
  MCP http/sse, image+embeddedContext prompts. Auth method = "run `opencode auth login`".
- `claude-agent-acp` (0.64.0): protocol v1, list/resume/fork/close/delete, loadSession,
  providers cap (unstable), logout, prompt queueing + steering via _meta. Empty authMethods
  (uses whatever `~/.claude/.credentials.json` holds).
- `@agentclientprotocol/sdk` 1.3.0 cloned at references/typescript-sdk. Stable v1 has:
  session/list+load+resume+fork+delete+close, set_config_option, set_mode,
  usage_update (context used/size + cumulative Cost) as stable SessionUpdate variant,
  session_info_update (titles), available_commands_update. UNSTABLE (avoid): providers/*,
  per-turn token Usage detail, MCP-over-ACP, document sync, NES.
- models.dev `api.json`: full provider/model catalog (capabilities, limits, cost incl.
  cache pricing). OpenCode caches it at ~/.cache/opencode/models.json.

### Architecture decisions (draft, pending survey reports)
- One supervised subprocess per agent type, sessions multiplexed over one ACP
  connection (cwd is per-session at session/new). Respawn on crash; sessions
  reloaded lazily via session/load on next use.
- Keep the detached "generation pump" pattern from src/lib/server/messages.ts
  (server-owned prompt loop + replayable event log + SSE fan-out) but feed it from
  ACP `session.nextUpdate()` instead of OpenCode event.subscribe.
- Kepler-owned SSE contract (no more OpenCode Event passthrough): translate ACP
  SessionUpdate into our own wire events; persist messages/parts/usage to Kepler DB
  as they stream. FTS over Kepler tables replaces opencode-db reads.
- Permissions: ACP requestPermission is a *server-answered request* → pending-request
  broker per conversation, surfaced over SSE, answered via POST, promise resolved.
- Client capabilities: decline fs + terminal in v1 (agents use their own tools;
  web chat has no editor buffers). Revisit later.
- Agent env injection: keep encrypted env-profile system, generalized per agent
  (OpenCode keeps OpenRouter/API keys via env; claude/codex auth via their own CLI files).

### Survey answers (3 subagent reports, condensed copies in session scratchpad)
1. usage_update: yes on all three. opencode emits it only at end-of-prompt (+after load/fork/resume),
   cost = cumulative session USD; codex only when totalTokens+contextWindow known; claude streams it.
   Per-turn token detail rides on PromptResponse.usage (UNSTABLE, claude+codex provide).
2. Model selection = `session/set_config_option` with configId "model" on ALL agents (category
   "model"); modes are permission/sandbox presets. opencode never pushes config_option_update —
   refresh from the setSessionConfigOption response.
3. session/load replays history as session/update notifications BEFORE the response resolves
   (all agents; opencode also replays on fork; resume never replays). Kepler still owns
   persistence — replay is only a recovery path.
4. sandbox.ts = @anthropic-ai/sandbox-runtime (bwrap): allowWrite=[sessionsRoot] only. Must be
   generalized: per-agent writable paths (claude needs ~/.claude, codex ~/.codex, opencode its
   real XDG dirs — see auth decision below).
5. Skills: opencode reads .opencode/skills up-walk; claude .claude/skills. Decision below.
6. codex-acp = @agentclientprotocol/codex-acp (TypeScript, npm, bin codex-acp), spawns a codex
   app-server child (CODEX_PATH); child death surfaces as RequestError code 1001.

### Final design (locked)

**Engine (`src/lib/server/acp/`)**
- `registry.ts` — static defs for opencode/claude/codex: spawn command, env builder
  (agent env profiles + per-agent extras like OPENCODE_PERMISSION), sandbox writable paths.
- `connection.ts` — one supervised subprocess per agent id, lazy start. SDK long-lived form:
  `client({name:"kepler"}).onRequest(...).onNotification(...).connect(ndJsonStream(stdin, stdout))`.
  NOT ActiveSession/connectWith (no cancel/setConfig; closes eagerly). initialize handshake caches
  capabilities. Respawn with backoff; stdin close = clean shutdown. Update router: sessionId →
  subscriber, registered BEFORE session/new/load (replay precedes responses).
- `sessions.ts` — conversation.acp_session_id binding; ensureSession(conv): new (cwd=convRoot,
  mcpServers resolved per scope) / resume-or-load after agent restart. Keep session/new params
  byte-stable (claude fingerprint teardown). MCP list resent on every load/resume (codex drops it).
- `pump.ts` — the generation pump (pattern kept from old messages.ts): persist user message →
  prompt → consume updates → persist parts incrementally → broadcast Kepler SSE envelopes from a
  replayable log; serialize prompts per conversation; cancellation tracked locally (opencode always
  reports end_turn). Turn end: finalize assistant row (stop_reason, cost delta from usage_update,
  tokens from PromptResponse.usage when present), title fallback (session_info_update if emitted,
  else session/list lookup, else first-user-text truncation).
- `permissions.ts` (broker) — session/request_permission → pending request (Kepler id), SSE
  broadcast, POST reply resolves promise with chosen optionId; respond {outcome:"cancelled"} on
  turn cancel/disconnect. optionIds are agent-specific: UI renders options[] verbatim, keyed by kind.
- `fs-handlers.ts` — implement fs/read_text_file + fs/write_text_file against conversation root
  (files.ts safety); REQUIRED: opencode "always allow" edit flow calls client writeTextFile.
  Advertise fs both; decline terminal (bash renders as text content). elicitation/create supported
  (claude AskUserQuestion) → question-style dialog; declare clientCapabilities.elicitation.form.
- `catalog.ts` — models.dev api.json fetch + disk cache (enrichment: context limits, pricing,
  capability badges keyed by provider/model parsed from config option values).

**Auth stance**: each agent uses its own CLI credential store out-of-band (claude ~/.claude via
ai-sub-checker swaps, codex ~/.codex, opencode real XDG dirs — no more XDG redirect; `opencode
auth login` in a terminal is the auth flow). Kepler keeps encrypted env profiles per agent
(renamed agent_env_profile) injected at spawn (OpenRouter keys etc.). Provider OAuth proxy UI is
deleted (was OpenCode-server-specific; conflicts with subscription ToS anyway for claude).

**DB (fresh baseline migration, breaking)**
- conversation: id, agent_id, acp_session_id?, project_id?, title, model_value?, mode_id?,
  context_used?, context_size?, total_cost, created/updated.
- message: id, conversation_id FK, role, created/completed, stop_reason?, error?, model_value?,
  cost (turn delta), tokens JSON?, context_used/size snapshot.
- part: id, message_id FK, conversation_id, ord, type (text|reasoning|tool|file), content JSON,
  text (extracted, FTS5 external-content index + triggers).
- project, media unchanged; provider_env_profile → agent_env_profile (agent_id, env_key, encrypted).
- Usage dashboards + search aggregate Kepler tables; opencode-db.ts deleted.

**MCP/skills/instructions (engine-agnostic)**
- MCP servers: Kepler DB table (scope global/project), passed as mcpServers at session
  new/load/resume. OAuth-brokered connectors are a protocol gap in ACP — connectors UI reduces to
  url+headers (documented limitation).
- Skills: Kepler store at sessionsRoot/skills + projectRoot/skills; per-conversation symlinks
  materialized at provision into <convRoot>/.opencode/skills and .claude/skills (project shadows
  global); resynced on skill CRUD.
- Instructions: global + project text concatenated with base conventions into <convRoot>/AGENTS.md
  (+ CLAUDE.md symlink) at provision; resynced on edits.

**Wire contract (Kepler-owned SSE, replaces OpenCode Event passthrough)**
message (full MessageView upsert) | part (PartView upsert @ index) | delta {messageId, partId,
text} | plan | usage {used,size,cost} | title | commands | config {configOptions, modes} |
permission.asked | permission.settled | turn.end {stopReason, message} | error. Client reducer +
PartView reshaped to ACP (tool part = toolCallId/kind/status/content incl. diff, locations,
rawInput/rawOutput).

**UI**
- New-chat agent picker (opencode/claude/codex + auth status); per-conversation model/mode/config
  selectors driven by configOptions (models.dev enrichment where value parses provider/model).
- RequestDialog: permission branch renders ACP options[]; question branch becomes elicitation form.
- ToolCallCard: ACP statuses + diff/terminal-text content. Usage meter from usage events.
- Settings: providers page → agents page (status, env profiles, how-to-login instructions);
  usage page unchanged shape, fed from Kepler tables.

### Status: complete and verified end to end

**Verified against live agents** (dev server + real browser, not code reading):
- opencode: prompt → streaming deltas → reasoning + text parts → usage → persistence.
- claude (subscription via `~/.claude/.credentials.json`): full turn, streamed usage,
  cost 0.19961, cache token accounting, auto-title.
- codex: reached the agent and returned its real auth error (refresh token revoked) —
  error propagated cleanly through pump → SSE → persisted assistant row. Run `codex login`.
- Permission round trip (both agents): request.asked → GET /requests → POST reply →
  promise resolved → tool executed → output persisted. Agent-specific optionIds
  (`once/always/reject` on opencode, `allow/allow_always/reject` on claude) render verbatim.
- Reattach: /live returns 200 with a growing replay log mid-generation (2→3→8 events),
  204 when idle. Cancel: stopReason=cancelled; a turn cancelled before any output leaves
  no orphan assistant row.
- models.dev enrichment: 806 opencode model values, 192 enriched with context limits + pricing.
- Kepler-owned FTS search and usage aggregation across all three agents.
- Browser: agent picker, streaming render, config bar (mode/model/effort/agent), context
  meter, auto-title, agents settings page, usage page, customize pages.

**Bugs found and fixed during verification** (each was a real defect, not a test artifact):
1. New-chat flow never navigated: `chat.send`'s `invalidateAll()` cancelled the pending
   `goto`. Fixed by navigating first, then streaming (the store is keyed by conversation id,
   so the mounted page renders the run that starts right after).
2. Tool calls left `pending` forever when a turn ended early — finalize now marks
   non-terminal tool parts `failed` on any non-`end_turn` stop.
3. Agent-facing plumbing (AGENTS.md, CLAUDE.md, .opencode/, .claude/) leaked into the
   user-visible Generated Files panel; now excluded via RUNTIME_ENTRIES in routes/files.ts.
4. Settings agents page never rendered: the module-singleton store's state did not reach
   that component (two store instances observed; double fetch per load). Fixed by giving
   the page a `+page.server.ts` load — the app's own convention for settings pages, SSR-
   rendered, with `invalidateAll()` after mutations. `agentCatalog` remains for the composer
   picker, where it is verified working.

### Feature parity vs the pre-migration app (audited, not assumed)

Full audit compared every pre-migration endpoint/UI action against the new tree.

**Lost with no ACP equivalent — must not be faked:**
- `session.revert` (revert-to-message). ACP has no history truncation. This silently broke
  edit / regenerate / delete-message: they now only delete Kepler DB rows while the agent
  keeps the original turn *and its reply* in its own transcript. The buttons look unchanged
  but no longer do what they claim. Pending decision: implement properly if ACP v2 offers a
  mechanism, otherwise remove/reframe the affordances. Do NOT ship the current state.
- Branch-at-a-specific-message: ACP `session/fork` takes no message id, so every branch is a
  tip branch. `MessageBubble` still shows Branch per message and `handleBranch` discards the
  argument — same honesty problem, same pending decision.
- MCP connection status + OAuth connect/disconnect: no ACP status probe. Connectors now take
  a static header; the user cannot see whether a server connected or why it failed.
- Provider OAuth flows, typed env-schema, credential-file upload: replaced by per-agent env
  vars + out-of-band CLI login. Deliberate (was OpenCode-server-specific; Claude's
  subscription is only usable through its own CLI).
- Auto-compaction toggle: was an OpenCode config flag; agents own this now.

**Restored after the audit:** agent-advertised slash commands (restores manual compaction
generically via `/compact`), model favorites, per-agent last-model memory, session-mode
selector (API+engine existed but nothing rendered it), attachment/model compat warning
(reduced to models.dev's `attachment` flag), MCP per-server timeout, compose-time model
selection (`GET /api/agents/:id/config` starts the agent once and caches its advertised
options; the choice rides on `POST /api/conversations` as `modelValue` and is applied by the
existing `reapplyStoredConfig` when the session is established).

**Slash-command coverage is uneven and that is the agents' doing, not ours:** claude
advertises 47 commands (incl. `compact`), codex 16 (incl. `compact`), opencode 1.17.20 only 5
and **no `/compact`**. That gap is version-specific: opencode 1.18.10 implements `compact` in
its ACP layer (`packages/opencode/src/acp/service.ts:549`), so upgrading the binary restores it
with no Kepler change — the composer renders whatever the agent advertises. The reference clone
was refreshed 1.14.28 → 1.18.10 (ACP SDK 0.16.1 → 0.21.0; the old copy predated the current ACP
module layout entirely).

### ACP v2 investigated — it rescues nothing (schema-level audit, citations in session notes)
- No history truncation/revert in v1 or v2. `replayFrom` has one variant (`"start"`), is
  read-only, and changes what the agent re-emits, not what it keeps in context.
- `session/fork` still takes no message id in v2 (the RFD calls it a future extension).
- No compaction method; slash commands remain the only route.
- MCP: the word "oauth" appears nowhere in either schema, and there is no connection-state
  field. MCP-over-ACP would give status but inverts the transport (Kepler would have to *be*
  the MCP server), is UNSTABLE, and every adapter advertises `acp: false` or omits it.
- `providers/*` is still UNSTABLE and is a single gateway override per agent
  (`main` / `custom-gateway` / none), not a provider catalog.
- v2 is unusable regardless: all three adapters hardcode `protocolVersion: 1`, the SDK has no
  client-side version negotiation, and v2 *removes* `fs/*`, `terminal/*`, `session/load` and
  `session/set_mode` — several of which Kepler depends on.
- Caveat on our own code: per-turn tokens come from `PromptResponse.usage`, which is UNSTABLE
  in v1 and deleted in v2. It is real data today on claude/codex and absent elsewhere; the
  context meter already relies on the stable `usage_update` instead.

### Honesty pass applied (no affordance may promise what ACP cannot do)
- **Delete message: removed.** Kepler cannot delete from the agent's transcript.
- **Edit** now sends a correction as a new turn and leaves the original visible, because it is
  still in the agent's context. **Regenerate → "Ask again"**, same reasoning.
- **Branch** moved from a per-message menu item (whose message argument was discarded) to a
  conversation-level action in the chat header, shown only when the agent advertises
  `sessionCapabilities.fork`. `branchConversation` no longer silently falls back to a
  memoryless copy — it fails with a clear error instead.
- **Connectors page** states plainly that ACP reports no MCP connection result.
- **Per-agent capabilities drive behaviour, not copy.** `GET /api/agents` reports what each
  agent advertised at initialize; the app acts on it (Branch is offered only where the agent
  supports fork — verified: codex reports `fork: false`, opencode and claude true). The
  capability chips that briefly rendered on the agents page were removed: protocol internals
  are not user-facing, and honesty belongs in what the UI offers, not in explanatory text.
- The composer only shows controls the agent actually advertises: no model option → no model
  picker; `modes: null` (opencode) → no mode picker; commands list is whatever the agent sends.

### Quality pass (subagent review, 47 findings; MUST FIX and most SHOULD FIX applied)
Fixed: dead exports and the dead `$lib/types.ts` (DTOs consolidated in `contracts.ts`);
`Generation.done` (unreachable); MCP edit silently re-enabling a disabled server; two
incompatible "is this the model option" predicates unified as `isModelOption`; MCP `timeout`
removed entirely (it was plumbed through eight sites and never reached ACP — a fake feature);
dead `DELETE /:id/messages/:messageID` removed; `forkSession` was handed a cwd before the
directory existed; colliding `{#each}` keys (duplicate keys are a Svelte runtime error);
`stopAllAgents()` instead of hardcoding opencode in the permissions route; shared `request()`
helper replacing fivefold fetch boilerplate; store load-guards unified on plain latches;
`updateCachedConfig` now writes one object to both maps (they held distinct copies);
`perTurnDelta` shared by token and cost accounting; `downloadFileUrl` shared with the pump;
search moved out of `usage.ts`; SQL-side filtering instead of JS `.filter()`; enum-typed
`agent_id`/`stop_reason` columns removing nine casts; dead columns dropped (migration 0002).
Also fixed a real UX bug it surfaced: the context meter read 0% after reload because persisted
usage was never surfaced — `GET /:id/config` now returns it and the store seeds from it.

**Also noted:** existing installs lose history — the migration folder was re-baselined and
there is no import path from OpenCode's DB. Old DB backed up at ../../local.db.pre-acp.bak.

### E2E verification pass (subagent drove the running app; 30+ checks)
Passing: streaming on all three agents (codex authenticated fine on this machine after all),
persistence, auto-title, reasoning parts, reattach (200 + full replay mid-run, 204 idle),
cancel, permission round trips with each agent's own option ids, slash commands, config/model
switching, files/media/projects/skills/MCP/instructions, search, usage, and 11 pages with zero
console errors. Message actions confirmed honest: no Delete, no per-message Branch, header
Branch present for opencode/claude and absent for codex, Edit and "Ask again" append new turns.

**CRITICAL bug it caught and I fixed — the first message of every conversation was dropped.**
`ensureSession` had no in-flight dedup, and the chat page fires `/config`, `/commands` and
`/files/output` concurrently with the first `chat.send`. Two callers raced past the
`acp_session_id === null` check, both ran `session/new`, and the second `bind()` unbound the
session actually being prompted, so every update for it was discarded — the turn then reported
`stopReason: "end_turn"` with no message, i.e. silent success with no reply. 5/5 browser sends
failed before. Fixed two ways: `ensureSession` now shares one in-flight attempt per
conversation, and a caller holding a stale row (`acp_session_id: null`) adopts the live binding
instead of creating a second session. Verified: 3/3 racing runs now reply, plus the exact
curl repro from the report on opencode and claude.

Also fixed from that pass: claude model metadata never enriched (its values are aliases like
`opus[1m]`/`sonnet`; `parseModelValue` now strips `[…]`/`:` markers, a family index resolves
aliases to that family's newest model, and an `[1m]` marker overrides the context limit since
that is exactly what it means) — 4/5 enrich now, `default` correctly stays bare, and
opencode 793/806 and codex 5/5 are unregressed; context meter blank on cold load (server now
returns persisted usage and the store seeds from it — verified 14% ctx on reload); model picker
unusable at 1280×577 because a hardcoded `max-h` overrode bits-ui's collision-aware height
(search input was at -55px, now +13px and on-screen) and the cap footer now reads
"Showing N of M"; codex mode desync where `PUT /:id/mode` left the duplicate `mode` config
option stale; the agent picker's "Running" dot was a snapshot that went stale, so it now shows
only the stable availability state (liveness lives on Settings → Agents).

Known, not fixed (cosmetic): composer config pickers pop in ~1s after mount; a send attempted
in that window is refused but the draft is restored, so nothing is lost.

### Corrections to earlier "necessary loss" claims (user pushed back; they were right)
- **Provider env-key setup was NOT a necessary loss.** models.dev carries the env var list for
  all 175 providers — the same data the old provider page was built on (OpenCode merely passed
  it through). Restored as `GET /api/agents/env-vars` feeding a `<datalist>` on the key input,
  so you pick `ANTHROPIC_API_KEY` from the catalog instead of recalling it. Deliberately not a
  175-row provider table: the value was never the list, it was not having to know the name.
- **Per-model modality granularity was NOT a necessary loss.** `ModelInfo` had flattened
  everything to one `attachment` boolean. It now carries `input`/`output` modality arrays plus
  `toolCall`, and the picker shows the pre-migration badge set (Vision / Audio / PDF / Video /
  Image generation / Reasoning / Tool calling). Verified: 97 video-input, 32 audio-input and
  12 image-output models are now distinguished, and Gemini 2.5 Pro renders all six badges.
  The composer's compatibility warning is per-modality again ("may not accept video, audio")
  instead of a single all-or-nothing attachment check.

**Genuinely lost, no data or protocol to rebuild from:** in-app provider OAuth flows;
per-provider connected/configured status; MCP connection status and OAuth; revert-to-message;
branch-at-a-message; delete-message; auto-compact toggle; `/compact` for opencode specifically
(it advertises no built-in commands over ACP); pre-migration conversation history.

### opencode upgraded 1.17.20 → 1.18.10; session config generalized
- Upgraded via `opencode upgrade` (stock, no local changes). Reference clone refreshed to the
  matching v1.18.10 tag, clean checkout — the previous clone's local edits are in `stash@{0}`.
- Re-verified commands: still **5** and still no advertised `compact`. Those five are the user's
  own custom commands; opencode advertises no built-ins over ACP at any version tested.
  BUT it *implements* compact (`acp/service.ts:549` → `session.summarize`) and accepts
  `/compact` when sent — verified live, turn completed cleanly. So the composer now always
  offers Compact: claude and codex advertise it, opencode honours it unadvertised, and an agent
  that genuinely lacks it surfaces a normal error rather than a hidden no-op.
- **Reasoning effort was missing at compose time.** It exists — claude `effort` (thought_level,
  6 values), codex `reasoning_effort` (5 values); opencode advertises none at all. It rendered
  on conversation pages but the new-chat composer was filtered to the model option only.
  Generalized: `conversation.config_options` (JSON) stores every chosen option, the composer
  offers all of them before the session exists, and `reapplyStoredConfig` reapplies the whole
  map whenever a session is (re-)established rather than special-casing model and mode.
  Verified: picking Low effort on a new claude chat persisted `{"effort":"low"}` and the live
  session reported `effort -> low`. `model_value` remains as the analytics column.
- Hardened while checking isolation: the capability probe used to open a session with
  `cwd = sessionsRoot`, sitting above every conversation; it now uses `.probe/<agent>/`.

### Composer controls consolidated (user-directed, modelled on claude.ai)
Problem 1: reasoning effort showed in a chat but not in the new-chat composer. Root cause was
not "opencode has no effort" — **opencode's option set depends on the selected model**.
`opencode/big-pickle` (the agent default) advertises model+mode; `opencode/deepseek-v4-flash-free`
advertises model+**effort**+mode. The compose page cached the default model's options and never
refetched. Fixed: `GET /api/agents/:id/config?model=` applies the model to the probe session and
caches per (agent, model); the composer refetches whenever the chosen model changes.

Problem 2: five sibling dropdowns crowded the composer. Replaced by `SessionConfigMenu`: one
trigger reading `<model> · <effort>`, opening the searchable model list (favorites, capability
badges, context) with the remaining options pinned as footer rows that drill into their own
panel with a back header. Every option stays reachable for every agent; only reasoning effort
rides in the trigger, since showing all of them recreated the wall of values.
`select-content.svelte` gained a `footer` snippet so those rows sit outside the scrolling
viewport. `ConfigOptionPicker` is superseded and deleted.
Verified live: opencode → `Model · build` + "Session Mode" row; claude → `Fable · Xhigh` +
Mode/Effort/Agent rows; drill-in shows values with descriptions and the current check.

**Handoff notes**
- `vite preview` is NOT a valid harness for this app: adapter-auto finds no production
  environment and emits a relative-base build, so nested routes break there. Test with `bun dev`.
- Editing server modules mid-run reloads the SSR module graph and orphans in-flight
  generations; restart the dev server before verifying a streaming change.
- Old DB backed up at ../../local.db.pre-acp.bak; new baseline migration + FTS triggers applied.
- Codex needs `codex login` before it will answer.

## 2026-07-30 night session: stream reattach + palette full-text search

Two features, both browser-verified end to end (send → hard reload mid-generation →
reloaded page shows Stop button and finishes the stream; Ctrl+K "lighthouse" → Message
entries with snippets → Enter navigates).

- **Stream reattach**: generations used to be lost to the tab that started them; the
  prompt keeps running in OpenCode but nothing re-streamed it after a reload.
  Server (`server/messages.ts`): `activeGenerations` map keyed by conversation id —
  the prompt promise resolves when OpenCode finishes even if the requesting client
  disconnected, so it stays accurate; shared `titleSync`/`forwardSessionEvents`
  extracted from `sendMessageStream`; new `attachMessageStream` behind
  `GET /:id/messages/live` (204 when idle; subscription also ends when the tracked
  generation settles, covering prompts that fail without a terminal event).
  Client: `chat.attach()` reuses the same reducer with `input: null` (no user echo —
  persisted messages already have it); chat page auto-attaches on conversation mount
  (untracked `isStreamingFor` read so stream completions don't re-probe); the
  persisted/streaming merge now lets streaming copies win so a reattached stream
  updates the partially-persisted assistant message in place.
- **Palette search**: CommandPalette now debounces (200ms, min 2 chars) into the
  existing `/api/search` and appends up to 6 Message entries (title + snippet) after
  the nav/title matches.

Crash fix (user hit on refresh): client disconnect reaches the SSE stream twice — the
request signal aborts AND the runtime cancels the ReadableStream, closing the controller
itself — so `controller.close()` in the abort handler threw ERR_INVALID_STATE and killed
the dev server. Latent since before the refactor; reattach made mid-run refreshes routine.
Fixed in `sseStreamResponse` (now the shared scaffolding for send + attach): a `cancel()`
hook marks the stream closed, and close/enqueue are gated on `controller.desiredSize`.
Verified: three consecutive mid-generation refreshes, all reattached, server alive, no
ERR_INVALID_STATE in the log.

Handoff: reattach state is in-memory — a Kepler server restart forgets in-flight
generations (OpenCode finishes them; the result appears on next load).

Later same night: user confirmed reattach working; all test files, vitest.config.ts, and
the vitest dep were removed on user request (no test suite in this repo anymore).

Reattach rewrite (user report: after reload only newly-streamed text showed; old
content and pending tool calls vanished until the run finished). Root cause proven via
raw /live dump: OpenCode's message store flushes part text only at part boundaries, so
an in-flight part reads `text: ""` from `session.messages` — no snapshot can recover
already-streamed text; it exists only on the delta stream, which died with the original
request. Fix: the event pump is now owned by the server-side generation, not the HTTP
request. `startGeneration` (in server/messages.ts) subscribes, prompts, persists titles,
and appends every forwarded envelope to a per-generation event log; `sendMessageStream`
and `attachMessageStream` are both `subscribeGeneration` consumers that replay the log
(replay + listener registration is synchronous — no gap) and then follow live. A second
concurrent send now 409s. Verified: /live 8s into a run replayed all 166 deltas from
token one; browser reload during a PENDING `write` tool kept the tool card + prior
content visible within 1.5s, and the run completed (tool COMPLETED) on the reloaded page.

Fixed every finding from the evening review. Verified: svelte-check 0 errors, 30 vitest
tests pass (10 new reducer tests), production build clean, `drizzle-kit push` applied,
and a full browser walkthrough (login, all pages, model picker, send/stream, error+retry,
draft restore). WHY per change is in the review entry below; WHAT changed:

- **Server services**: new `server/providers.ts` (catalog cache typed via SDK
  `ProviderListResponse`, requireProvider uses cache, one credential path) and
  `server/messages.ts` (model validation + SSE streaming; shared by messages/models
  routes — models PUT now also enforces the `connected` check). Routes are thin.
- **Deleted dead code**: `/api/auth` route (login/logout are SvelteKit actions; also
  removed createAuthCookie/clearAuthCookie + hooks exemption), `providerCredential` +
  `conversationMessageModel` tables (dropped via db push; mirror flow removed),
  `provider-models.ts`, schema barrel (client.ts imports `./schema/opencode`),
  dead contracts/types exports (zod dep now unused by contracts), `@tanstack/svelte-form`,
  dead props (onCopy/projects/paused), DropdownMenu.Label, Select.Value, checkbox class.
- **Crypto**: `opencode/provider-env.ts` now uses `crypto.ts` (single AES-GCM impl,
  single key fn) and owns `isFilePathEnvKey`/`isSecretLikeEnvKey`/`decryptEnvProfileValue`.
- **Errors**: everything throws `HttpError` (requireAuth → 401; app.ts no longer
  string-matches); `isEnoent`/`readFileOrEmpty` helpers in files.ts.
- **Contracts**: usage/search/permissions shapes + `PERMISSION_TOOLS` +
  `INSTRUCTIONS_MAX_LENGTH` live in contracts.ts; client provider types are SDK
  re-exports (`Model as ProviderModel`); SSE contract narrowed to consumed events
  (session.error now surfaces via `chat.setError`); requests route returns
  `PendingRequestDTO[]`.
- **Client state**: pure reducer `state/stream.ts` (+ tests in stream.test.ts; the
  misnamed chat.svelte.test.ts is now messages.test.ts), notification side effect in
  `notifications.ts`, shared `state/attachments.ts` uploadAttachments, providers store
  surfaces load errors + safe localStorage reads + `loadDefault()` used by all 3 pages.
- **Components**: shared `components/manager/` (list shell, form dialog, confirm-delete
  dialog, `createManagerState`) backing SkillManager + McpServerManager (Mcp uses
  ui/Toggle now); `ModelPicker.svelte` + pure `model-options.ts` extracted from
  MessageInput (724→~430 lines; single 240px textarea cap, chip snippet, setDraft);
  ui/Badge added; MessageList O(1) autoscroll + ScrollArea onViewportScroll;
  ConversationSidebar deletes via API client (hidden form + `?/delete` action removed);
  FilePanel empty state; OutputFilesSidebar awaits refresh.
- **Silent failures fixed**: media upload/delete errors, sidebar layout load throws 500,
  auto-compact load/save errors with retry, `formatSize` in utils.
- Load-strategy split kept deliberately: settings/providers needs +page.server.ts for
  form actions; other settings pages client-fetch with the same API client they mutate
  through.

Handoff: `.env` DATABASE_URL resolves to `../../local.db` (repo-root local.db is stale,
April). zhipuai GLM sends were failing upstream during verification ("Failed to send
prompt" — error+retry UI confirmed working); streaming happy path verified with
opencode/DeepSeek free.

## 2026-07-30 evening session: lean-codebase review (no code changes)

Full-code review for separation of concerns, duplication, verbosity, hacks, dead code.
Four parallel review agents (server, client lib/state, components, routes+cross-cutting);
all findings verified with greps before reporting. Overall verdict: disciplined codebase
(no TODO debris, no debug logs, no timing hacks), but lean-ness debt is concentrated in
a few god files and client/server duplication. Top items for a fix session:

1. `routes/providers.ts` (685 lines) is the only domain without a service layer — DB,
   crypto, caching, fs all inline in handlers. Extract a providers service.
2. Secret/crypto logic triplicated: `opencode/provider-env.ts` reimplements
   `getCredentialKey` + AES-GCM decrypt from `crypto.ts` and duplicates
   `isFilePathEnvKey` from providers.ts verbatim. Drift here is a security bug vector.
3. `routes/messages.ts` POST is a ~240-line handler; model-validation+persist logic also
   duplicated with `routes/models.ts` (already diverged on the `connected` check).
4. `SkillManager.svelte` / `McpServerManager.svelte` are the same CRUD-manager component
   written twice. Extract shared list-shell + dialogs + state machine.
5. `MessageInput.svelte` (724 lines): model picker (~300 lines) should be its own component.
6. `chat.svelte.ts` `send()` inlines a 190-line SSE reducer (untestable);
   `chat.svelte.test.ts` actually tests `messages.ts` — streaming path has zero tests.
7. Client/server type drift: hand-written types in `types.ts` + `as` casts defeat Eden
   treaty inference (providers settings shapes already diverged); permissions page
   `as never`; usage/search pages re-declare response shapes locally.
8. Attachment-upload loop copy-pasted between `state/start-chat.ts` and
   `chat/[id]/+page.svelte` (error handling already diverged).
9. Dead: `conversationMessageModel` table (write-only), `mirroredCredentials` flow,
   several `contracts.ts` exports (keeping zod alive), `@tanstack/svelte-form` dep,
   db schema barrel, dead props (`onCopy`, `projects`, `paused`).

Full ranked findings were reported in-chat this session; smaller items include an
`isEnoent` helper (9 sites), `resolveScope` dup (mcp/skills routes), `formatSize` dup,
non-timing-safe passcode compare in `routes/auth.ts:22`, and silent-failure paths
(media upload loop, providers catalog load, sidebar layout load).

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

### Honest compaction + settings consolidation

- Removed the Kepler-side percentage auto-compact (user: presenting a client-side threshold
  as a compaction control was misleading). What remains is real: the Auto-compact toggle is
  now server-authoritative (GET /api/compaction on mount, PUT writes compaction.auto to
  global opencode.json + restarts; optimistic flip reverts on error). The pct keys are gone
  from the settings store.
- Sidebar footer: theme toggle + sign-out removed; single full-width "Settings" nav row
  (also pinned at the bottom of the collapsed rail). Theme lives in Settings → Appearance;
  sign out is a new Settings → Account row (same /chat?/logout action). ThemeToggle.svelte
  deleted (orphaned); palette/footer links point at /settings/general.

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

## 2026-07-31 — ACP migration: server routes rewrite (routes agent)

Executed scratchpad routes-spec.md. Server-side only; client rewrite runs in parallel.

- Rewrote routes: conversations (agentId on create, bodyless branch, dropped
  compact/revert/model endpoints), messages (Kepler DB listMessages → {messages},
  pump sendMessageStream/attachMessageStream/cancelGeneration, deleteMessage 404),
  requests (ACP broker: /requests, /:requestId/permission {optionId},
  /:requestId/elicitation {action, content?}), usage (buildUsageResponse), search
  (searchMessageText over Kepler FTS, same snippet/dedupe/cap-20), mcp (new
  name+projectId signatures, oauth endpoints deleted), skills/instructions/projects
  (runtime.ts read/write*Instructions), permissions (hostFor("opencode").stop()).
- New routes: config.ts (GET/PUT /:id/config + PUT /:id/mode, model select options
  flattened incl. groups, enriched via findModelInfo, cap 200), agents.ts (list
  statuses, env set/delete + restart via hostFor().stop()).
- Deleted: routes/{providers,models,compaction}.ts, src/lib/server/opencode/.
- app.ts remounted (agents+config in, providers/models/compaction out); hooks.server.ts
  boot block now only wires SIGINT/SIGTERM → stopAllAgents().
- Service fixes (compile blockers, not spec drift): media.ts imported deleted
  schema/opencode → schema/kepler; engine.ts elicitation narrowing (custom-mode union
  member's index signature) + setConfigOption union params broke request() inference
  (split per branch); pump.ts lastUsage boxed (closure-write narrowing), model option
  currentValue narrowed to select; connection.ts stdout toWeb cast via unknown.
- Verified: `bun x tsc --noEmit -p .` has zero errors under src/lib/server/** and
  src/hooks.server.ts; remaining errors are all in client files owned by the parallel agent.

## 2026-07-31 — agent slash commands (restores compaction)

ACP has no compaction method, but every agent advertises its own slash commands via
`available_commands_update`. Surfacing those restores `/compact` generically instead of
special-casing it (the old OpenCode `session.summarize` endpoint is gone).

- Contract: `AgentCommand {name, description?, hint?}` (hint = SDK
  `AvailableCommandInput.hint`), new `commands` stream event.
- Engine: `SessionBinding.commands` + `sessionCommandsFor` / `awaitSessionCommands` /
  `updateCachedCommands`.
  The cache is written in the update **delegate**, not the pump: agents push commands on
  a `setTimeout(0)` after session/new and session/load, i.e. usually with no generation
  running and therefore no pump subscriber. For the same reason session/new now binds
  before the DB write — the push used to race an unbound session and be dropped.
- Pump: `available_commands_update` rebroadcasts the cached list; `sendCommandStream`
  is `sendMessageStream` with text `/name args` (all three agents interpret a leading
  slash command themselves), so commands share the whole turn path.
- Routes: `GET|POST /api/conversations/:id/commands` (commands.ts).
- Client: `chat.commandsFor/setCommands/loadCommands/runCommand`; `send` and `runCommand`
  now share `startTurn` (echo + SSE consumption differ only by endpoint/body).
  The composer's ctx badge became the commands dropdown again (token line + separator +
  items, `/name hint` + description, shimmer while a command turn runs); it renders as
  `/` before any usage_update has landed. Chat page loads commands after the config load.

Verified live (dev server on :5199, curl, real agents):
- claude advertises 47 commands incl. `compact` (hint `<optional custom summarization
  instructions>`), `context`, `model`, `rename`, `usage`, `review`.
- codex advertises 16 incl. `compact`, `plan`, `status`, `review-branch`, `$skill-creator`.
- opencode advertises only its skills/custom commands (agent-browser, customize-opencode,
  init, read-mail, review) — **no `/compact`**: opencode does not advertise built-ins over
  ACP, so compaction is reachable on claude/codex only.
- `POST /commands {name:"context"}` → user row `/context`, streamed reply, end_turn.
  `POST /commands {name:"compact"}` → "Compacting completed." after a real exchange
  (and "Not enough messages to compact." before one). Args round-trip (`/compact one sentence`).
- Bug found in the browser (composer had no commands button): the first `GET /commands`
  raced the push — whichever request establishes the session returns before the agent
  sends the list (measured: it lands 8-70ms later on all three agents). Fixed with
  `awaitSessionCommands`: an empty read waits on a waiter set that `updateCachedCommands`
  resolves, capped at 500ms. First GET now returns 16 (codex) / 5 (opencode) immediately.
- Browser: codex conversation → dropdown lists its commands with hints and descriptions;
  clicking `/status` sent the turn and rendered codex's status reply.
- `bun x svelte-check` 0 errors, `bun x vite build` clean. Probe conversations and the
  `/status` test messages deleted.

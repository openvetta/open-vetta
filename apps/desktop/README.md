# @vetta/desktop

Electron desktop host for the Vetta runtime.

## What It Owns

- Electron main/preload/renderer wiring
- desktop-specific IPC bridges
- file explorer, scheduler, project, and chat renderer domains
- integration of runtime packages into a desktop shell

## What It Does Not Own

- provider protocol implementations
- core agent loop logic
- business backend rules

## Who Depends On It

- end users running the desktop application

## Internal Boundaries

- `src/main`: Electron main process and native capabilities
- `src/preload`: safe bridge surface for the renderer
- `src/renderer`: React application domains and UI

## Windows Voice Input

Local streaming voice input is currently available only on Windows x64. The Windows artifact includes
`sherpa-onnx-win-x64`; macOS and Linux artifacts exclude that native package. The pinned Chinese
Zipformer model is downloaded and verified during a Windows build, then included under
`Resources/speech-models/` in the packaged application. Runtime voice input is fully offline and never
downloads model files. Build machines reuse verified files in `resources/speech-models/`; delete that
gitignored directory to force a fresh download.

The renderer captures 16 kHz mono PCM with an AudioWorklet. Recognition runs in a dedicated Electron
utility process so native initialization and decoding do not block the main process. See
[`ADR-0070`](../../docs/adr/0070-windows-local-streaming-speech-input.md).

Windows speech input is enabled in builds by default. Set `VETTA_SPEECH_INPUT_ENABLED=false` before
running the complete build or packaging command to produce an artifact without the speech model,
Sherpa native runtime, speech utility-process entry, microphone permission, or Renderer microphone entry:

```powershell
$env:VETTA_SPEECH_INPUT_ENABLED="false"
bun run dist:opensource
```

The value is a build-time contract and must be exactly `true` or `false`; it cannot be changed after
packaging. Disabled builds keep any verified model in the ignored build cache for later reuse, but do
not copy it into the staged application.

Run `bun run prepare:speech-models` to prepare the production model explicitly, or
`bun run prepare:speech-models:dev` to use `.env.development`. The production command skips
macOS/Linux targets, and is also part of `bun run build` and revalidated by `prepare-pack.js` before
a Windows artifact is staged. After `bun run build:main`, run `bun run verify:speech-host` to
exercise the real Electron utility process with the bundled Sherpa runtime and model through
initialize, start, audio, and stop.

## Agent Team recovery

See [team task recovery](docs/agent-team-recovery.md) for automatic recovery limits, initiator notifications, and stop behavior.

## Development

### File preview navigation

Opening a file link in a conversation keeps the activity panel's current width. Below 520px,
use the file-list and preview buttons to switch views; wider panels retain the split layout.
Closing that preview keeps the chosen width. Explicit file-tree activation retains its expand-and-restore behavior.

The preview toolbar copies the current local file's absolute path. For SSH files it copies the full remote
location, including host identity; it does not turn the URI into a misleading local path.
Clipboard failures show a retry message. The existing file-tree copy command shares this feedback.

The tree follows the current preview by loading only its missing ancestor directories, expanding them,
selecting the file, and scrolling its virtual row into view without moving keyboard focus.
Manual selection and folding remain available. Hidden, missing, or out-of-project files leave the tree usable,
and old directory reads cannot update a newly selected project or session.

### Sidebar conversation search

Use the search button in the sidebar's top action row to open the floating panel. It searches titles,
user messages, and Agent text replies across regular conversations, Claw records, project sessions,
and registered batch projects. Only text blocks are included: tool calls (including names and arguments),
tool results, thinking, and non-text attachments are excluded. A reply containing both text and tool calls
still contributes its text blocks. Type, project, and time filters default to all; archived projects are excluded. Results open
with the session's existing interactive/read-only access rules. Pinning is a local UI preference and
keeps conversations at the top of their existing sidebar group.

Each result shows one source label on the right: the project name for project/batch sessions, or the
conversation type for regular conversations and Claw. The pin button sits immediately to its left in
the title row, leaving the excerpt the full row width. Pinning never opens the conversation; both
actions can be reached separately with the keyboard. Long titles and source names are truncated
visually but remain available in the row's accessible name and hover text.

The filter icon beside the shared `Input` expands the type/project/time controls on demand. Active filters
remain visible as removable chips with a count on the icon, even while the controls are collapsed.
Resetting filters keeps the query; removing filters or clearing the query returns focus to the search
input. Expanding/collapsing controls does not restart the search. Closing the panel restores the
default unfiltered, collapsed state for its next opening.

Time filters use the catalog's last-message activity time, not the timestamp of the matching message.
Older or empty records without a usable message time retain the catalog's existing file-time fallback.
Presets include Today, Last 7 days, Last 30 days, and This month; day counts include today and use the
local calendar/timezone. Custom dates accept either or both endpoints, including the entire end day.
Custom endpoints use the shared shadcn-style `DatePicker` (`Popover` + `Calendar`/React DayPicker), not
native date inputs. Month/year menus use the shared `Select`; the year menu is a bounded sliding window.
Each endpoint supports Today, clearing and keyboard selection. Dates beyond the other endpoint are disabled;
Escape closes only the innermost menu/calendar and returns focus to its trigger. Tokens, Solar icons and
1px inset focus rings follow the desktop design system.
Incomplete or reversed ranges show an inline explanation and pause searches until corrected.
Date bounds are validated again in Main and applied in the worker before matching titles or reading bodies.

Search results always sort newest first, regardless of hit type, source, or pin status, and show their
last-message time. Equal timestamps use a stable path tie-breaker. Sidebar groups retain pin-first ordering.
Each partial result batch is merged by path, sorted, and capped: newer matches discovered later replace
older entries. Reaching the cap does not stop metadata discovery or exclude newer body matches.

Titles and excerpts highlight the literal query, ignoring case, compatibility-width differences, and
repeated whitespace while preserving the original text. Excerpts stay centered on a match, including
for long titles and queries. Before the first hit, the panel shows a central loading explanation;
once hits arrive, a visible progress strip stays above the scrollable list so results can be opened
while the search continues. Empty results and read failures have distinct states.

Search is debounced and cancellable. A lazily started worker reuses the runtime's native and historical
file readers; no history files are migrated or rewritten, and no search data is sent to a server. Hits
are displayed as they arrive, with titles checked before message bodies. Each query retains at most 100
conversations at a time and asks users to narrow the filters when that limit is reached; incremental
updates can replace older matches. Bodies too old to enter the result window are not parsed. The searchable-text LRU cache
retains at most 16 million UTF-16 code units (roughly 32 MiB of text), excluding object overhead; metadata
is capped at 10,000 sessions. The worker is released after one minute idle. First searches still need to
discover local history; a very large individual file is parsed in the worker, not on the UI/main thread.

## Development workflow

### Agent configuration and observability

Each conversation owns its Agent instance. Agent configuration remains a host/Runtime capability: callers can supply a
versioned template snapshot and session overrides, inspect desired/effective revisions, and update them for the next Turn.
Desktop does not expose an Agent configuration editor, template CRUD, or a Trace panel in conversation UI, preload or
dedicated IPC. Existing model and work-mode controls are unchanged. Saved session configuration still restores from its
embedded snapshot; legacy `agent-templates.json` is left untouched and is no longer used by Desktop.
See the [configuration API](../../packages/coding-agent/docs/agent-configuration.md).

`src/main/agent-observability` composes local diagnostic storage and optional remote export under the existing Runtime
Observation Hub. Trace/span remains the native execution signal within observability; identity, configuration revisions,
usage and parent linkage are preserved without collecting content. The Runtime composition owns and closes these resources.
Internal queries remain session-scoped; no global UI query singleton or diagnostic IPC remains. The v1 `agent-traces.json`
path and retention limits (7 days, 5,000 records, 16 MiB) stay compatible. Degradation is reported through safe structured logs
and internal query health. Remote export still requires explicit `VETTA_TRACING=langfuse` configuration.

### Local development

Run `bun dev` from this package after installing the monorepo dependencies. The development startup
uses the root Turborepo task graph and local cache to build changed workspace prerequisites, stages
plugin and theme manifests, then starts the renderer, theme server, and Electron process in parallel.

Normal development shares the installed application's `~/.vetta` data and Chromium profile by default. Quit the installed app before launching it to avoid concurrent writes; development code may modify real user data. The default development launcher requires App Action approval when using that data. To use a separate `~/.vetta-dev` profile, run the isolated entry point. Set `VETTA_CONFIG_DIR` and `VETTA_DESKTOP_USER_DATA_DIR` together when a custom isolated development environment is required.

Switching `VETTA_CONFIG_DIR` switches the data root and browser profile together; no existing data is migrated between them. The supported entry points are:

```bash
bun run dev            # ~/.vetta (default)
bun run dev:home       # ~/.vetta (compatibility alias)
bun run dev:isolated   # ~/.vetta-dev
```

Saved credentials are shared too: `safeStorage` derives its master key from the Electron app name, so
that name is fixed by `src/shared/app-identity.ts` and must stay equal to the name written into the
packaged `package.json` by `scripts/prepare-pack.js`. Changing it strands every credential already
encrypted under the old name.

`bun run dev` and `bun run dev:home` share `~/.vetta` with packaged builds; do not run them alongside the installed app, since the single-instance lock keys on the Chromium profile and will not stop the second process. The project-level `<cwd>/.vetta` directory is intentionally fixed and does not follow `VETTA_CONFIG_DIR` (see `packages/coding-agent/src/config.ts`).

Set `VETTA_CONFIG_DIR` on the command line, not in `.env.development`: the dev launcher is plain
Node and never reads `.env` files, so a value placed there would only reach the vite-inlined main
process and would disagree with the launcher-derived Chromium profile.

Main-process sourcemaps are disabled by default to keep startup builds fast. Set
`VETTA_MAIN_SOURCEMAP=true` when source-mapped Electron stack traces are needed.

Persistent Renderer logs keep user-operation signals, warnings, and errors by default, while omitting
high-frequency plugin registration, activity-tab resolution, theme loading, and routine Vite HMR records.
DevTools still shows those console messages. Set `VETTA_RENDERER_VERBOSE_LOGS=1` before starting Desktop
when a diagnostic session needs the complete Renderer console stream in the log files.

Development automatically starts plugin dev servers for every preset selected by the active
`VETTA_TENANT`, so preset source, manifest, locale, and agent resource changes reload without an
App restart. Set `VETTA_PLUGIN_DEV` to a comma-separated list to limit development to specific
plugins, or set it to an empty string to disable plugin dev servers and use staged archives only.
Each project uses its own exported `@vetta-org/plugin-vite/cli`. The stable staged or installed
plugin remains active until the development server completes its versioned ready handshake; an
unexpected server exit rolls back that overlay before bounded restart attempts.

## Electron E2E (WebdriverIO)

Uses WebdriverIO + `@wdio/electron-service` (see `wdio.conf.ts`, `e2e/`).

```bash
# 1) Build main / preload / renderer artifacts
bun run build

# 2) Unpackaged smoke (default: dist/main/index.js)
bun run test:e2e

# Or smoke against an open-source electron-builder unpacked binary
bun run dist:opensource -- --target dir
bun run test:e2e:packaged
```

Runtime sets `VETTA_E2E=1`, `VETTA_CONFIG_DIR=.vetta-e2e`, and isolates Chromium profile under `.wdio-electron-user-data`.
When a user explicitly requests agent-driven UI verification, use repo-root `verify:ui:*` (Playwright); UI changes alone do not trigger it. This WebdriverIO suite targets formal E2E / CI.

Current `e2e/smoke.e2e.ts` batch-1 covers boot only: main-process ready/version, main window `index.html`, config/userData isolation, and a `dialog` mock probe. It does not cover login, chat, or other product flows.

Packaged E2E permits one immediate spec-file retry. WebdriverIO creates a fresh browser instance for the retry, which recovers the upstream CDP bridge when its initialization promise is transiently collected during a packaged process. Unpackaged E2E does not retry; assertions are unchanged and a second failure remains fatal.

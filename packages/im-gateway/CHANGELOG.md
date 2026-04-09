# Changelog

All notable changes to `@vetta/im-gateway` are documented in this file.

## [Unreleased]

### Breaking Changes

- Removed multi-source configuration loading (yaml + credentials.yaml + OS keychain + env vars). Configuration is now injected exclusively via the new `host` subcommand's stdin protocol. The `start` subcommand still reads `~/.vetta/im-gateway/config.yaml` but is reserved for developer debugging.
- The `host` mode does not read `~/.vetta/desktop-config.json`, `~/.vetta/im-gateway/state.json`, or any other filesystem source. Project list and routing-table snapshot are sent in the `init` frame; runtime updates flow via `projects_update` and outbound `state_patch` events.
- `host` mode never writes log files. Logs are surfaced as NDJSON `log` events on stdout for the parent process to consume.

### Added

- New `host` subcommand: embedded sidecar entrypoint for `desktop-app`. Reads NDJSON control frames from stdin (`init` / `config_update` / `projects_update` / `shutdown`) and writes typed events to stdout (`ready` / `log` / `status` / `state_patch` / `metric`).
- New `internal/hostproto` package defining the wire protocol shared between Go (`host` mode) and TypeScript (`desktop-app/im-host`).
- New `state.MemoryStore` and `projects.InjectedDirectory` implementations for the `host`-mode runtime — neither touches the filesystem.
- New `Makefile` target `cross-build` producing statically linked binaries for `darwin-{amd64,arm64}`, `linux-{amd64,arm64}`, and `windows-amd64`. Output: `dist/im-gateway-<os>-<arch>[.exe]`. Used by `desktop-app`'s packaging pipeline to ship the sidecar inside `Vetta.app`.
- Init-frame timeout (10s) — sidecar exits non-zero if the parent fails to send the first frame, preventing accidental orphaned processes.
- stdin EOF triggers graceful shutdown (Windows-friendly path that does not depend on signals).

### Changed

- Feishu transport now sends outbound messages as interactive cards (card JSON 2.0 with a `markdown` element) instead of plain `text`. LLM markdown output (bold, italic, lists, code blocks, links, etc.) renders properly in the Feishu client. Requires Feishu client ≥ 7.20. `Capabilities.SupportsMessageEdit` is intentionally left at `false` for this change — streaming edit support will be a follow-up.
- All slash command replies (`/help`, `/projects`, `/use`, `/new`, `/whoami`, plus error/usage messages and the unknown-command fallback) are now in Chinese and formatted as markdown (headings, bullet lists, inline code, bold) so they render nicely on top of the new card pipeline.

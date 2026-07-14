# cowart-vetta (1:1 host mapping)

Vetta system preset adapted from [zhongerxin/Cowart](https://github.com/zhongerxin/Cowart).

## Capability map (Codex → Vetta)

| Codex native | Vetta native |
|--------------|--------------|
| MCP App widget (`ui://widget/...`) | Activity tab + full **tldraw** `canvas/App.jsx` |
| `window.cowartMcp.callServerTool` | Plugin bridge → `ctx.fs` (same `project/canvas` layout) |
| `sendFollowUpMessage` | `ctx.conversation.sendPrompt` |
| Plugin-scoped MCP tools | `agent.mcpServers` + ADR-0040 (agent IO) |
| Skills | `agent.skillPaths` + slash list |

## Layout

```text
src/                 # definePlugin, CanvasPanel, vetta bridge
canvas/              # upstream App.jsx + styles/assets (tldraw UI)
mcp/ + scripts/      # agent MCP (stdio), Vetta-safe bundle
agent/skills/        # open / image-gen / image-edit
.mcp.json
plugin.json
```

## Build

```bash
cd packages/plugins && bun install
cd presets/cowart-vetta && bun run build
```

Restage into Desktop `.artifacts/system-plugins` (or `build:presets`), **restart App**, **new conversation**.

## MCP start-mcp note

Do not `process.exit` after loading the server — `connect()` resolves when ready but the process must stay on stdio.

## Attribution

Upstream Cowart by ZHONG XIN. Vetta host adaptation for internal use.

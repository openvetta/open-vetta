# 🏖️ OSS Vacation

**Issue tracker and PRs reopen March 2, 2026.**

All PRs will be auto-closed until then. Approved contributors can submit PRs after vacation without reapproval. For support, join [Discord](https://discord.com/invite/3cU7Bz4UPx).

---

<p align="center">
  <a href="https://shittycodingagent.ai">
    <img src="https://shittycodingagent.ai/logo.svg" alt="logo" width="128">
  </a>
</p>
<p align="center">
  <a href="https://discord.com/invite/3cU7Bz4UPx"><img alt="Discord" src="https://img.shields.io/badge/discord-community-5865F2?style=flat-square&logo=discord&logoColor=white" /></a>
  <a href="https://github.com/nicepkg/vetta-mono/actions/workflows/ci.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/nicepkg/vetta-mono/ci.yml?style=flat-square&branch=main" /></a>
</p>

# Vetta Monorepo

> **Looking for the coding agent?** See **[packages/coding-agent](packages/coding-agent)** for installation and usage.

Tools for building AI agents and managing LLM deployments.

## Packages

### Core libraries

| Package | Description |
|---------|-------------|
| **[packages/ai](packages/ai)** | Unified multi-provider LLM API (OpenAI, Anthropic, Google, etc.) |
| **[packages/agent](packages/agent)** | Agent runtime with tool calling and state management |
| **[packages/coding-agent](packages/coding-agent)** | Interactive coding agent CLI (also exposes a JSON-RPC mode for headless embedding — see [docs/rpc.md](packages/coding-agent/docs/rpc.md)) |
| **[packages/tui](packages/tui)** | Terminal UI library with differential rendering |
| **[packages/web-ui](packages/web-ui)** | Web components for AI chat interfaces |

### Runtime facade

These packages wrap `coding-agent` for use by host applications (desktop-app, etc.). They provide a stable surface so hosts don't depend on `coding-agent` internals.

| Package | Description |
|---------|-------------|
| **packages/runtime-core** | `RuntimeHost` + `SessionFacade` — the canonical interface for driving agent sessions from a host process |
| **packages/runtime-storage** | Re-exports `SessionManager`, `AuthStorage`, `SettingsManager` from coding-agent |
| **packages/runtime-mcp** | Re-exports MCP manager / types |
| **packages/runtime-tools** | Re-exports built-in tool definitions |
| **packages/runtime-telemetry** | `RuntimeLogger` interface and console implementation |

### Applications

| Package | Description |
|---------|-------------|
| **packages/desktop-app** | Electron desktop client. Hosts `RuntimeHost` in the main process; renderer talks to it via Electron IPC. |
| **packages/cli-app** | Standalone CLI application |
| **packages/admin** | Admin web UI |

### Backend services

| Package | Description |
|---------|-------------|
| **packages/api** | Go (gin) backend service: auth, workflows, skills marketplace, file uploads. Independent from the desktop-app / agent runtime. |
| **[packages/im-gateway](packages/im-gateway)** | Go service that bridges IM platforms (Feishu first) to the local `coding-agent --mode rpc`. Lets you drive your local AI from Feishu / Telegram / etc. without opening the desktop app. |

## Features

### IM Gateway (Feishu, more to come)

Drive your local `coding-agent` from instant messaging clients without opening the desktop app. Personal mode runs `im-gateway` as a small Go sidecar that connects to Feishu via long-connection events (no public IP / webhook needed) and spawns `coding-agent --mode rpc` subprocesses for each active conversation. The same `~/.vetta/agent/sessions/` `.jsonl` files are shared with the desktop app, so you can pick up a chat in IM and continue it on your laptop. Single-writer enforcement via the `<file>.lock` protocol added in `SessionManager`.

```bash
im-gateway init    # generates ~/.vetta/im-gateway/config.yaml + credentials.yaml
im-gateway start   # connect to feishu, start serving
```

See [packages/im-gateway/README.md](packages/im-gateway/README.md), [docs/feishu-setup.md](packages/im-gateway/docs/feishu-setup.md), and [docs/troubleshooting.md](packages/im-gateway/docs/troubleshooting.md).

### MCP (Model Context Protocol) Support

Vetta includes built-in support for the Model Context Protocol, allowing the agent to connect to external tools and data sources through MCP servers.

**Quick start:**

1. Create `~/.vetta/agent/mcp.json`:
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/directory"]
    }
  }
}
```

2. Use `/mcp` command to view server status
3. MCP tools are automatically available to the agent

See [packages/coding-agent/docs/MCP.md](packages/coding-agent/docs/MCP.md) for full documentation.

## Contributing

See [AGENTS.md](AGENTS.md) for project-specific rules (for both humans and agents).

## Development

```bash
bun install          # Install all dependencies
bun run build        # Build all packages
bun run check        # Lint, format, and type check
./test.sh            # Run tests (skips LLM-dependent tests without API keys)
./pi-test.sh         # Run from sources (must be run from repo root)
```

> **Note:** `bun run check` may require a prior build when a package depends on generated `.d.ts` files from another workspace.

## License

MIT

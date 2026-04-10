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

## Package Map

### Core Libraries

| Package | Owns | Does Not Own |
|---------|------|--------------|
| **[packages/ai](packages/ai)** | Multi-provider LLM API surface, model registry, provider adapters | Agent loops, app UI, session persistence |
| **[packages/agent](packages/agent)** | Stateful agent loop, tool execution, event streaming | Terminal UI, desktop integration, business APIs |
| **[packages/tui](packages/tui)** | Terminal rendering primitives and editor components | Agent policy, session storage, business workflows |
| **[packages/web-ui](packages/web-ui)** | Reusable browser chat UI, artifacts, attachment previews | Desktop shell lifecycle, server-side business rules |

### Runtime And Host Packages

| Package | Owns | Depends On |
|---------|------|------------|
| **[packages/runtime-core](packages/runtime-core)** | Session facade and runtime event contract for host apps | `coding-agent` |
| **[packages/runtime-tools](packages/runtime-tools)** | Re-exported built-in coding tools for host reuse | `coding-agent` |
| **[packages/runtime-storage](packages/runtime-storage)** | Auth/session/settings storage primitives | `coding-agent` |
| **[packages/runtime-mcp](packages/runtime-mcp)** | MCP manager and MCP runtime bindings | `coding-agent` |
| **[packages/runtime-telemetry](packages/runtime-telemetry)** | Runtime logging abstractions | no runtime host state |

### Applications

| Package | Role |
|---------|------|
| **[packages/coding-agent](packages/coding-agent)** | End-user coding agent product, CLI, SDK, interactive mode |
| **[packages/cli-app](packages/cli-app)** | Thin CLI wrapper around `coding-agent` |
| **[packages/desktop-app](packages/desktop-app)** | Electron desktop host for chat, files, automations, and runtime integration |

### Business Services

| Package | Role |
|---------|------|
| **[packages/api](packages/api)** | Go backend for auth, providers, skills, releases, workflows, SSE |
| **[packages/admin](packages/admin)** | React admin console for operating the business backend |

### Architecture Guides

- [docs/architecture-overview.md](docs/architecture-overview.md): dependency direction, request flow, app/runtime boundaries
- [docs/package-conventions.md](docs/package-conventions.md): package, directory, and ownership conventions for future changes

## Features

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
bun run build        # Build core libraries
bun run check        # Lint, format, and type check
./test.sh            # Run tests (skips LLM-dependent tests without API keys)
./pi-test.sh         # Run from sources (must be run from repo root)
```

> **Note:** `bun run check` requires built type outputs for some workspace packages. If `packages/web-ui` reports missing declarations, run `bun run build` first.

## License

MIT

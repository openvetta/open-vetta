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

| Package | Description |
|---------|-------------|
| **[packages/ai](packages/ai)** | Unified multi-provider LLM API (OpenAI, Anthropic, Google, etc.) |
| **[packages/agent](packages/agent)** | Agent runtime with tool calling and state management |
| **[packages/coding-agent](packages/coding-agent)** | Interactive coding agent CLI |
| **[packages/tui](packages/tui)** | Terminal UI library with differential rendering |
| **[packages/web-ui](packages/web-ui)** | Web components for AI chat interfaces |

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
npm install          # Install all dependencies
npm run build        # Build all packages
npm run check        # Lint, format, and type check
./test.sh            # Run tests (skips LLM-dependent tests without API keys)
./pi-test.sh         # Run from sources (must be run from repo root)
```

> **Note:** `npm run check` requires `npm run build` to be run first. The web-ui package uses `tsc` which needs compiled `.d.ts` files from dependencies.

## License

MIT

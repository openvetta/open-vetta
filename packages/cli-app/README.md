# @vetta/cli-app

CLI and process composition roots around `@vetta/coding-agent`.

## What It Owns

- process entrypoint for the CLI app
- the `vetta`, `vetta-agent`, and `vetta-agent-rpc` executable entrypoints
- compatibility parsing for retired Legacy runtime requests
- dedicated JSONL RPC sidecar entrypoint
- argument handoff into `coding-agent`

## Runtime Selection

Greenfield is the canonical runtime. A retired `legacy` request remains accepted for compatibility and is mapped to the matching Greenfield host:

```text
vetta-agent-rpc --agent-runtime greenfield-im \
  --mode rpc \
  --enable-host-bridge \
  --scenario im-claw \
  --session-dir <conversation-directory>
```

The dedicated RPC entry keeps stdout reserved for JSONL protocol frames; startup diagnostics use stderr. Legacy session
files remain readable through the explicit migration boundary, but no CLI entrypoint activates Legacy execution.

## What It Does Not Own

- agent behavior
- model/provider logic
- terminal UI primitives

## Who Depends On It

- shell users and packaging targets that want a dedicated CLI package

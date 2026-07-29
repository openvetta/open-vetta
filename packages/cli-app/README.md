# @vetta/cli-app

CLI and process composition roots around `@vetta/coding-agent`.

## What It Owns

- process entrypoint for the CLI app
- explicit Legacy/Greenfield runtime selection
- dedicated JSONL RPC sidecar entrypoint
- argument handoff into `coding-agent`

## Runtime Selection

The default remains the Legacy coding-agent runtime. Greenfield IM must be selected explicitly:

```text
vetta-agent-rpc --agent-runtime greenfield-im \
  --mode rpc \
  --enable-host-bridge \
  --scenario im-claw \
  --session-dir <conversation-directory>
```

The selector falls back to Legacy for unsupported existing sessions and extensions while reusing the same loaded host
bootstrap. The dedicated RPC entry keeps stdout reserved for JSONL protocol frames; startup diagnostics use stderr.

## What It Does Not Own

- agent behavior
- model/provider logic
- terminal UI primitives

## Who Depends On It

- shell users and packaging targets that want a dedicated CLI package

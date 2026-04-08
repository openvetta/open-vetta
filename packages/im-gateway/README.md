# im-gateway

> Drive your local vetta coding-agent from IM platforms (Feishu first).

Bridges instant messaging platforms (Feishu, with Telegram / DingTalk planned) to a locally running [`coding-agent`](../coding-agent) instance. Lets you talk to your local AI from your phone or desktop IM client without opening the desktop app, while keeping all code, tools, and credentials on your machine.

## Deployment model

`im-gateway` is **embedded** as a sidecar inside `Vetta.app`. End users do **not** install or configure this binary directly — they enable IM bridging from `Settings → IM 集成` in the desktop app, fill in their feishu credentials, and the desktop main process spawns this binary as a child process.

The sidecar's lifecycle is strictly bound to the desktop app: completely quitting Vetta (including the tray icon) terminates the sidecar and stops receiving feishu events. There is no `launchd` / `systemd` daemon mode, by design.

## Subcommands

| Subcommand | Audience | Purpose |
|---|---|---|
| `host` | **End users** (driven by desktop-app) | Embedded mode. Reads NDJSON config from stdin, emits NDJSON events on stdout. Lifecycle bound to parent process. No filesystem state. |
| `start` | Developers | Standalone mode. Reads `~/.vetta/im-gateway/config.yaml`. Useful for local debugging of router / bridge / transport without running the full desktop app. |
| `init` | Developers | Generate yaml config templates for `start` mode. |
| `status` / `logs` | Developers | Inspect a running `start`-mode process. |

The `host` subcommand is the only one wired into the user deployment path. Everything else exists for hacking on im-gateway internals.

## Status

**Pre-alpha.** First milestone (personal mode + Feishu) under active implementation. Tracked in OpenSpec changes [`add-im-gateway-feishu`](../../openspec/changes/archive/) and [`add-desktop-im-settings`](../../openspec/changes/add-desktop-im-settings/).

## How it works

```
┌──────────────┐    ┌─────────────────┐    ┌────────────────────────┐
│  Feishu /    │───▶│  im-gateway     │───▶│ coding-agent --mode    │
│  Telegram    │    │  (this package) │    │ rpc (subprocess pool)  │
│  ...         │    │                 │    │                        │
└──────────────┘    └─────────────────┘    └────────────────────────┘
                            │                        │
                            ▼                        ▼
                    ~/.vetta/im-gateway/    ~/.vetta/agent/sessions/
                    state.json                <project>/<id>.jsonl
                    config.yaml               (shared with desktop-app)
```

- **Zero touch on `desktop-app` and `coding-agent`** — uses the existing `coding-agent --mode rpc` JSON protocol over stdin/stdout
- **Same session files** as the desktop app — pick up a conversation in IM, continue it on your laptop, single-writer enforced via the `<file>.lock` protocol added to `SessionManager`
- **Reads project list from `~/.vetta/desktop-config.json`** — whatever you pinned in the desktop app shows up in IM
- **Process pool** keyed by absolute session path; LRU eviction; one subprocess per active conversation
- **Transport interface** so adding telegram / dingtalk later is purely additive

## Architecture

```
internal/
  transport/    # IMTransport interface + feishu / mock implementations
  command/      # /projects /use /new /whoami /help command parser
  router/       # (im_user, project) → session routing
  bridge/       # agent event stream → IM message translation
  hostclient/   # HostClient interface + local (subprocess) implementation
  projects/     # ProjectDirectory: read ~/.vetta/desktop-config.json
  state/        # router state persistence (atomic write)
  config/       # yaml + env + keychain credential loader
  logger/       # zap-based structured logging
cmd/
  im-gateway/   # CLI entry: start / init / status / logs
docs/           # feishu-setup, troubleshooting
```

## Specs

| Document | Purpose |
|---|---|
| [openspec/changes/add-im-gateway-feishu/proposal.md](../../openspec/changes/add-im-gateway-feishu/proposal.md) | Why this exists, what it changes |
| [openspec/changes/add-im-gateway-feishu/design.md](../../openspec/changes/add-im-gateway-feishu/design.md) | 10 key technical decisions, risks, alternatives considered |
| [openspec/changes/add-im-gateway-feishu/specs/im-gateway/spec.md](../../openspec/changes/add-im-gateway-feishu/specs/im-gateway/spec.md) | Capability requirements + acceptance scenarios |
| [openspec/changes/add-im-gateway-feishu/tasks.md](../../openspec/changes/add-im-gateway-feishu/tasks.md) | Implementation checklist |
| [packages/coding-agent/docs/rpc.md](../coding-agent/docs/rpc.md) | The JSON protocol this gateway speaks to drive sessions |

## First-milestone scope (Non-Goals)

- ❌ Group chat (private chat first; groups in a follow-up change)
- ❌ Image / file attachments
- ❌ Enterprise / multi-tenant mode (interface preserves the extension point)
- ❌ Windows (macOS + linux first)
- ❌ Modifying `desktop-app` / `coding-agent` / `api`

# Changelog

All notable changes to `@vetta/im-gateway` are documented in this file.

## [Unreleased]

### Breaking Changes

- IM 侧彻底移除「项目」概念，并与 desktop「对话」物理分家：所有 IM 会话统一落在 im-gateway 自己的 cwd（`~/.vetta/im-gateway/conversation/`），与 desktop-app 的 `~/.vetta/conversation` 互不可见。删除 `/projects` `/use` 命令；`/new` 改为「在当前对话中开启新 session」。`config.PathsConfig.ConversationCwd` 默认值同步切换。详见 ADR-0004 与 ADR-0005（`docs/adr/`）。
- `hostproto` 破坏性升级：`InitFrame.projects` 与 `ProjectsUpdateFrame` 删除；`InitFrame.conversationCwd`（必填，绝对路径）取而代之。`SessionStateEntry` / `StatePatchEvent` 中的 `projectId` 字段更名为 `chatId`。
- `internal/projects` 包整体移除；`router.New` 签名从 `(tr, cmds, store, projects, pool)` 变为 `(tr, cmds, store, pool, conversationCwd)`。
- `state.RouterState` schema 升至 v2（key 由 `(userID, projectID)` 改为 `(userID, chatID)`）。检测到 v1 文件时直接清空并以 v2 重写——旧 sessionPath 绑定的是用户项目 cwd，与新的对话 cwd 不兼容，无法迁移。旧 `.jsonl` 文件本身保留，desktop-app 仍可见。
- `config.PathsConfig` 的 `desktopConfig` 字段重命名为 `conversationCwd`；环境变量 `IM_GATEWAY_DESKTOP_CONFIG` 改为 `IM_GATEWAY_CONVERSATION_CWD`。
- Removed multi-source configuration loading (yaml + credentials.yaml + OS keychain + env vars). Configuration is now injected exclusively via the new `host` subcommand's stdin protocol. The `start` subcommand still reads `~/.vetta/im-gateway/config.yaml` but is reserved for developer debugging.
- The `host` mode does not read `~/.vetta/im-gateway/state.json` or any other filesystem source. Routing-table snapshot is sent in the `init` frame; runtime updates flow via outbound `state_patch` events.

- `host` mode never writes log files. Logs are surfaced as NDJSON `log` events on stdout for the parent process to consume.

### Added

- New WeChat (iLink) transport in `internal/transport/wechat`. Speaks the iLink bot protocol directly (no OpenClaw dependency), reverse-engineered from `@tencent-weixin/openclaw-weixin@2.1.7`. M1 scope: 1-on-1 text only, scan-to-bind, long-poll receive, send with per-peer 24h/10-message quota tracking. New `im-gateway wechat <login|status|logout>` subcommand drives the QR scan flow and persists credentials to `~/.vetta/im-gateway/wechat.json`. Protocol reference: `docs/ilink-protocol.md`.
- Host mode support for WeChat: `InitFrame.wechat` slot selects the wechat transport, new inbound frames `wechat_bind_start` / `wechat_logout` drive the QR scan flow from the parent process, new outbound events `wechat_qr` / `wechat_bind_status` / `wechat_bound` / `wechat_unbound` stream live progress back. New transport status `awaiting_bind` signals "wechat selected but no credentials yet". The desktop-app's IM Settings page uses these to render the WeChat binding card.
- `Router.SetTransport` for in-process transport swaps. Used by host mode to replace the placeholder transport with the real wechat transport after a successful bind, without restarting the sidecar.
- New `host` subcommand: embedded sidecar entrypoint for `desktop-app`. Reads NDJSON control frames from stdin (`init` / `config_update` / `projects_update` / `shutdown`) and writes typed events to stdout (`ready` / `log` / `status` / `state_patch` / `metric`).
- New `internal/hostproto` package defining the wire protocol shared between Go (`host` mode) and TypeScript (`desktop-app/im-host`).
- New `state.MemoryStore` and `projects.InjectedDirectory` implementations for the `host`-mode runtime — neither touches the filesystem.
- New `Makefile` target `cross-build` producing statically linked binaries for `darwin-{amd64,arm64}`, `linux-{amd64,arm64}`, and `windows-amd64`. Output: `dist/im-gateway-<os>-<arch>[.exe]`. Used by `desktop-app`'s packaging pipeline to ship the sidecar inside `Vetta.app`.
- Init-frame timeout (10s) — sidecar exits non-zero if the parent fails to send the first frame, preventing accidental orphaned processes.
- stdin EOF triggers graceful shutdown (Windows-friendly path that does not depend on signals).
- New `Transport.EndStream(ctx, chatID, messageID)` interface method. Bridge calls it after the final flush of a streaming response so transports with a dedicated streaming path (Feishu cardkit) can clean up server-side state. Transports without one return nil.
- New `OutboundMessage.Streaming` flag. Set by the bridge when starting a streaming response so transports can pick the right path; one-shot replies (commands, errors) leave it false and continue to use the simple inline-card send path.

### Added

- `InitFrame.codingAgent` (`{ bin, prefixArgs[] }`)：让 parent 显式指定 IM session 用来拉起 coding-agent 子进程的可执行文件与前置参数。`hostclient/local.Options.BinPrefixArgs` 同步新增。未设置时仍走老路径（`vetta` PATH lookup），保证 `im-gateway start` 独立模式不受影响。Desktop-app 生产环境从此可以传 `process.execPath` + `--agent-rpc` 让 Vetta.app 自身充当 coding-agent CLI 入口，避免再要求用户全局安装 `@vetta/coding-agent`。

### Fixed

- Windows desktop-app host mode now supports `InitFrame.codingAgent.runAsNode`; when set, `hostclient/local` spawns the configured Electron executable with `ELECTRON_RUN_AS_NODE=1`. This lets Windows packaged desktop builds run coding-agent RPC over reliable Node stdio instead of GUI Electron stdio, fixing WeChat/Claw messages failing at `subprocess exited during handshake`.

- 生产环境 IM 发消息报 `exec: "vetta": executable file not found in $PATH`：sidecar 默认从 PATH 找 `vetta`，但打包好的 Vetta.app 没有把 CLI 软链到系统 PATH，所以每条 IM 消息都拉不起 coding-agent。配合 desktop-app 新增的 `--agent-rpc` CLI mode + 新增的 `InitFrame.codingAgent` 字段，sidecar 会在 IM session 启动时用 desktop-app 指定的可执行文件，根治。
- WeChat 桥接：服务器返回 `errcode -14`（bot session timeout）时，host 不再把它当成致命 transport 错误退出 sidecar，而是清掉已失效的本地凭据、emit `wechat_unbound` + `awaiting_bind`，让 sidecar 留活；用户下一次点「扫码绑定」可以直接走 `wechat_bind_start` 出新二维码。此前 desktop-app 会卡在「正在生成二维码…」的转圈，伴随日志 `ilink: bot session timeout, re-login required: session timeout`。
- `host` 模式启动 transport 时存在状态事件竞态：`emitStatus("connecting")` 写在 `t.Start` 的 goroutine 内，而紧接其后的 `emitStatus("online")` 在主 goroutine 同步发出。当 goroutine 被调度晚于主 goroutine 时，最终顺序变成 `online → connecting`，desktop-app 状态卡在「连接中」即使 transport 已正常工作。改为在主 goroutine 同步 emit `connecting`，再 spawn goroutine 跑 `Start`，保证 `connecting → online` 顺序固定。`rebuildTransport` 路径同样受益。
- Process pool now indexes entries under the session file the agent actually writes to (surfaced via `HostSession.SessionPath()` after handshake) instead of the caller-requested path. The router makes its first forward-to-agent call with an empty `sessionPath` (the agent hasn't run yet, so nothing knows the real `.jsonl`); keying the pool under that empty string caused the second message in a multi-turn conversation to miss the cache, evict the still-live subprocess, and respawn a new one that raced the previous process for the session-file `.lock`. This is what made the WeChat (iLink) bridge reply to the first inbound message and then go silent on every subsequent message — the reopened subprocess either failed with `ErrSessionLocked` or its error reply was swallowed by the transport. The fix also removes an incidental bug where two concurrent callers passing an empty `sessionPath` would share a single pooled entry.
- The IM bridge now forwards `thinking_delta` to users and emits a separate tool-call summary on each `tool_execution_start` without exposing tool results. Feishu receives one interactive card per tool summary, while WeChat receives plain text messages.

### Changed

- Feishu transport now sends one-shot outbound messages (command replies, errors, hints) as interactive cards (card JSON 2.0 with a `markdown` element) instead of plain `text`. LLM markdown output (bold, italic, lists, code blocks, links, etc.) renders properly in the Feishu client. Requires Feishu client ≥ 7.20.
- All slash command replies (`/help`, `/projects`, `/use`, `/new`, `/whoami`, plus error/usage messages and the unknown-command fallback) are now in Chinese and formatted as markdown (headings, bullet lists, inline code, bold) so they render nicely on top of the new card pipeline.
- Feishu transport now streams LLM output via the cardkit OpenAPI (`Cardkit.V1.Card.Create` + `Cardkit.V1.CardElement.Content` + `Cardkit.V1.Card.Settings`). The bridge's edit-in-place path is enabled for Feishu (`Capabilities.SupportsMessageEdit=true`) and translates to: provision a streaming card → send an interactive message that references its `card_id` → push incremental content updates with a monotonic per-card sequence → flip `streaming_mode` off on `EndStream`. Users see a typewriter-style streaming reply in the same bubble instead of one big block at the end.

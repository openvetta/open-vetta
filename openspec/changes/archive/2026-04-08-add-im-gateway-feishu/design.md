## Context

vetta 现状：
- `packages/coding-agent` 提供完整的本地 agent 能力，并已暴露 `--mode rpc` 子进程协议（JSON over stdin/stdout）。所有命令、事件、生命周期都已在 `packages/coding-agent/docs/rpc.md` 文档化。
- `packages/desktop-app`（Electron）通过 `runtime-core` 的 `RuntimeHost` 在主进程内嵌 agent，是目前唯一的"用户与 agent 交互"入口。
- `packages/api`（Go + gin）是一套独立的 SaaS 后端（auth / workflows / skills / flowing），与 desktop-app / agent runtime 无任何耦合。
- 用户的项目元数据（用户精选的项目列表）存在 `~/.vetta/desktop-config.json`，由 desktop-app 维护，已是原子写。
- 用户的会话数据存在 `~/.vetta/agent/sessions/<safe-cwd>/<timestamp>_<id>.jsonl`。SessionManager 已加 `<file>.lock` 单写者保护。

我们要把 IM（首期飞书）作为第二种"驱动 agent 的前端"接进来，但要做到对现有代码零侵入：

- desktop-app 不动一行（不暴露 HTTP/WS 服务，避免引入新的进程边界和打包负担）
- coding-agent 不动一行（依赖其已存在的 rpc 模式作为外部接口）
- packages/api 不动一行（业务域不重叠）

唯一的新增是 `packages/im-gateway/`：一个独立的 Go 二进制，作为本地 sidecar 进程跟着 desktop-app 一起跑（或用户手动启动），消费飞书事件，spawn `coding-agent --mode rpc` 子进程驱动会话。

## Goals / Non-Goals

**Goals:**

- 在飞书私聊里 @机器人 / 直接发消息能驱动本地 coding-agent 完成一次完整的对话（含工具调用、流式输出）
- 用户可以通过 `/projects` `/use` 在多个本地项目间切换，每个项目独立 session、互不污染上下文
- 切换项目时**保留**该项目的上次会话，再切回来能续接
- 飞书侧的所有消息流都被翻译成 host-agnostic 的内部模型，飞书相关代码全部封装在 `transport/feishu/` 内
- Mock transport（stdio）与飞书 transport 跑同一套 bridge / router / command 逻辑，保证抽象不泄漏
- 进程崩溃或异常退出时，coding-agent 子进程的 lockfile 会被下次启动时的 stale 检测自动回收，不留运维负担
- 为未来加 telegram / 钉钉 / 企业模式（远端 hostclient）保留扩展点，但不在本期实现

**Non-Goals:**

- ❌ 企业模式 / 多租户 / 反向通道（不在本期，但接口预留）
- ❌ 群聊路由（私聊优先；群聊在下一个 change）
- ❌ 飞书话题 / 消息卡片高级交互（首期纯文本 + 简单 markdown 即可）
- ❌ 文件 / 图片附件双向（首期只发文本，附件下一期）
- ❌ 用量统计 / 计费 / admin 面板
- ❌ 修改 desktop-app / coding-agent / api 任何源文件（除根 README 一行包说明）
- ❌ 引入数据库；状态全部走文件
- ❌ 跨平台 GUI 安装包；首期靠 `bunx`-style 命令行启动 + systemd/launchd 文档

## Decisions

### D1: 用 `coding-agent --mode rpc` 子进程作为 agent 接入路径，不在 desktop-app 暴露 WebSocket

**选择**：每个活跃 `(cwd, sessionPath)` spawn 一个独立的 `coding-agent --mode rpc` 子进程，IM 网关通过 stdin/stdout 用 JSON 协议驱动。

**为什么**：
- rpc 模式已经存在且文档完整，几乎所有 SessionFacade 能力都暴露
- desktop-app 完全零改动；不需要在 Electron 里新增 server 组件、不需要打包 Go binary 到 Electron
- 子进程边界天然提供故障隔离：一个会话的 coding-agent crash 不影响其它会话
- 与 desktop-app 共享同一份 `~/.vetta/agent/sessions/` 文件，用户感知是"同一个会话"

**Alternatives considered**：
- 在 desktop-app 主进程开 WebSocket，让 IM 网关连进去：被否决，引入了 desktop-app 的侵入性改动，且无法在 desktop-app 未启动时工作。
- 把 agent runtime 用 Go 重写：被否决，工作量爆炸且会和 TS 版本长期分叉。

### D2: 单个 Go 二进制承载全部 IM 网关逻辑（个人模式 sidecar）

**选择**：`packages/im-gateway/cmd/im-gateway/main.go` 是唯一入口，启动后读配置，连接飞书长连接，监听 IM 事件，按需 spawn coding-agent 子进程。

**为什么**：
- 个人模式不需要数据库 / 多进程；一个二进制最简单
- 用户启动方式：手动 `im-gateway` 或由 desktop-app 设置页里的开关 spawn 为子进程
- 同一份二进制，未来通过配置切换"远端 hostclient"实现就能跑企业模式（参见 D7）

**Alternatives considered**：
- 多个守护进程（feishu-listener + router + agent-pool）：被否决，对个人用户过于复杂
- 把 IM 网关代码塞进 `packages/api`：被否决，业务域无关、依赖膨胀（PG/Redis/S3 不需要）

### D3: 飞书接入用**长连接接收事件**模式，不用 webhook

**选择**：使用飞书开放平台的 event stream（长连接 / WebSocket）。bot 主动连飞书服务器，收事件、回消息。

**为什么**：
- 个人用户机器没有公网 IP，不能用 webhook 模式
- 长连接模式不需要内网穿透 / 反向代理 / TLS 证书
- 飞书开放平台官方支持，SDK 有现成实现（`larksuite/oapi-sdk-go/v3` 的 `wsclient`）

**Alternatives considered**：
- webhook + 内网穿透：被否决，"让用户暴露公网"的体验劝退非技术用户
- 飞书自建机器人不开放事件：被否决，需要用户体验对话能力

### D4: 接口分层：transport / bridge / router / command / hostclient

```
┌────────────────────────────────────────┐
│  IMTransport（接口）                    │
│  ├─ feishu/（长连接 + 消息收发）          │
│  └─ mock/  （stdio 假 IM）              │
└──────────────┬─────────────────────────┘
               │ InboundMessage / OutboundMessage
               ▼
┌────────────────────────────────────────┐
│  CommandRouter                         │
│  /projects /use /new /whoami /help     │
└──────────────┬─────────────────────────┘
               │ 未命中命令的消息
               ▼
┌────────────────────────────────────────┐
│  SessionRouter                         │
│  (im_user, project) → SessionEntry     │
│  + ProjectDirectory（读 desktop-config）│
└──────────────┬─────────────────────────┘
               │
               ▼
┌────────────────────────────────────────┐
│  AgentBridge                           │
│  agent event ↔ IM message              │
│  分段 / 截断 / 富文本翻译                │
└──────────────┬─────────────────────────┘
               │
               ▼
┌────────────────────────────────────────┐
│  HostClient（接口）                     │
│  └─ local/（spawn coding-agent --rpc）  │
│       + ProcessPool                    │
└────────────────────────────────────────┘
```

**为什么**：
- 每一层接口对应一个真正的扩展点：换 IM 改 transport，换接入方式改 hostclient，换命令集改 command router
- 接口边界用最小通用模型（`InboundMessage` / `OutboundMessage`）描述，飞书特有字段不上层
- 第一期就有两个 transport（feishu + mock），强制接口纪律

### D5: `(im_user, project) → session` 路由 + 项目切换不丢上下文

**选择**：路由 key = `(im_open_id, project_id)`。每个组合对应**一个长期 session**（持久化在 `~/.vetta/im-gateway/state.json` 里只存映射，session 内容由 coding-agent 自己管）。`/use` 切换项目时，旧 session 进程退出释放锁、新 session 进程启动加载对应 jsonl。

**为什么**：
- 用户期望"切回去能续上"，必须按 (user, project) 而不是按对话局部状态
- 路由表只存映射，不存内容——状态管理简单，崩溃恢复几乎免费
- 旧 session 退出 → lock 释放 → 不会和 desktop-app 抢锁

**Alternatives considered**：
- 每条消息都新开会话：被否决，UX 灾难
- 服务端缓存 session 历史：被否决，破坏"agent 文件是 SSOT"原则

### D6: ProjectDirectory 直接读 `~/.vetta/desktop-config.json`

**选择**：IM 网关启动时读 `~/.vetta/desktop-config.json`，按需在每次 `/projects` 命令时刷新。如果文件不存在，回退到 `coding-agent` 默认行为（通过 `SessionManager.listAll` 派生项目，但这条路径首期不实现）。

**为什么**：
- desktop-app 维护的项目列表是用户精选的"真"列表（vs 派生列表里有杂项）
- desktop-app 已对该文件做原子写，并发读写安全
- 单一来源：用户在桌面端添加 / 重命名 / 归档项目，IM 网关立即可见，无需同步层

**Alternatives considered**：
- IM 网关自建项目注册表：被否决，同步问题
- 查 desktop-app 的 IPC：被否决，desktop-app 必须运行
- 派生自 `SessionManager.listAll`：被否决，会暴露"你曾经访问过的随机 cwd"

### D7: HostClient 接口预留远端实现位

**选择**：定义 `HostClient` Go 接口，包含 `Open(cwd, sessionPath) → HostSession` / `HostSession.Send(cmd) → Event stream` / `Close()`。本期只实现 `local.HostClient`（spawn 子进程）。未来加企业模式只需新增 `remote.HostClient`（连远端反向通道），上层 router/bridge 零改动。

**为什么**：
- 个人模式 vs 企业模式的唯一差异就是"agent 跑在哪台机器"
- 把这个差异限制在一个接口背后，企业模式的引入不会污染主架构

### D8: ProcessPool 按 `(absoluteSessionPath)` keying，LRU 回收

**选择**：进程池以 session 文件绝对路径为 key。命中：复用现有进程。未命中：spawn 新的 `coding-agent --mode rpc --session <path> --cwd <projectCwd>`，等 startup ack 后挂入池。LRU 淘汰：超过配置上限（默认 8）时，把最久未活动的进程优雅关闭（发 `abort` + 关 stdin）。

**为什么**：
- spawn coding-agent 有冷启动开销（加载模型注册表 / 读 settings / 初始化 MCP），频繁 spawn 不可接受
- 单写者锁要求一个 session 只能被一个进程持有，所以 key 必须是 session 文件路径
- LRU 上限避免内存爆炸；用户长时间不用的会话会被关闭，下次发消息时重新 spawn 接续

### D9: 配置走 yaml + 环境变量，凭据存 OS keychain（带降级）

**选择**：`~/.vetta/im-gateway/config.yaml` 是主配置（路径、端口、池上限、日志级别）。飞书 App ID / Secret 优先存 OS keychain（macOS Keychain / linux Secret Service / Windows Credential Manager），不可用时降级到 `~/.vetta/im-gateway/credentials.yaml`（chmod 0600）。环境变量（`IM_GATEWAY_FEISHU_APP_ID` 等）覆盖任何配置文件。

**为什么**：
- yaml 易读、易手改、易在文档里贴示例
- 凭据走 keychain 是 desktop 本地应用的标准做法
- 降级保证在无 keychain 的 headless 环境下能跑

### D10: 流式输出策略：定时增量推送 + 自然段边界

**选择**：在 bridge 层维护一个"上次发出去的消息 ID 和已发字符位置"。当 agent 流式输出时，如果飞书 transport 声明 `SupportsMessageEdit=true`，就**编辑**同一条消息追加新内容（节流：最长每 800ms 编辑一次）；否则按段落边界 / 字符上限切片新发消息。每次工具调用结束后强制 flush。

**为什么**：
- 飞书的消息编辑 API 支持，能给用户"打字机"体验
- 节流避免触发飞书 API 频率限制
- 段落兜底确保未来加 telegram（4096 char 上限）也能用同一套 bridge

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| 用户在 desktop-app 和飞书里同时操作同一项目，触发 lockfile 拒绝 | 命令层在 `/use` 时立即调用 hostclient 探测目标 session 是否被锁；如被锁，直接告知用户"该会话当前在桌面端打开"并拒绝切换。lockfile 拒绝绝对不会损坏数据，最坏后果是 IM 收到一条错误消息。 |
| 飞书 SDK 协议变更或长连接断开 | feishu transport 必须实现自动重连 + 指数退避；启动横幅展示连接状态；连接断开期间将入站消息丢弃（不缓冲）并通过 `setStatus` 通知用户。 |
| `coding-agent --mode rpc` 协议未来变更 | 已经有 `packages/coding-agent/docs/rpc.md` 作为 SSOT；hostclient 实现在加载子进程后第一件事是 `get_state` 探活；任何协议不兼容立刻在 startup 阶段暴露。考虑加一个最低 coding-agent 版本号检查。 |
| ProcessPool 内存爆炸（用户跑大模型 session 多） | LRU + 默认上限 8；超过时优雅关闭最旧的；通过 `/whoami` 或 admin 命令暴露当前池状态。 |
| 飞书 App ID 泄漏（YAML 文件被备份到不安全位置） | 优先 keychain；YAML fallback 文件 chmod 0600；启动时检测权限位不对则警告 |
| stale 子进程残留（IM 网关 crash 后子进程没被父进程清理） | 子进程加 `setpgid` 并在 IM 网关启动时清理孤儿；父子进程都有 stale lockfile 自动回收兜底（已在前序 commit 实现）。 |
| 第一期的 mock transport 不够"反常"，无法暴露飞书的特性泄漏 | mock transport 故意声明**不支持** message edit、不支持图片、消息上限 1000 字符，模拟一个"最差能力"的 IM。这样如果 bridge 在 mock 上能跑，飞书上一定能跑。 |
| 长连接消息顺序保证：用户同一秒发两条 | 入站消息进单 goroutine 队列，按 (user, project) 顺序处理；防止"第二条消息抢先到达 agent"。 |
| 飞书 bot 凭据 mismatch / 被吊销 | 启动时主动调一次 `tenant_access_token` 接口验证凭据；失败给出可操作的错误信息（"前往飞书开放平台检查 App Secret"）。 |
| 跨平台路径处理（Windows） | 第一期**只支持 macOS / linux**。Windows 在 README 标注为后续支持。lockfile 的 hostname 检测、子进程信号处理在 Windows 上行为不一致，需要单独适配。 |

## Migration Plan

无需迁移——这是纯新增功能，零侵入。

启动顺序：
1. 用户在飞书开放平台创建自建应用，拿到 App ID / Secret
2. 用户运行 `im-gateway init` 引导式生成 `~/.vetta/im-gateway/config.yaml`
3. 用户运行 `im-gateway start` 或在 desktop-app 设置页里勾选"启用 IM 网关"（desktop-app 改动：仅一个开关 + 子进程 spawn，不在本变更范围；本变更只提供 CLI 入口）
4. 用户在飞书私聊机器人，发 `/help` 验证

**Rollback**：进程退出即可；不留任何残留状态（除了 `~/.vetta/im-gateway/` 下的配置和路由表，可以手动 `rm -rf` 回收）。

## Open Questions

1. **`im-gateway init` 引导是否要扫飞书机器人配置 wizard**？还是只生成空模板让用户自己填？倾向后者（更简单）。
2. **是否在第一期就支持"切换模型"命令**（对应 rpc 的 `set_model`）？还是只暴露 desktop-app 当前默认模型？倾向只用默认，命令在 `/use` 之外只有 `/projects /new /whoami /help`，模型切换下一期。
3. **`/new` 命令要不要让用户给会话起名字**？rpc 的 `set_session_name` 支持。倾向 `/new [name]`，可选参数。
4. **进程池上限是 8 还是 16**？8 比较保守。可以做成配置项，默认 8。
5. **是否需要提供 `im-gateway logs` / `im-gateway status` 子命令做运维**？倾向是，分别 tail 日志和打印池/连接状态。
6. **CI 里跑哪些测试**？mock transport 端到端 + 单元测试肯定要；feishu transport 因为依赖外部 SDK 和真实凭据，只能跑 unit 部分（mock 飞书 API client）。

## ADDED Requirements

### Requirement: 进程入口与生命周期

`im-gateway` 二进制 SHALL 提供 `start`、`init`、`status`、`logs` 四个子命令。`start` 启动主循环、连接配置的 IM transport、加载路由表、监听信号；收到 `SIGINT` / `SIGTERM` 时 SHALL 优雅关闭：拒绝新入站消息、等待正在处理的消息完成、依次释放所有 HostSession 子进程（让它们走 dispose 路径释放 lockfile）。

#### Scenario: start 启动并连接成功
- **WHEN** 用户运行 `im-gateway start` 且 `~/.vetta/im-gateway/config.yaml` 存在且飞书凭据有效
- **THEN** 进程保持前台运行，stdout 输出启动横幅（版本、配置文件路径、transport 名称、连接状态），并进入消息处理循环

#### Scenario: 优雅关闭释放所有子进程
- **WHEN** 主进程收到 SIGINT
- **THEN** 进程在 5 秒内关闭所有活跃的 HostSession 子进程，确认对应 session 文件的 `.lock` 已被清理，最后退出码为 0

#### Scenario: 配置缺失时友好报错
- **WHEN** 用户运行 `im-gateway start` 但配置文件不存在
- **THEN** 进程退出码非 0，stderr 打印"配置文件 ~/.vetta/im-gateway/config.yaml 不存在，运行 im-gateway init 创建"，不留任何残留状态

### Requirement: IMTransport 抽象层

系统 SHALL 定义一个 `IMTransport` Go 接口，所有 IM 平台实现都通过它暴露给上层。接口 MUST 仅使用平台无关的 `InboundMessage` / `OutboundMessage` / `Capabilities` 类型，且 MUST NOT 在方法签名中暴露任何飞书 / 其他平台的 SDK 类型。系统 SHALL 在第一期同时实现 `feishu.Transport` 和 `mock.Transport` 两个实现。

#### Scenario: 上层代码不依赖任何平台 SDK
- **WHEN** 在 `internal/router/`、`internal/bridge/`、`internal/command/` 任意源文件中 grep `lark` / `feishu` 或飞书 SDK 包名
- **THEN** 没有任何匹配；这些层只 import `internal/transport`（接口）

#### Scenario: Mock transport 与 Feishu transport 跑同一套桥接
- **WHEN** 单元测试用 `mock.Transport` 触发一条 InboundMessage
- **THEN** Bridge 和 Router 的处理代码路径与 Feishu transport 完全相同，且断言 OutboundMessage 被正确路由回 mock transport

#### Scenario: 新 transport 仅修改 transport 包
- **WHEN** 未来添加 telegram transport
- **THEN** 改动局限于新增 `internal/transport/telegram/` 目录和注册表行；router / bridge / command / hostclient 零改动

### Requirement: Feishu 长连接接入

`feishu.Transport` SHALL 使用飞书开放平台的长连接接收事件模式（不使用 webhook），bot 主动连飞书服务器接收事件并回写消息。MUST 实现自动重连（指数退避，初始 1s，上限 60s）。MUST 在启动时通过获取 `tenant_access_token` 验证凭据有效性。

#### Scenario: 启动时凭据验证失败
- **WHEN** App ID / Secret 无效
- **THEN** transport.Start() 返回错误，主进程在启动横幅之后不进入消息循环，退出码非 0

#### Scenario: 长连接中断后自动重连
- **WHEN** 网络抖动导致长连接断开
- **THEN** transport 在 1s 后重试，失败则按指数退避重试，重连成功后继续接收事件，期间到达飞书的入站消息按飞书 SDK 行为处理（首期不做客户端缓冲）

#### Scenario: 入站消息标准化
- **WHEN** 飞书发来一条 @机器人 的消息 "你好 @vetta-bot"
- **THEN** transport 把该消息转为 `InboundMessage{ Platform: "feishu", Text: "你好", ... }`，去掉 @bot 部分和命令前缀噪音

### Requirement: 命令路由

系统 SHALL 在 transport 与 bridge 之间插入 `CommandRouter`，识别以 `/` 开头的命令。第一期 MUST 支持以下命令：`/projects`（列项目）、`/use <name>`（切项目）、`/new [name]`（开新会话）、`/whoami`（当前状态）、`/help`（命令帮助）。命令 MUST 在所有 transport 上以相同语法工作。

#### Scenario: /projects 列出当前用户可见项目
- **WHEN** 用户在飞书私聊发送 `/projects`
- **THEN** bot 回复一条 markdown 消息，列出 `~/.vetta/desktop-config.json` 中的所有项目，当前选中的项目用粗体或前缀标记

#### Scenario: /use 切换到不存在的项目
- **WHEN** 用户发送 `/use does-not-exist`
- **THEN** bot 回复"未找到名为 does-not-exist 的项目，使用 /projects 查看可用项目"，路由表不变

#### Scenario: /use 切换到目标项目的 session 已被 desktop-app 锁定
- **WHEN** 用户发送 `/use foo`，且 foo 项目对应的最近 session 文件 `.lock` 被 desktop-app 持有
- **THEN** bot 回复"项目 foo 的会话当前在桌面端打开，请先在桌面端关闭或选择 /new"，路由表不变

#### Scenario: /new 在当前项目开启新会话
- **WHEN** 用户当前在 foo 项目，发送 `/new`
- **THEN** 系统通过 hostclient 的 new_session 命令在 foo 项目下创建新 session 文件，路由表中 (user, foo) 指向新 sessionPath，bot 回复"已在 foo 创建新会话"

#### Scenario: /help 列出所有命令
- **WHEN** 用户发送 `/help`
- **THEN** bot 回复包含全部 5 个命令及其语法的 markdown 文本

### Requirement: 项目目录读取

系统 SHALL 通过 `ProjectDirectory` 接口加载用户的项目列表。本期 MUST 提供 `desktopConfigDirectory` 实现，从 `~/.vetta/desktop-config.json` 读取 `projects` 字段。该实现 MUST 支持热刷新（每次 `/projects` 命令时重读文件，避免桌面端添加项目后 IM 网关不可见）。

#### Scenario: desktop-config.json 不存在
- **WHEN** 用户首次启动 IM 网关，桌面端从未添加过项目
- **THEN** ProjectDirectory.List() 返回空数组；`/projects` 命令回复"未发现任何项目，请在桌面端先添加项目或编辑 ~/.vetta/desktop-config.json"

#### Scenario: 桌面端添加新项目后 IM 立即可见
- **WHEN** 用户在桌面端添加项目 bar，然后在飞书发送 `/projects`
- **THEN** 列表包含 bar，无需重启 im-gateway

#### Scenario: 配置文件被并发写入时读到一致状态
- **WHEN** 桌面端正在原子写 desktop-config.json（rename 中）
- **THEN** ProjectDirectory 要么读到旧版本要么读到新版本，永远不会读到半截 JSON（依赖前序 commit 的原子写保证）

### Requirement: 会话路由

系统 SHALL 维护一张 `(im_user_id, project_id) → session_state` 的路由表，持久化在 `~/.vetta/im-gateway/state.json`。`session_state` MUST 至少包含 `sessionPath` 字段。该路由表 MUST 在每次切换 / 创建会话后原子写回磁盘，使用与 desktop-app 相同的 `atomic-write` 模式。系统 MUST NOT 把会话内容写入此文件——内容由 `coding-agent` 自己以 jsonl 形式管理。

#### Scenario: 用户首次和 bot 对话
- **WHEN** 用户第一次发消息且未运行 `/use`
- **THEN** bot 回复"请先选择项目：/projects"，路由表不写入新条目

#### Scenario: 切换项目后回到原项目
- **WHEN** 用户在 foo 对话 → `/use bar` → 在 bar 对话 → `/use foo`
- **THEN** 系统从路由表加载 foo 项目对应的 sessionPath，hostclient 启动新子进程加载该 session，agent 拥有完整历史

#### Scenario: state.json 写入崩溃保护
- **WHEN** im-gateway 在更新路由表的 rename 阶段被强杀
- **THEN** 重启后 state.json 要么是旧版本要么是新版本，不存在半截 JSON

### Requirement: HostClient 抽象 + 本地实现

系统 SHALL 定义 `HostClient` 接口，至少包含 `OpenSession(ctx, cwd, sessionPath) (HostSession, error)` 方法。`HostSession` SHALL 提供 `Send(cmd) error`、`Events() <-chan AgentEvent`、`Close() error`。本期 MUST 实现 `local.HostClient`，通过 `os/exec` 启动 `coding-agent --mode rpc --cwd <cwd> --session <sessionPath>` 子进程，stdin/stdout 走 JSON 行协议，遵守 `packages/coding-agent/docs/rpc.md` 文档定义的命令和事件契约。

#### Scenario: 启动子进程并完成握手
- **WHEN** local.HostClient.OpenSession 被调用
- **THEN** spawn coding-agent 子进程，等待第一条 JSON 输出（startup 阶段事件或 get_state 响应），返回可用的 HostSession；超过 10 秒未握手则超时报错并终止子进程

#### Scenario: 目标 session 已被另一进程锁定
- **WHEN** 启动子进程时收到 `{type:"response",command:"startup",success:false,...}` 错误（lockfile 冲突）
- **THEN** OpenSession 返回类型化错误 `ErrSessionLocked`，包含 holder 的 pid 和 hostname；子进程已退出无残留

#### Scenario: 子进程意外崩溃
- **WHEN** 已运行的 HostSession 子进程被外部 kill
- **THEN** Events() channel 关闭并发出一个 `error` 事件标记原因；HostClient 在路由层被通知，对应路由条目被标记为 dirty，下次用户消息触发重启

#### Scenario: Close 优雅关闭子进程
- **WHEN** HostSession.Close() 被调用
- **THEN** 系统先发送 `abort`（如有正在运行的请求），等待最多 2 秒，再关闭子进程 stdin；子进程在 dispose 流程中释放 lockfile；HostClient 等待子进程退出最多 5 秒，超时则 SIGKILL

### Requirement: 进程池

系统 SHALL 维护一个 `ProcessPool`，按 `sessionPath` 复用 HostSession，避免每次消息都重启子进程。池上限 MUST 可配置（默认 8）。超出上限时 SHALL 用 LRU 策略关闭最久未使用的 HostSession，优先关闭"无在途请求"的条目。

#### Scenario: 同一 session 的连续消息复用进程
- **WHEN** 用户在 foo 项目连续发两条消息
- **THEN** 第二条消息复用第一条创建的 HostSession，子进程没有被重启

#### Scenario: 不同 session 触发新建
- **WHEN** 用户先在 foo 发消息，再 /use bar 发消息
- **THEN** 池中存在两个 HostSession，分别对应 foo 和 bar 的 sessionPath

#### Scenario: 超出上限触发 LRU 淘汰
- **WHEN** 池上限为 2 且已有 foo 和 bar 两个空闲 HostSession，用户在 baz 发新消息
- **THEN** 系统关闭最久未活动的（如 foo），打开 baz 的新 HostSession；foo 对应 lockfile 已释放

#### Scenario: 不淘汰仍在流式输出的进程
- **WHEN** 池满，foo 正在输出 agent 响应（has in-flight request），bar 空闲
- **THEN** LRU 选择 bar 淘汰，foo 保留

### Requirement: 事件桥接与流式输出

`AgentBridge` SHALL 把 `coding-agent` 的事件流（`message_update` / `message_end` / `tool_execution_start` / `agent_end` / `error` 等）翻译成 `OutboundMessage`。当 transport 声明 `Capabilities.SupportsMessageEdit=true` 时，bridge MUST 在同一条消息上做增量编辑（节流间隔 ≥ 800ms）；否则 MUST 按段落或字符上限切片为多条消息。每次 `tool_execution_end` 之后 MUST 强制 flush 当前缓冲，确保用户能感知工具调用进度。

#### Scenario: 飞书流式输出（支持编辑）
- **WHEN** agent 流式输出 1000 字符的回复，feishu transport SupportsMessageEdit=true
- **THEN** bridge 先发一条空消息拿到 message_id，随后每 800ms 编辑该消息追加新内容，最后一次编辑包含完整文本

#### Scenario: Mock transport 不支持编辑时切片
- **WHEN** mock transport 配置为 SupportsMessageEdit=false 且 MaxMessageLength=200，agent 输出 600 字符
- **THEN** bridge 按段落 / 200 字符切片为 ≥3 条消息逐条 send

#### Scenario: 工具调用结束触发 flush
- **WHEN** agent 调用 bash 工具并结束（tool_execution_end）
- **THEN** 当前缓冲的内容立即被 send 给 IM，不等待下次节流窗口

### Requirement: 配置与凭据存储

系统 SHALL 支持以下配置加载顺序，后者覆盖前者：(1) `~/.vetta/im-gateway/config.yaml` (2) `~/.vetta/im-gateway/credentials.yaml`（chmod 0600） (3) OS keychain（macOS Keychain / linux Secret Service） (4) 环境变量 `IM_GATEWAY_*`。飞书 App Secret 等敏感字段 MUST 优先从 keychain 读取；keychain 不可用时降级到 credentials.yaml 并在启动日志警告。

#### Scenario: 完整配置存在
- **WHEN** config.yaml 提供 transport 选择和路径，credentials.yaml 提供 feishu app_id 和 app_secret
- **THEN** 启动成功，日志显示"凭据来源：credentials.yaml"

#### Scenario: 环境变量覆盖
- **WHEN** 设置 `IM_GATEWAY_FEISHU_APP_ID=xxx` 且 credentials.yaml 也定义了 app_id
- **THEN** 环境变量值生效，启动日志注明覆盖来源

#### Scenario: credentials.yaml 权限不安全
- **WHEN** credentials.yaml 的权限位非 0600
- **THEN** 启动时打印警告"credentials.yaml 权限过宽（<mode>），建议 chmod 0600"，但仍然加载（不阻塞启动）

### Requirement: 第一期范围限制（Non-Goals）

系统在第一期 MUST NOT 实现以下能力：群聊路由、消息卡片高级交互、文件 / 图片附件、用量统计、企业模式 / 反向通道、Windows 平台支持、自动检测 desktop-app 是否运行。这些功能 SHALL 在后续 change 中加入，且本期接口设计 MUST 不阻塞它们。

#### Scenario: 群聊消息被忽略
- **WHEN** bot 收到群聊消息
- **THEN** transport 静默忽略，不调用 router/bridge，不写日志（避免噪音）

#### Scenario: 飞书消息含图片附件
- **WHEN** 用户发一张图片
- **THEN** bot 回复"本期暂不支持图片输入，请用文字描述"，原图片不进入 agent 上下文

#### Scenario: Windows 启动报错
- **WHEN** 用户在 Windows 上运行 im-gateway start
- **THEN** 进程立即报错"Windows 暂未支持，跟踪 issue ..."并退出，不尝试启动后续逻辑

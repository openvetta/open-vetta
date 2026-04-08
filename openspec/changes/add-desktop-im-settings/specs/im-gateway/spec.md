## ADDED Requirements

### Requirement: Embedded Host 模式与 stdio 控制协议

`im-gateway` 二进制 SHALL 提供 `host` 子命令作为 embedded 模式入口。`host` 模式 MUST 不读取任何文件系统配置（不读 yaml、不读 credentials、不读 desktop-config.json、不读 state.json），所有运行时配置 MUST 通过 stdin 的 NDJSON 控制协议从父进程注入。日志 MUST 通过 stdout 的 `log` 事件帧上报（不写文件、不写 stderr，stderr 仅用于不可恢复 panic）。状态变更 MUST 通过 stdout 的 `status` / `state_patch` / `metric` 事件帧上报。

stdin 控制帧（每行一个 JSON 对象）：

- `{"type":"init","feishu":{...},"projects":[...],"state":{...}}`：首帧，注入完整初始配置；MUST 在 sidecar 启动后 10s 内由父进程发送，否则 sidecar 自行退出
- `{"type":"config_update","feishu":{...}}`：更新飞书凭据，触发 transport 重连
- `{"type":"projects_update","projects":[...]}`：更新项目列表
- `{"type":"shutdown"}`：触发优雅关闭

stdout 事件帧：

- `{"type":"ready","version":"...","transport":"feishu"}`：init 处理完成、transport 已尝试连接、可接收命令
- `{"type":"log","level":"info|warn|error","msg":"...","fields":{...}}`
- `{"type":"status","transport":"online|offline|connecting|error","lastError":"..."}`
- `{"type":"state_patch","userId":"...","projectId":"...","sessionPath":"..."}`：路由表变更
- `{"type":"metric","name":"...","value":...}`

#### Scenario: host 模式启动并完成 init 握手

- **WHEN** 父进程 spawn `im-gateway host` 并在 1s 内通过 stdin 发送 `init` 帧（含有效飞书凭据）
- **THEN** sidecar 在 10s 内完成 transport 连接并通过 stdout 发送 `ready` 事件帧

#### Scenario: init 超时自动退出

- **WHEN** 父进程 spawn 后 10s 内未发送 `init` 帧
- **THEN** sidecar 自行退出，退出码非 0，stderr 输出「init timeout」

#### Scenario: stdin EOF 触发优雅关闭

- **WHEN** 父进程关闭 stdin（无论 Windows 还是 POSIX）
- **THEN** sidecar 等价于收到 `shutdown` 控制帧，进入优雅关闭路径，所有 HostSession 子进程被释放，进程在 5s 内退出

#### Scenario: 配置更新触发 transport 重连

- **WHEN** sidecar 收到 `config_update` 帧且飞书凭据与当前不同
- **THEN** sidecar 关闭当前 feishu transport、用新凭据重新建立长连接、发送 `status` 事件帧反映过渡状态

#### Scenario: 项目列表热更新无需重连

- **WHEN** sidecar 收到 `projects_update` 帧
- **THEN** 内存中的 ProjectDirectory 立即被替换，`/projects` 命令立即反映新列表，feishu transport 不重连

#### Scenario: 不读任何文件系统配置

- **WHEN** 在 `internal/config/`、`internal/projects/`、`internal/state/` 中 grep `os.Open` / `os.ReadFile` 对 yaml / json 文件路径的引用
- **THEN** host 模式相关代码路径不存在任何对 `~/.vetta/im-gateway/` 或 `~/.vetta/desktop-config.json` 的读取

## MODIFIED Requirements

### Requirement: 进程入口与生命周期

`im-gateway` 二进制 SHALL 提供 `host`（embedded 模式，用户部署路径）以及 `start`、`init`、`status`、`logs` 子命令（开发者调试入口，不在用户部署路径上）。`host` 子命令的生命周期 MUST 严格 ⊆ 父进程（desktop-app）生命周期：通过 stdin EOF 或 `shutdown` 控制帧触发优雅关闭，关闭流程 MUST 拒绝新入站消息、等待正在处理的消息完成、依次释放所有 HostSession 子进程（让它们走 dispose 路径释放 lockfile），整个过程 MUST 在 5s 内完成。`start` 等开发者子命令保留现有的 SIGINT/SIGTERM 行为以便本地测试。

#### Scenario: host 模式优雅关闭释放所有子进程

- **WHEN** 父进程关闭 sidecar 的 stdin
- **THEN** 进程在 5 秒内关闭所有活跃的 HostSession 子进程，确认对应 session 文件的 `.lock` 已被清理，最后退出码为 0

#### Scenario: 开发者 start 子命令仍可用

- **WHEN** 开发者运行 `im-gateway start --transport mock`
- **THEN** 进程按现有行为前台运行，监听 SIGINT/SIGTERM，便于本地集成测试 router / bridge / command 模块

#### Scenario: host 模式拒绝从 yaml 加载

- **WHEN** 用户运行 `im-gateway host` 但 stdin 不发送 init 帧
- **THEN** 进程不去尝试读取任何 yaml 配置作为后备，10s 后超时退出

### Requirement: 项目目录读取

系统 SHALL 通过 `ProjectDirectory` 接口加载用户的项目列表。在 host 模式下，`ProjectDirectory` 的实现 MUST 为 `injectedDirectory`：项目列表完全由父进程通过 stdin 的 `init` 帧（首次）和 `projects_update` 帧（变更）注入，im-gateway 自身 MUST NOT 读取 `~/.vetta/desktop-config.json` 或任何其他文件。在开发者 `start` 模式下，可保留 `desktopConfigDirectory` 实现以便本地调试。

#### Scenario: host 模式从 init 帧加载项目列表

- **WHEN** 父进程通过 init 帧注入 `[{id:"foo",path:"/u/x/foo"},{id:"bar",path:"/u/x/bar"}]`
- **THEN** `/projects` 命令返回 foo 与 bar 两个项目

#### Scenario: 项目列表更新即时生效

- **WHEN** 父进程在运行中发送 `projects_update` 帧追加 `baz` 项目
- **THEN** 后续的 `/projects` 命令立即包含 baz，无需重启 sidecar

#### Scenario: host 模式不读 desktop-config.json

- **WHEN** host 模式启动后 grep 进程的 open syscalls
- **THEN** 没有任何对 `~/.vetta/desktop-config.json` 的打开操作

### Requirement: 会话路由

系统 SHALL 维护一张 `(im_user_id, project_id) → session_state` 的路由表。`session_state` MUST 至少包含 `sessionPath` 字段。在 host 模式下，路由表 MUST 仅存于 sidecar 内存中；每次变更 MUST 通过 stdout 的 `state_patch` 事件帧实时上报给父进程，由父进程负责持久化（desktop-app 写入 `~/.vetta/desktop-app/im-state.json`）。sidecar 启动时由父进程通过 init 帧注入完整快照。系统 MUST NOT 把会话内容写入路由表——内容由 `coding-agent` 自己以 jsonl 形式管理。在开发者 `start` 模式下，可保留自管 `state.json` 的现有行为以便本地调试。

#### Scenario: host 模式从 init 帧加载路由表

- **WHEN** 父进程通过 init 帧注入 `state: {"u1": {"foo": {"sessionPath": "/x/y.jsonl"}}}`
- **THEN** sidecar 内存路由表立即包含该条目，对应用户在 foo 项目发消息直接复用该 session

#### Scenario: 路由变更通过 state_patch 上报

- **WHEN** 用户发送 `/use bar` 触发路由变更
- **THEN** sidecar 通过 stdout 发送 `state_patch` 事件帧，父进程收到后写入磁盘（atomic write）

#### Scenario: host 模式无 state.json 文件

- **WHEN** host 模式运行期间检查 `~/.vetta/im-gateway/state.json`
- **THEN** 该文件不被 sidecar 创建或写入

### Requirement: 第一期范围限制（Non-Goals）

系统在第一期 MUST NOT 实现以下能力：群聊路由、消息卡片高级交互、文件 / 图片附件、用量统计、企业模式 / 反向通道、Windows 平台 host 模式以外的特殊支持、自动检测 desktop-app 是否运行、**作为独立 daemon 运行**、**desktop-app 完全退出后继续接收消息**、**自动安装 launchd / systemd / Windows Service 单元**。这些功能 SHALL 在后续 change 中加入或永久排除，且本期接口设计 MUST 不阻塞兼容性扩展。

#### Scenario: 群聊消息被忽略

- **WHEN** bot 收到群聊消息
- **THEN** transport 静默忽略，不调用 router/bridge，不写日志（避免噪音）

#### Scenario: 飞书消息含图片附件

- **WHEN** 用户发一张图片
- **THEN** bot 回复"本期暂不支持图片输入，请用文字描述"，原图片不进入 agent 上下文

#### Scenario: 不提供 daemon 模式

- **WHEN** 用户尝试通过 launchd / systemd 直接拉起 `im-gateway host`
- **THEN** 进程因缺少 init 帧在 10s 后退出；项目文档明确声明 host 模式仅供 desktop-app 父进程调用

#### Scenario: desktop-app 退出后无残留

- **WHEN** desktop-app 完全退出
- **THEN** 所有 im-gateway 子进程随父进程一起退出（通过 stdin EOF / shutdown 帧 / 父进程死亡时 OS 级清理），不存在任何后台运行的 im-gateway 进程

## REMOVED Requirements

### Requirement: 配置与凭据存储

**Reason**: 多源配置加载（yaml + credentials + keychain + 环境变量）与「im-gateway 由 desktop-app 嵌入运行」的新生命周期模型冲突。所有凭据现在由 desktop-app 通过 Electron `safeStorage` 集中管理，sidecar 通过 stdin 注入获取，不再访问任何配置源。

**Migration**: 旧版用户的 `~/.vetta/im-gateway/config.yaml` 与 `credentials.yaml` 由 desktop-app 在首次启动新版本时检测，弹出导入向导引导用户把字段映射到新设置（详见 `desktop-im-host` capability 的「旧版数据迁移」需求）。导入成功后旧文件被 rename 为 `.bak`。开发者 `start` 子命令仍可保留独立的简化配置加载，但仅供调试使用，不在用户文档露出。

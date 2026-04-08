## ADDED Requirements

### Requirement: IM 设置页入口

desktop-app 的设置页 SHALL 在导航中提供「IM 集成」分项。该分项 MUST 在 macOS、Windows、Linux 三端均可访问且布局一致。分项内容 MUST 至少包含：总开关 SettingSection、飞书配置 SettingSection、连接状态与操作 SettingSection。

#### Scenario: 三端导航一致

- **WHEN** 用户在 macOS / Windows / Linux 任一平台打开设置页
- **THEN** 「IM 集成」分项出现在侧边导航中，点击后渲染 `ImBridgeSettings` 页面，三端布局一致、字段顺序一致

#### Scenario: 首次进入未配置状态

- **WHEN** 用户首次打开「IM 集成」分项且本地未保存任何 IM 配置
- **THEN** 总开关默认为关闭、飞书表单字段为空、连接状态显示「未启用」、保存按钮禁用直到用户填写最少必填项

### Requirement: 总开关控制 sidecar 生命周期

设置页 SHALL 提供「启用 IM 桥接」总开关。开关从 false 切换到 true 且飞书凭据完整时，desktop-app 主进程 MUST 自动 spawn im-gateway sidecar；从 true 切换到 false 时 MUST 在 5s 内优雅关闭 sidecar 并清理状态卡片显示。开关状态 MUST 在重启 desktop-app 后保持。

#### Scenario: 启用并成功连接

- **WHEN** 用户填入有效飞书 App ID / Secret 并打开总开关
- **THEN** desktop-app 在 10s 内 spawn sidecar、完成 init 注入、收到 `ready` 事件，状态卡片显示「在线」

#### Scenario: 关闭开关停止 sidecar

- **WHEN** 用户在桥接运行中关闭总开关
- **THEN** 父进程发送 `shutdown` 控制帧，sidecar 在 5s 内退出，状态卡片切回「未启用」，无残留 im-gateway 进程

#### Scenario: 重启 desktop-app 后保持启用状态

- **WHEN** 用户启用桥接后完全退出并重新打开 desktop-app
- **THEN** 设置中的总开关仍为开启状态，sidecar 在主窗口加载完成前已被 main process 自动 spawn

### Requirement: 飞书凭据表单与校验

飞书配置 SettingSection SHALL 至少包含：App ID（文本框，必填）、App Secret（密码框，必填，支持显隐切换）、Verification Token（文本框，可选）、Encrypt Key（文本框，可选）、Transport Mode（下拉，首期固定为「长连接」单选项）。表单 MUST 在 App ID / App Secret 任一为空白时禁用保存按钮。保存 MUST 触发凭据持久化与（如总开关为开启）sidecar 重启。

#### Scenario: 必填校验

- **WHEN** 用户清空 App ID 或 App Secret
- **THEN** 保存按钮立即变为禁用状态，字段下方显示中文校验提示

#### Scenario: 显隐切换

- **WHEN** 用户点击 App Secret 输入框右侧的眼睛图标
- **THEN** 输入框在 password 与 text 类型间切换，输入内容不丢失

#### Scenario: 保存触发 sidecar 重启

- **WHEN** 桥接已启用且用户修改 App Secret 并点击保存
- **THEN** desktop-app 持久化新凭据后向 sidecar 发送 shutdown，等待退出，spawn 新的 sidecar 进程并以新凭据 init

### Requirement: 凭据安全存储

desktop-app SHALL 使用 Electron `safeStorage.encryptString` 加密所有敏感字段（App Secret、Verification Token、Encrypt Key）后写入 `~/.vetta/desktop-app/im-credentials.enc`，文件权限 MUST 为 0600。非敏感字段（启用开关、App ID、Transport Mode）SHALL 以明文 JSON 存于 `~/.vetta/desktop-app/im-config.json`。im-gateway sidecar MUST NOT 直接读取这些文件，所有凭据 MUST 由 desktop-app 解密后通过 stdio init 帧注入。

#### Scenario: macOS 加密存储

- **WHEN** 用户在 macOS 上保存飞书凭据
- **THEN** 凭据通过系统 Keychain 派生密钥加密写入 `im-credentials.enc`，直接 cat 该文件不可读

#### Scenario: Windows 加密存储

- **WHEN** 用户在 Windows 上保存飞书凭据
- **THEN** 凭据通过 DPAPI 加密写入 `im-credentials.enc`，文件解密绑定当前用户账户

#### Scenario: Linux 无密钥服务降级

- **WHEN** 用户在 Linux 上保存飞书凭据且 `safeStorage.isEncryptionAvailable()` 返回 false
- **THEN** UI 弹出确认对话框告知「未检测到密钥服务，凭据将以受限权限明文存储」，用户确认后写入 `im-credentials.enc`（明文 JSON）且文件权限强制 0600

#### Scenario: sidecar 不直接读盘

- **WHEN** 在 im-gateway 源码中搜索 `im-credentials.enc` / `im-config.json` 字面量
- **THEN** 没有任何匹配；sidecar 仅从 stdin init 帧获取凭据

### Requirement: Sidecar 进程管理

desktop-app 主进程 SHALL 提供 `im-host` 模块，负责 sidecar 的 spawn、健康检查、自动重启、优雅关闭、日志聚合。Spawn 时 MUST 通过 `binary-resolver` 按 `process.platform` + `process.arch` 选择对应二进制；spawn 后 MUST 在 10s 内收到 sidecar 的 `ready` 事件，否则视为启动失败。Sidecar 异常退出时 MUST 触发指数退避重启（5s / 15s / 60s 上限），连续 5 次失败后停止重试并将状态置为 `error`。

#### Scenario: 启动失败超时

- **WHEN** sidecar 被 spawn 但 10s 内未发出 `ready` 事件
- **THEN** desktop-app 杀死 sidecar 进程，状态卡片显示「启动失败」并附错误信息，按 backoff 策略调度下一次尝试

#### Scenario: 异常崩溃自动重启

- **WHEN** 已运行的 sidecar 因 panic 退出（非 main 主动 shutdown）
- **THEN** desktop-app 在 5s 后自动重新 spawn 并按 init 帧重新注入配置

#### Scenario: 连续失败停止重试

- **WHEN** sidecar 连续 5 次启动失败
- **THEN** desktop-app 停止自动重试，状态卡片显示「错误」+「点击重试」按钮，用户点击后重置 backoff 计数并重新尝试

#### Scenario: desktop-app 完全退出时清理 sidecar

- **WHEN** 用户从托盘菜单选择「完全退出」触发 Electron `before-quit`
- **THEN** main process 先发送 `shutdown` 控制帧，等待 sidecar 在 5s 内退出；超时则发送 SIGTERM（Windows 用 `child.kill()`），再 2s 后 SIGKILL；main process 退出时 sidecar 进程一定不存在

### Requirement: 跨平台二进制打包与定位

CI SHALL 交叉编译 5 个目标的 im-gateway 二进制：`darwin-arm64`、`darwin-x64`、`linux-x64`、`linux-arm64`、`win-x64`。所有产物 MUST 通过 electron-builder `extraResources` 进入打包后的 .app / .exe / .AppImage 内的 `Resources/im-gateway/` 目录。运行时 desktop-app MUST 通过 `binary-resolver` 基于 `process.platform` + `process.arch` 拼出路径并验证文件存在，不存在时拒绝 spawn 并把状态置为 `error`。开发模式（`!app.isPackaged`）下 MUST 从 `packages/im-gateway/dist/` 加载本地构建产物。

#### Scenario: 打包流程产出全部目标

- **WHEN** CI 执行 `bun run dist:mac` / `dist:win` / `dist:linux`
- **THEN** `prepare-pack.js` 在 electron-builder 之前调用 `make -C packages/im-gateway cross-build`，产出全部目标二进制；最终 .app / .exe / .AppImage 内 `Resources/im-gateway/` 包含至少当前平台所需的二进制

#### Scenario: macOS 公证带上 sidecar

- **WHEN** macOS dist 流程进入 codesign / notarize 阶段
- **THEN** sidecar 二进制同样被 codesign（继承主程序签名身份），notarize 提交到 Apple 时一并通过；首次启动 .app 时 Gatekeeper 不弹「无法验证开发者」对话框

#### Scenario: 开发模式加载本地构建

- **WHEN** 开发者通过 `bun run dev` 启动 desktop-app 且本地执行了 `make build`
- **THEN** binary-resolver 从 `packages/im-gateway/dist/` 加载对应 arch 的二进制，无需重新打包 .app

#### Scenario: 二进制缺失友好报错

- **WHEN** binary-resolver 拼出的路径不存在
- **THEN** 不尝试 spawn，状态卡片显示「未找到 im-gateway 二进制：<path>」，并在主进程日志记录相同错误

### Requirement: 连接状态与日志

desktop-app SHALL 维护 sidecar 的实时状态快照，包含 `transport`（`offline | connecting | online | error`）、`lastError`（带时间戳）、`activeSessions`（数字）。状态变更 MUST 通过 IPC 推送到设置页 renderer 实时更新。设置页 SHALL 提供「查看实时日志」抽屉，从 main process 内存中的环形日志缓冲（容量 ≥ 500 条）拉取最近的日志条目并按时间倒序展示。

#### Scenario: 状态实时更新

- **WHEN** sidecar 的飞书长连接从在线切换到重连中
- **THEN** sidecar 通过 stdout 发送 `status` 事件帧，desktop-app 收到后更新内存快照并向所有订阅了 `vetta:im:subscribe-status` 的 renderer 推送，状态卡片在 1s 内反映新状态

#### Scenario: 日志抽屉

- **WHEN** 用户点击「查看实时日志」按钮
- **THEN** 抽屉打开并展示最近 500 条日志（含 level、时间、message、fields），新日志实时追加

#### Scenario: 测试连接不影响主桥接

- **WHEN** 用户点击「测试连接」按钮
- **THEN** desktop-app 通过临时通道触发一次飞书 `tenant_access_token` 验证（不重启 sidecar、不影响进行中的会话），结果即时显示「成功」或「失败 + 原因」

### Requirement: IPC 端点

desktop-app SHALL 通过 preload 暴露以下 IPC 端点供 renderer 使用：`vetta:im:get-config`、`vetta:im:set-config`、`vetta:im:get-status`、`vetta:im:subscribe-status`、`vetta:im:test-connection`、`vetta:im:restart`、`vetta:im:get-recent-logs`。`get-config` MUST NOT 返回任何敏感字段明文，仅返回非敏感字段 + 「secret 已配置」布尔标志。

#### Scenario: get-config 不泄露 secret

- **WHEN** renderer 调用 `vetta:im:get-config`
- **THEN** 返回值包含 `appId`、`enabled`、`hasAppSecret: true`、`hasVerificationToken: false` 等布尔标志，但不包含任何 secret 明文字段

#### Scenario: subscribe-status 推送

- **WHEN** renderer 调用 `vetta:im:subscribe-status` 并保持订阅
- **THEN** 每次状态变更 main process 都通过 webContents 推送一次更新；renderer 卸载时主动取消订阅，main process 清理监听

### Requirement: 旧版数据迁移

desktop-app 首次启动新版本 SHALL 检测旧版 im-gateway 的本地状态：`~/.vetta/im-gateway/config.yaml`、`credentials.yaml`、`state.json`、`~/.vetta/desktop-config.json` 的 `imGateway` 段。若任一存在 MUST 弹出导入向导，引导用户把字段映射到新设置；导入成功后 MUST 把旧文件 rename 为 `.bak` 后缀以避免重复提示。导入失败 MUST NOT 阻断 desktop-app 启动。

#### Scenario: 旧 yaml 检测

- **WHEN** 用户从旧版升级且 `~/.vetta/im-gateway/config.yaml` 存在
- **THEN** desktop-app 启动后弹出向导「检测到旧版 IM 配置，是否导入到新设置？」，用户确认后字段被读出并预填到新设置表单

#### Scenario: 导入成功归档

- **WHEN** 用户在向导中点击「导入并保存」且字段校验通过
- **THEN** 凭据通过 safeStorage 加密写入新位置，旧文件被 rename 为 `config.yaml.bak` / `credentials.yaml.bak`

#### Scenario: 导入失败不阻塞

- **WHEN** 旧 yaml 文件损坏或字段缺失
- **THEN** 向导显示错误信息但允许「跳过」，desktop-app 继续正常启动；旧文件保持不变

### Requirement: 隐私生命周期边界

desktop-app MUST 保证：完全退出 desktop-app（含托盘）后，im-gateway sidecar 进程不存在、不接收任何飞书事件、不写任何状态。MUST NOT 提供「即使我关闭 Vetta 也保持运行」选项。MUST NOT 安装任何 launchd / systemd / Windows Service 等后台守护单元。

#### Scenario: 退出后无残留进程

- **WHEN** 用户从托盘菜单选择「完全退出」
- **THEN** Electron main process 退出，所有 im-gateway 子进程退出；`ps aux | grep im-gateway`（macOS/linux）或 `tasklist | findstr im-gateway`（Windows）均无匹配

#### Scenario: 不安装后台单元

- **WHEN** 用户安装 / 卸载 desktop-app
- **THEN** `~/Library/LaunchAgents/`（macOS）、`~/.config/systemd/user/`（linux）、`Get-Service`（Windows）均无任何 vetta 相关条目

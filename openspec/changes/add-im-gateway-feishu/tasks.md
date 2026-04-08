## 1. Go module 与目录骨架

- [x] 1.1 在 `packages/im-gateway/` 创建独立 Go module（module 名 `vetta-im-gateway`，匹配现有 packages/api 的命名风格；Go 1.25.3）
- [x] 1.2 创建目录骨架：`cmd/im-gateway/`、`internal/transport/{feishu,mock}/`、`internal/router/`、`internal/bridge/`、`internal/command/`、`internal/hostclient/local`、`internal/config/`、`internal/state/`、`internal/projects/`、`internal/logger/`、`docs/`
- [x] 1.3 创建 `packages/im-gateway/README.md`，引用 proposal / design / spec 路径
- [x] 1.4 在仓库根 `README.md` 的 Backend services 表中追加 `packages/im-gateway` 一行
- [x] 1.5 加 `.gitignore` 忽略 `packages/im-gateway/bin/`、`packages/im-gateway/tmp/`
- [x] 1.6 加 `Makefile` 提供 `make build` / `make test` / `make run` / `make lint` / `make tidy` / `make vet`
- [x] 1.7 引入最小依赖：`gopkg.in/yaml.v3`（配置）、`go.uber.org/zap`（日志）、`github.com/zalando/go-keyring`（凭据）— `go mod tidy` 在 Milestone A 末暂时移除（无源文件 import），将在 Milestone B 写 config/logger 时自然重新引入

## 2. 内部类型与接口（不写实现，先定接口）

- [x] 2.1 `internal/transport/types.go`：`InboundMessage` / `OutboundMessage` / `Capabilities` / `Block` / `Attachment` / `MessageHandler` 全部定义；保留 `Raw any` 字段供 transport 内部使用，明确禁止上层读取
- [x] 2.2 `internal/transport/transport.go`：`Transport` 接口（`Name / Capabilities / Start / Stop / SendMessage / EditMessage / DeleteMessage / ShowTyping`）
- [x] 2.3 `internal/hostclient/types.go`：`HostClient` / `HostSession` / `Command` / `Response` / `AgentEvent`（含 well-known type 常量）/ `LockHolder` / `ErrSessionLocked`
- [x] 2.4 `internal/projects/types.go`：`Project` / `ProjectDirectory` / `ErrProjectNotFound`
- [x] 2.5 `internal/state/types.go`：`RouterState` / `SessionEntry` / `Store` 接口 / `SessionKey` 辅助函数 / `CurrentVersion`
- [x] 2.6 `internal/config/types.go`：`Config` / `TransportConfig` / `HostClientConfig`（含 default 常量）/ `LoggingConfig` / `PathsConfig` / `Credentials` / `LoadConfig` / `LoadCredentials` 函数签名（暂返 `ErrNotImplemented`，Milestone B 实现）
- [x] 2.7 每个 internal 包加 `doc.go` 写明边界规则（transport / hostclient / router / bridge / command / projects / state / config / logger）

## 3. 配置与凭据加载

- [x] 3.1 实现 `config.LoadConfig`（load.go）：YAML 解析 → env overrides → defaults → validate；missing file 不报错；支持 `~/` 展开；env 覆盖白名单：`IM_GATEWAY_TRANSPORT` / `IM_GATEWAY_LOG_LEVEL` / `IM_GATEWAY_LOG_FILE` / `IM_GATEWAY_DESKTOP_CONFIG` / `IM_GATEWAY_STATE` / `IM_GATEWAY_LOGS_DIR` / `IM_GATEWAY_CODING_AGENT_BIN`
- [x] 3.2 实现 `config.LoadCredentials`（credentials.go）：keychain → credentials.yaml → env，每个成功来源记录到 `Credentials.Source`；keychain 硬错误降级到 stderr 警告 + fallthrough（headless/CI 友好）；YAML 文件权限非 0600 时 stderr 警告但仍加载
- [x] 3.3 测试覆盖（load_test.go + credentials_test.go）：14 个用例 — defaults / missing file / valid YAML / invalid transport / invalid log level / malformed YAML / env override YAML / tilde expansion / 凭据三源各自 / env 覆盖 file / 权限警告 / keychain 硬错误降级
- [x] 3.4 实现 `config.GenerateTemplate` + `config.DefaultConfigPath`（init.go）；新增 `cmd/im-gateway/main.go` 子命令调度器，`init` 已可用，`start` / `status` / `logs` 暂返"未实现，Milestone F"占位

## 4. 状态持久化

- [x] 4.1 实现 `state.FileStore`（store.go）：`Load` / `Save` 走 write-temp + fsync + rename 原子写；mutex 序列化并发 Save；missing file 返回空 RouterState
- [x] 4.2 `GetSession(userID, projectID)` 含懒加载缓存；`SetSession(entry)` 在写入前重读磁盘以保留其它进程的并发更新；自动填 `UpdatedAt`；compile-time 满足 `Store` 接口
- [x] 4.3 测试覆盖（store_test.go）：8 个用例 — missing file / save+reload / get missing / 没有 .tmp 残留 / well-formed JSON / 50 并发 save 不损坏 / 跨 store 实例不丢条目 / malformed file 报错

## 5. ProjectDirectory 实现

- [x] 5.1 实现 `DesktopConfigDirectory.List`（desktop_config.go）：每次调用都重读 `~/.vetta/desktop-config.json`；missing file 返回空切片不报错；空 path 条目跳过；自动给未命名项目用 basename 填充展示名
- [x] 5.2 实现 `Resolve(name)`：两阶段匹配——Phase 1 explicit Name 精确匹配，Phase 2 basename 匹配（仅限无 explicit Name 的条目，避免 named-vs-basename 冲突）；冲突时返回 ambiguous 错误；project ID 用 sha256(absPath)[:8] 派生，重命名 Name 不影响 ID 稳定性
- [x] 5.3 测试覆盖（desktop_config_test.go）：13 个用例 — missing file / empty / named+unnamed / ID 跨改名稳定 / 热刷新 / Resolve by name / by basename / not found / ambiguous basename / 显式名优先 basename / malformed JSON / 空 path 跳过

## 6. Local HostClient（spawn coding-agent）

- [x] 6.1 `hostclient/local.Client.OpenSession`（client.go）：`exec.CommandContext` 启动 coding-agent 子进程，独立 process group（POSIX setpgid）；HandshakeTimeout 默认 10s，可配置
- [x] 6.2 单 reader goroutine（session.go `readerLoop`）：bufio.Scanner 按行读 stdout，按 head 字段路由——`type:"response"` 且有 id → pendingMu map；其它（含 id-less response）→ events chan；malformed line 输出 error 事件保持循环
- [x] 6.3 `session.Send`：自动生成 id（atomic counter），注册 pending entry，写 stdin 一行 JSON，select 等 response / 进程退出 / context；内部禁止 Data 字段覆盖 reserved id/type
- [x] 6.4 `session.Close`：sync.Once 保护——发 abort（best-effort 忽略错误）→ 关 stdin → 等 exited 通道 / closeTimeout fallback SIGKILL → 清空 pending map → 记录退出码
- [x] 6.5 `parseStartupLockError` + `detectStartupLockError`：握手 Send 失败时非阻塞 drain events，识别 main.ts 发出的 `{type:"response",command:"startup",success:false,lockHolder:{pid,hostname,openedAt}}`，返回 `*hostclient.ErrSessionLocked` 含完整 holder
- [x] 6.6 `markExited`：cmd.Wait 在独立 goroutine，退出后关闭 exited chan + 唤醒所有 pending Send（发 success:false 占位响应）；reader goroutine 在 stdout EOF 时关闭 events chan
- [x] 6.7 真实 coding-agent 集成测试：本期未做（需 API key）；rpc.md 已是 SSOT，集成测试推迟到 Milestone F + CI 配置阶段
- [x] 6.8 单元测试（client_test.go）：用 `go build` 编译 fake_agent.go 子程序，配合 wrapper 脚本注入 --lock / --crash / --silent / --echo 行为；6 个测试覆盖握手成功、startup lock 错误识别、握手超时、进程崩溃、prompt 往返+events 流、Close 幂等

## 7. ProcessPool

- [x] 7.1 `hostclient.ProcessPool`（pool.go）：`map[sessionPath]*pooledSession` + `container/list` LRU + mutex；以 sessionPath 为 key，与 lockfile 协议对齐
- [x] 7.2 `Acquire(ctx, cwd, sessionPath)`：命中即复用 + bump 到 MRU；未命中先在 mutex 内 LRU 淘汰，再释放 mutex 调 OpenSession（避免握手期间阻塞其它 Acquire），处理 race（同一 path 并发 open 时 close 后到者复用先到者）
- [x] 7.3 LRU 淘汰：`evictOldestIdleLocked` 从 list back 反向找首个 inFlight==0 的条目；池满且无 idle 时返回错误，让 router 决定降级而不是阻塞
- [x] 7.4 异常退出处理：fakeSession.Close 由 reader goroutine 关闭 events chan；HostClient 错误从 Acquire 透传给 router；本期不做主动健康检查（reader goroutine 自然检测 stdout EOF）
- [x] 7.5 `Shutdown(ctx)`：标记 closed → 收集所有 session → 释放锁后逐个 Close → 后续 Acquire 直接报错；幂等
- [x] 7.6 单元测试（pool_test.go）：用 fakeClient 模拟，8 个测试覆盖复用、不同 path 各开一份、LRU 淘汰、不淘汰 in-flight、reuse 后 LRU 重排、open 失败不留池条目、Shutdown 关闭全部、并发 Acquire 同一 path 池只剩 1 条目

## 8. CommandRouter

- [x] 8.1 `command.Router`（router.go）：5 个 handler 注册（projects/use/new/whoami/help），自定义 splitArgs 支持双引号参数
- [x] 8.2 `projectsCmd`：调用 ProjectDirectory.List，按 Name 排序，当前选中项目用 `* ` 前缀标记，空时回复引导
- [x] 8.3 `useCmd`：Resolve project → 已有 sessionPath 时通过 HostPool.Acquire 探测锁定 → 识别 `*hostclient.ErrSessionLocked` 报告 holder pid/hostname → 更新 RouterState；命令层面的 lock 错误对人友好
- [x] 8.4 `newCmd`：currentProjectID 校验 → HostPool.Acquire 空 sessionPath → 可选 set_session_name → get_state 拿到真实 sessionFile → 持久化到 RouterState
- [x] 8.5 `whoamiCmd`：渲染 user / project / session / pool stats（pool size + max + in-flight）
- [x] 8.6 `helpCmd`：动态遍历已注册 handler 列出 help 文本
- [x] 8.7 单元测试（router_test.go）：14 个用例 — NotACommand / 未知命令 / help / projects empty / projects 标记当前 / use not found / use no arg / use success / use locked session / use 其它错误 / new 无项目 / new 持久化 sessionPath / whoami 无项目 / whoami 有项目 / splitArgs

## 9. SessionRouter

- [x] 9.1 `router.Router`（router.go）：transport.MessageHandler 实现；持有 commands / state / projects / pool 依赖
- [x] 9.2 入站处理：先 commands.Dispatch；NotACommand 时查 findCurrentProject → pool.Acquire → Send prompt → bridge.Run 桥接事件流回 IM
- [x] 9.3 currentProjectID 空时回复"No project selected. Use /projects then /use <name>."
- [x] 9.4 per-(user, chat) 工作 goroutine：HandleInbound 用 convKey(userID, chatID) 维护 queue map，每个会话独立 32-buffer chan + worker goroutine，sync.WaitGroup 跟踪生命周期，Shutdown 关闭全部 queue 等待 drain
- [x] 9.5 集成测试（router_test.go）：4 个用例 — plain prompt 转发到 agent + bridge 回复、未选项目提示、命令本地处理不进 agent、双用户并行处理收到各自回复

## 10. AgentBridge

- [x] 10.1 `bridge.Bridge`（bridge.go）：Run 消费 events chan，handle 按 AgentEvent.Type switch，未知事件忽略保持 forward-only
- [x] 10.2 编辑模式：commitEdit 首条 Send 拿到 messageID，后续 EditMessage 同一 ID；EditThrottle = 800ms 节流；MaxMessageLength 触发 head 提交 + 新 message 续 tail
- [x] 10.3 切片模式：maybeChunk 寻找段落边界（`\n\n`）→ 限长内最后换行 → 硬切；剩余 tail 滚入下一轮
- [x] 10.4 tool_execution_start / end 都 flush 当前 buf；agent_end / message_end 也 flush，message_end 在编辑模式下重置 messageID 让下一条消息开新 bubble
- [x] 10.5 error 事件：extractErrorText 兼容 `error` / `message` / `data.error` / `data.message` 几种 shape，找不到时输出 `(agent error)`
- [x] 10.6 测试（bridge_test.go）：8 个用例 — chunk 模式 flush on agent_end、段落边界切分、硬限长切分、edit 模式累积发送、edit 模式 message_end 之间分两条 send、tool 执行 flush 切前后两条、error 事件转发、context 取消优雅退出

## 11. Mock Transport

- [x] 11.1 `transport/mock.Transport`（mock.go）：bufio.Scanner 从 In 读 JSON 行，校验必填字段 → InboundMessage 派发；Out 写 `{action,chatId,messageId,text}` JSON 行
- [x] 11.2 Capabilities 故意保守：SupportsMessageEdit=false / MaxMessageLength=1000 / Supports* 全 false——倒逼 bridge 走切片 fallback 路径
- [x] 11.3 通过 `Options{In, Out}` 注入 io.Reader/io.Writer；CLI 入口在 Milestone F 接 stdin/stdout（cmd/im-gateway main.go 已经接 init 子命令，start 子命令的 mock 启动延后到 Milestone F）
- [x] 11.4 测试（mock_test.go）：7 个用例 — dispatch 入站消息 / 跳过 malformed / 必填校验 / SendMessage 自动 ID 唯一 / EditMessage 拒绝 / Capabilities 保守值 / Stop 解锁 Start

## 12. Feishu Transport

- [x] 12.1 引入飞书官方 SDK `github.com/larksuite/oapi-sdk-go/v3`（含 `/ws` 子模块带来的 gorilla/websocket + gogo/protobuf 间接依赖）
- [x] 12.2 `feishu.Transport`（feishu.go）：用 `larkws.NewClient` + `dispatcher.NewEventDispatcher` 注册 P2MessageReceiveV1，Start 在独立 goroutine 跑 ws Start 并 select ctx/done/err
- [x] 12.3 凭据校验：依赖 SDK 内部 token 缓存——首次 SendMessage 或 ws Start 失败会自动暴露 401，构造时只校验非空（避免在网关启动横幅前做额外网络往返）
- [x] 12.4 `handleInbound`：把 P2MessageReceiveV1 翻译为 InboundMessage（platform / chatID / userID / messageID / text），`extractText` 解析飞书 `{"text":"..."}` envelope，`stripBotMentions` 去掉 mention key 噪音
- [x] 12.5 群聊 / topic_group 在 chatType 检查后 silently return nil；非 text 消息回复一句"only text supported"提示并丢弃
- [x] 12.6 SendMessage / EditMessage（Patch）/ DeleteMessage 通过 `lark.Client.Im.Message` builder pattern 发起；ShowTyping 是 noop（飞书 bot 没有 typing API）
- [x] 12.7 自动重连：使用 SDK 默认行为（autoReconnect=true、reconnectCount=-1 unlimited、reconnectInterval=2min），无需自己实现退避循环
- [x] 12.8 Capabilities：SupportsMessageEdit=true / SupportsCards=true / SupportsButtons=true / SupportsFileUpload=true / SupportsThreads=true / MaxMessageLength=30000
- [x] 12.9 单元测试（feishu_test.go）：12 个用例 — 凭据缺失 / capabilities / encodeText 中英文/引号/换行/emoji 圆环 / extractText 三种边界 / stripBotMentions / handleInbound 私聊/群聊/非 text/nil/mention 剥离
- [x] 12.10 集成测试 `TestFeishu_Integration_ConnectAndStop`：默认 t.Skip，FEISHU_INTEGRATION_TEST=1 + IM_GATEWAY_FEISHU_APP_ID/SECRET 环境变量触发 2 秒 connect-then-stop 周期

## 13. CLI 入口与生命周期

- [ ] 13.1 实现 `cmd/im-gateway/main.go`：解析子命令 `start` / `init` / `status` / `logs`
- [ ] 13.2 `start` 子命令：加载配置 → 初始化 logger / state / projects / hostclient pool → 启动 transport → 注册信号 handler → 进入主循环
- [ ] 13.3 启动横幅：版本号 / 配置路径 / transport 名称 / 凭据来源 / 连接状态
- [ ] 13.4 SIGINT/SIGTERM 优雅关闭：5 秒内 ProcessPool.Shutdown，最后 transport.Stop
- [ ] 13.5 `status` 子命令：通过本地 unix socket 或 pid file 读取另一进程的运行状态（首期可只用 pid file 简单实现）
- [ ] 13.6 `logs` 子命令：tail `~/.vetta/im-gateway/logs/im-gateway.log`
- [ ] 13.7 写集成测试：start 进程 → mock transport 注入消息 → 断言响应 → SIGINT 关闭 → 断言无残留 lockfile

## 14. 文档

- [ ] 14.1 `packages/im-gateway/README.md`：项目简介、quickstart（init + start）、架构图、与 desktop-app / coding-agent 的关系、第一期范围限制
- [ ] 14.2 `packages/im-gateway/docs/feishu-setup.md`：飞书开放平台创建自建应用步骤、长连接事件订阅配置、获取 App ID/Secret
- [ ] 14.3 `packages/im-gateway/docs/troubleshooting.md`：常见问题（lockfile 冲突、连接断开、凭据无效）
- [ ] 14.4 在仓库根 README 的"Features"或类似位置加一段说明，链接到 packages/im-gateway

## 15. CI 与质量

- [ ] 15.1 在仓库 CI workflow 加 `packages/im-gateway` 的 Go 构建步骤（`go build ./...` + `go test ./...`）
- [ ] 15.2 加 `golangci-lint` 配置（`.golangci.yml`），与现有 packages/api 的风格对齐
- [ ] 15.3 加"接口纪律"检查脚本：grep `internal/{router,bridge,command}` 不能匹配飞书 SDK 包名（spec Requirement 验证）
- [ ] 15.4 跑 `go vet` 和 `go mod tidy`，确认无 warning
- [ ] 15.5 跑 `bun run check`（仓库整体 lint）确认 README 改动通过

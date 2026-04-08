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

- [ ] 6.1 实现 `hostclient/local`：`OpenSession` 启动 `coding-agent --mode rpc --cwd <cwd> --session <path>` 子进程，10 秒握手超时
- [ ] 6.2 实现 stdin/stdout JSON 行协议读写器，单 reader goroutine 把每行解析后分发到 `events <-chan AgentEvent` 或 `responses <-chan Response`（按 id 关联）
- [ ] 6.3 实现 `Send(cmd) → response`：写 stdin 一行 JSON，等待匹配 id 的 response，处理超时
- [ ] 6.4 实现 `Close()`：先 send abort（如需）→ 关 stdin → 等子进程退出（5 秒）→ SIGKILL 兜底
- [ ] 6.5 startup 阶段读到 `command:"startup",success:false` 时返回 `ErrSessionLocked{ Holder }`
- [ ] 6.6 检测子进程意外退出，关闭 events channel 并发出 `error` 事件
- [ ] 6.7 写集成测试：spawn 真实 coding-agent 子进程，发 `prompt` 命令，断言收到 `agent_end` 事件（CI 跳过：需 API key）
- [ ] 6.8 写单元测试：用 fake stdio pipe 验证协议处理、超时、ErrSessionLocked 判定

## 7. ProcessPool

- [ ] 7.1 实现 `hostclient.ProcessPool`：内部 `map[sessionPath]*pooledSession` + LRU 链表 + mutex
- [ ] 7.2 `Acquire(cwd, sessionPath)`：命中复用，未命中通过 HostClient.OpenSession 新建并入池
- [ ] 7.3 LRU 淘汰：上限可配置（默认 8），淘汰最久未用且无在途请求的条目
- [ ] 7.4 健康检查：异常退出的进程从池中清除
- [ ] 7.5 `Shutdown(ctx)`：依次 Close 所有进程，确认所有 lockfile 已释放
- [ ] 7.6 写测试：复用、新建、LRU 顺序、不淘汰 in-flight、Shutdown 完整性

## 8. CommandRouter

- [ ] 8.1 实现 `command.Router`：注册 `/projects` `/use` `/new` `/whoami` `/help` 五个 handler
- [ ] 8.2 `/projects`：调用 ProjectDirectory.List，渲染 markdown，标记当前选中
- [ ] 8.3 `/use <name>`：解析 → 检查存在性 → 通过 hostclient 探测目标 session 是否锁定 → 更新路由表 → 回复确认
- [ ] 8.4 `/new [name]`：通过 hostclient.Send `new_session`，更新路由表 → 可选 `set_session_name`
- [ ] 8.5 `/whoami`：返回当前用户 open_id、当前项目、当前 session 简要信息
- [ ] 8.6 `/help`：渲染命令帮助
- [ ] 8.7 写测试：每个命令独立 case + 错误路径（项目不存在 / session 锁定 / 未先选项目）

## 9. SessionRouter

- [ ] 9.1 实现 `router.Router`：把入站消息映射到 hostclient 子进程
- [ ] 9.2 入站消息处理逻辑：先尝试 CommandRouter；未命中则查 RouterState 找当前 (user, project) → sessionPath → 池中拿 HostSession → 发送 prompt
- [ ] 9.3 未选项目时回复"请先 /projects 选择项目"
- [ ] 9.4 单 goroutine per (user, project) 串行处理消息，避免乱序
- [ ] 9.5 写集成测试：mock transport 触发命令 / 普通消息 / 多用户隔离

## 10. AgentBridge

- [ ] 10.1 实现 `bridge.Bridge`：订阅 HostSession.Events()，把 agent 事件翻译为 OutboundMessage
- [ ] 10.2 流式输出节流：`SupportsMessageEdit=true` 时增量编辑同一条消息，节流 ≥800ms
- [ ] 10.3 切片 fallback：`SupportsMessageEdit=false` 时按段落 / 字符上限切片新发
- [ ] 10.4 工具调用进度：`tool_execution_start` / `tool_execution_end` 事件触发 flush
- [ ] 10.5 错误事件：agent error / context overflow 等翻译为人类可读消息发回
- [ ] 10.6 写测试：mock transport 跑两种模式（支持编辑 / 不支持编辑），断言消息分片、节流、flush 正确

## 11. Mock Transport

- [ ] 11.1 实现 `transport/mock`：从 stdin 读 JSON 行作为 InboundMessage，向 stdout 输出 OutboundMessage 的 JSON 表示
- [ ] 11.2 故意声明保守的 Capabilities：`SupportsMessageEdit=false`、`MaxMessageLength=1000`、`SupportsCards=false`
- [ ] 11.3 提供 `--transport mock` 启动模式用于本地调试
- [ ] 11.4 写测试：mock transport + 全套上层 = 端到端走通

## 12. Feishu Transport

- [ ] 12.1 引入飞书官方 SDK `github.com/larksuite/oapi-sdk-go/v3`
- [ ] 12.2 实现 `transport/feishu`：基于 SDK 的长连接 client（wsclient 模块）
- [ ] 12.3 启动时获取 `tenant_access_token` 验证凭据
- [ ] 12.4 注册消息事件 handler：把飞书消息转为 InboundMessage，去掉 @bot 前缀和命令噪音
- [ ] 12.5 群聊消息静默丢弃（本期 Non-Goal）
- [ ] 12.6 实现 SendMessage / EditMessage / DeleteMessage / ShowTyping 四个动作，封装飞书 API 调用
- [ ] 12.7 实现自动重连：指数退避 1s → 60s
- [ ] 12.8 声明 Capabilities：SupportsMessageEdit=true、MaxMessageLength=30000、SupportsCards=true（本期暂不利用）
- [ ] 12.9 写单元测试：用 mock 飞书 client 验证消息标准化、错误路径
- [ ] 12.10 写集成测试入口（默认 skip，环境变量 `FEISHU_INTEGRATION_TEST=1` + 真实凭据触发）

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

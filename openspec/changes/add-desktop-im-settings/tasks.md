## 1. im-gateway: host 子命令骨架

- [x] 1.1 在 `packages/im-gateway/cmd/im-gateway/` 新增 `host.go`，注册 `host` 子命令；保留现有 `start/init/status/logs` 子命令不动
- [x] 1.2 新增 `internal/hostproto/` 包，定义 stdin/stdout NDJSON 帧的 Go 结构体（`InitFrame` / `ConfigUpdateFrame` / `ProjectsUpdateFrame` / `ShutdownFrame` / `ReadyEvent` / `LogEvent` / `StatusEvent` / `StatePatchEvent` / `MetricEvent`）和编解码函数
- [x] 1.3 实现 `internal/hostproto/reader.go`：从 stdin 按行解析帧并通过 channel 派发；处理 EOF 等价 shutdown
- [x] 1.4 实现 `internal/hostproto/writer.go`：线程安全的事件帧写出器，序列化为单行 NDJSON

## 2. im-gateway: host 模式运行时改造

- [x] 2.1 新增 `internal/projects/injected.go`：实现 `ProjectDirectory` 接口的内存版本，支持 `Replace(projects)` 原子替换
- [x] 2.2 改造 `internal/state/`：抽出 `RouteTable` 内存结构，移除 host 模式下的文件 IO；新增 `OnPatch(callback)` 钩子用于事件上报；保留 `start` 模式下的文件持久化路径
- [x] 2.3 在 `cmd/im-gateway/host.go` 内编排：等待 init 帧（10s 超时）→ 用注入的飞书凭据初始化 transport → 用注入的项目列表初始化 ProjectDirectory → 用注入的 state 初始化 RouteTable → 启动现有 router/bridge → 发送 `ready` 事件
- [x] 2.4 实现 `config_update` 处理：关闭旧 transport，按新凭据重建并广播 `status` 事件
- [x] 2.5 实现 `projects_update` 处理：调用 injected ProjectDirectory 的 `Replace`
- [x] 2.6 实现 `shutdown` 处理：复用现有 `start` 子命令的优雅关闭路径，确保 5s 内退出
- [x] 2.7 把 `internal/logger/` 输出重定向到 hostproto writer 的 `log` 事件帧（host 模式专用 logger sink）
- [x] 2.8 把 transport 状态变更回调接入 hostproto writer，发出 `status` 事件
- [x] 2.9 把 RouteTable 的 `OnPatch` 接入 hostproto writer，发出 `state_patch` 事件

## 3. im-gateway: 单元测试

- [x] 3.1 `internal/hostproto/`：帧编解码 round-trip 测试
- [x] 3.2 `internal/hostproto/reader.go`：stdin EOF 触发 shutdown 的测试
- [x] 3.3 `cmd/im-gateway/host.go`：init 超时退出测试（不发 init，断言进程在 10s+ε 内退出）
- [x] 3.4 `cmd/im-gateway/host.go`：init → ready → shutdown 完整握手测试（用 mock transport）
- [x] 3.5 `cmd/im-gateway/host.go`：config_update 触发 transport 重建的测试

## 4. im-gateway: 跨平台构建

- [x] 4.1 在 `packages/im-gateway/Makefile` 新增 `cross-build` target：调用 `GOOS/GOARCH` 矩阵编译 `darwin-arm64`、`darwin-x64`、`linux-x64`、`linux-arm64`、`win-x64`，输出到 `packages/im-gateway/dist/im-gateway-<os>-<arch>[.exe]`
- [x] 4.2 编译参数加 `-ldflags "-s -w"`，并启用 `CGO_ENABLED=0` 保证产物为静态二进制
- [x] 4.3 在 `Makefile` 增加 `dist-clean` target 清理 `dist/`
- [x] 4.4 验证：本地 macOS 上执行 `make cross-build`，确认 5 个二进制都成功产出且可被对应平台执行（mac 本地至少跑通 darwin-* 两份）

## 5. desktop-app: im-host main 模块

- [x] 5.1 创建 `packages/desktop-app/src/main/im-host/` 目录
- [x] 5.2 实现 `binary-resolver.ts`：基于 `process.platform` + `process.arch` + `app.isPackaged` 拼出 sidecar 二进制路径，验证存在性
- [x] 5.3 实现 `host-protocol.ts`：与 im-gateway 对应的 TypeScript 类型 + 编解码（NDJSON 行解析、写出）
- [x] 5.4 实现 `credential-store.ts`：基于 Electron `safeStorage` 加解密敏感字段，读写 `~/.vetta/desktop-app/im-credentials.enc`（chmod 0600），处理 Linux 降级场景（`isEncryptionAvailable === false` 时明文 + 0600）
- [x] 5.5 实现 `config-store.ts`：读写 `~/.vetta/desktop-app/im-config.json`（明文非敏感字段）
- [x] 5.6 实现 `state-store.ts`：读写 `~/.vetta/desktop-app/im-state.json`（atomic-write，沿用现有 `utils/atomic-write.ts`）
- [x] 5.7 实现 `log-buffer.ts`：环形日志缓冲（容量 500），支持 push、snapshot、订阅
- [x] 5.8 实现 `status-store.ts`：维护当前 transport 状态快照 + 订阅推送
- [x] 5.9 实现 `sidecar-manager.ts`：spawn / stdio 桥接 / 健康检查（10s ready 超时）/ backoff 重启（5s/15s/60s 上限，5 次后停止）/ 优雅关闭（shutdown 帧 → 5s 等 → kill → 2s → SIGKILL）/ 跨平台 kill（Windows 用 `child.kill()`）
- [x] 5.10 实现 `im-host/index.ts`：组合上述模块，暴露 `start()` / `stop()` / `restart()` / `applyConfig()` / `injectProjects()` / `applyStatePatch()` / `getStatus()` / `getRecentLogs()` / `testConnection()`
- [x] 5.11 在 `main.ts` 启动流程末尾：读取 config + credential，若 `enabled === true` 且凭据完整则调用 `imHost.start()`
- [x] 5.12 在 `before-quit` 钩子内：调用 `imHost.stop()` 并 await 完成，确保 sidecar 在 main 退出前关闭

## 6. desktop-app: IPC 端点

- [x] 6.1 创建 `packages/desktop-app/src/main/ipc/im.ts`，实现 `vetta:im:get-config`（不返回 secret 明文）
- [x] 6.2 实现 `vetta:im:set-config`：持久化 + 加密敏感字段 + 按需触发 sidecar restart
- [x] 6.3 实现 `vetta:im:get-status` / `vetta:im:subscribe-status`（webContents 推送，renderer 卸载时清理）
- [x] 6.4 实现 `vetta:im:test-connection`：临时通道做飞书 tenant_access_token 验证，不影响主桥接
- [x] 6.5 实现 `vetta:im:restart`
- [x] 6.6 实现 `vetta:im:get-recent-logs`
- [x] 6.7 在 `ipc/index.ts` 注册 `registerImIpc()` 并在 cleanup 中清理
- [x] 6.8 在 `preload` 中暴露 `window.vetta.im` 命名空间和上述 IPC 包装
- [x] 6.9 更新 `renderer/global.d.ts` 类型定义

## 7. desktop-app: IM 设置 UI

- [x] 7.1 在 `renderer/domains/settings/components/` 新增 `ImBridgeSettings.tsx`，包含三个 SettingSection：总开关、飞书配置、状态与操作
- [x] 7.2 实现飞书表单：App ID 文本框、App Secret 密码框（含显隐切换）、Verification Token、Encrypt Key、Transport Mode 下拉（首期单选「长连接」）
- [x] 7.3 实现客户端校验：App ID + App Secret 任一空白时禁用保存按钮 + 字段级错误提示
- [x] 7.4 实现保存逻辑：调用 `window.vetta.im.setConfig`，成功后刷新本地状态
- [x] 7.5 实现总开关切换：调用 `setConfig({ enabled })`，UI 立即响应过渡状态
- [x] 7.6 实现状态卡片：订阅 `subscribe-status`，渲染 transport 状态徽章 + lastError + activeSessions
- [x] 7.7 实现「测试连接」按钮：调用 `testConnection`，按钮处于 loading 状态时禁用，结果 toast 显示
- [x] 7.8 实现「重启桥接」按钮
- [x] 7.9 实现「查看实时日志」抽屉：拉 `getRecentLogs` 并通过 status 订阅追加新日志，时间倒序展示
- [x] 7.10 在 `SettingsPage.tsx` 的导航中追加「IM 集成」入口
- [x] 7.11 三端样式与暗色模式适配验证

## 8. desktop-app: 旧版数据迁移

- [x] 8.1 在 `main/im-host/migration.ts` 实现旧路径检测：`~/.vetta/im-gateway/{config,credentials}.yaml`、`state.json`、`~/.vetta/desktop-config.json` 的 `imGateway` 段
- [x] 8.2 实现 yaml 解析（用现有依赖或 `js-yaml`）→ 字段映射到新 config/credential 结构
- [x] 8.3 在主进程启动后、未保存 IM 配置时触发一次检测；通过 IPC 通知 renderer 弹出向导
- [x] 8.4 渲染层向导组件：展示旧配置预览 → 用户确认导入 → 调用 `setConfig` → 主进程把旧文件 rename 为 `.bak`
- [x] 8.5 错误路径：解析失败时允许「跳过」，desktop-app 正常启动；旧文件不动

## 9. desktop-app: 打包流水线（本期不启用 macOS 公证）

- [x] 9.1 修改 `packages/desktop-app/scripts/prepare-pack.js`：在 electron-builder 之前调用 `make -C ../im-gateway cross-build`
- [x] 9.2 修改 electron-builder 配置（`package.json` 或 `electron-builder.json`）：`extraResources` 增加 `{ from: "../im-gateway/dist", to: "im-gateway", filter: ["im-gateway-*"] }`
- [x] 9.3 macOS entitlements 占位：写好 `entitlements.plist`（含 `com.apple.security.cs.allow-jit` / `allow-unsigned-executable-memory` 等 sidecar 所需权限），并在 electron-builder 配置中预留 `mac.notarize: null` 字段。**本期不调用 notarytool，不进行公证**
- [x] 9.4 在 `dist:mac` 任务中本地验证：打包后的 .app 内 `Contents/Resources/im-gateway/` 含 `darwin-arm64` + `darwin-x64` 二进制；.app 能在开发者本机正常启动（Gatekeeper 弹「无法验证开发者」属预期行为，不视为失败）
- [x] 9.5 添加 `dist:win` 任务的等价配置（按需，Windows 未签名时 SmartScreen 警告但可运行）
- [x] 9.6 添加 `dist:linux` 任务的等价配置（按需）
- [x] 9.7 CI workflow 增加 Go cross-compile 前置 job
- [x] 9.8 **明确禁用自更新**：确认 desktop-app 没有接入 Sparkle / electron-updater 等自更新机制；若已有，加 feature flag 关闭未公证版本的自更新路径
- [x] 9.9 在下载页 / `packages/desktop-app/README.md` 顶部增加「内测版未公证」提示块，包含：8 步系统设置放行流程截图 + 一行 `xattr` 命令救急方案
- [x] 9.10 macOS 启动失败兜底：在 `prepare-pack.js` 输出阶段确认 sidecar 二进制具有可执行权限位（防止从 zip 解压后丢失 +x）

## 10. 端到端验证

- [ ] 10.1 macOS arm64：装包 → 启用桥接 → 飞书发消息 → agent 回复 → 完全退出 → `ps aux | grep im-gateway` 无残留
- [ ] 10.2 macOS x64：同上
- [ ] 10.3 Windows 11 x64：装包 → 启用桥接 → 飞书消息 round-trip → 完全退出 → `tasklist` 无残留
- [ ] 10.4 Linux x64（Ubuntu，含 libsecret）：同上 + 验证 safeStorage 加密路径
- [ ] 10.5 Linux x64（最小桌面环境，无 libsecret）：验证降级流程 + 0600 权限
- [ ] 10.6 sidecar 崩溃恢复：手动 kill sidecar 进程，验证 backoff 重启
- [ ] 10.7 启动失败展示：填入错误 App Secret，验证 5 次失败后停止重试 + 状态卡片错误展示
- [ ] 10.8 配置热切换：切换 App Secret 验证 sidecar 重启
- [ ] 10.9 项目列表更新：在 desktop-app 中新增项目，验证 IM 侧 `/projects` 立即可见
- [ ] 10.10 旧版迁移：mock `~/.vetta/im-gateway/config.yaml` + `credentials.yaml`，验证向导触发与导入

## 11. 文档与发布

- [x] 11.1 更新 `packages/im-gateway/README.md`：标注 `host` 模式为用户路径、`start` 子命令降级为开发者调试
- [x] 11.2 更新 `packages/desktop-app/AGENTS.md` / README：说明 IM 集成设置入口
- [x] 11.3 在 `packages/desktop-app/CHANGELOG.md` 的 `[Unreleased]` 增加 `### Added` 条目，并在版本标题后追加「内测版（未公证）」标记
- [x] 11.4 在 `packages/im-gateway/CHANGELOG.md` 的 `[Unreleased]` 增加 `### Breaking Changes` + `### Added` 条目
- [x] 11.5 撰写迁移说明文档（旧配置如何被迁移、卸载行为）
- [x] 11.6 撰写 macOS 首次启动放行指南（独立 markdown 或 README 段落）：覆盖 macOS 14 / 15 两种系统的不同 UX，含截图与 `xattr` 一行命令
- [x] 11.7 `bun run check` 通过且无警告

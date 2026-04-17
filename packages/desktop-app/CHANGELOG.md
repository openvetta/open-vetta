# Changelog

All notable changes to `@vetta/desktop-app` are documented in this file.

## [Unreleased] — 内测版（未公证）

### Fixed

- 修复同一 desktop-app 进程内重复打开同一 session 时抛 `SessionLockError` 的问题。`RuntimeHost.createSession` 现在按 sessionPath 去重，已开的 session 直接复用 handle，不再二次申请文件锁；`renameSession` / `renameSessionById` / `deleteSession` 不再泄漏 SessionManager 与孤儿 `.lock` 文件；`WebContents` 销毁时会通过新增的 `disposeAllSessions()` 释放本进程持有的全部 session 文件锁。新增 `vetta:session:dispose` IPC 通道与 `window.vetta.session.dispose(sessionId)`，供 renderer 在关闭/切换 session 时主动归还锁。

### Added

- **微信（iLink）渠道卡片 + 扫码绑定对话框**：`Settings → IM 集成` 新增「微信」渠道卡片，与飞书并列。点击「扫码绑定」打开对话框，对话框内通过 NDJSON 长轮询从 sidecar 实时接收 `wechat_qr` / `wechat_bind_status` / `wechat_bound` 事件，渲染 QR 图（`qrcode` 包，新增依赖），按状态机展示 idle → starting → waiting → scanned → confirmed → 自动关闭，过期自动刷新。
  - 「活动」徽章：标识当前激活的 transport（飞书 / 微信，互斥）。点击非活动卡片的「激活」按钮可在不重新填写凭据的前提下切换到该 transport。
  - 「管理 / 解绑」：已绑定后对话框显示 `ilink_bot_id` / `ilink_user_id` 与 24h/10 条配额提醒，并提供解绑按钮。解绑触发 `wechat_logout` 帧，sidecar 清空 `~/.vetta/desktop-app/im-wechat.json` 后回到 awaiting_bind 状态。
  - 总开关在微信模式下无需任何长效凭据：选中微信、未绑定时点击「启用」会自动弹出绑定对话框；已绑定后启用即拉起 wechat transport 长轮询。
- **IM 集成设置页**（`Settings → IM 集成`）：支持启用 / 停用 IM 桥接、填写飞书 App ID / App Secret / Verification Token / Encrypt Key、查看连接状态、测试连接、重启桥接、查看实时日志（最近 500 条），跨 macOS / Windows / Linux 三端可用。
- **嵌入式 im-gateway 桥接子进程**：desktop-app 主进程通过 `child_process.spawn` 启动 `im-gateway host` 子进程，stdio NDJSON 协议双向通信。完整生命周期由父进程管理：app 完全退出 → 桥接进程在 5s 内被发送 shutdown 帧 → 退出。
  - 健康检查：spawn 后 10s 内未收到 `ready` 事件视为启动失败。
  - 自动重启：异常退出 / 启动失败按指数退避（5s / 15s / 60s）重试，连续 5 次失败后停止并切换到 `error` 状态等待用户手动重启。
  - 跨平台终止策略：POSIX 走 SIGTERM → SIGKILL，Windows 走 `child.kill()` + stdin EOF。
- **凭据安全存储**：飞书 App Secret / Verification Token / Encrypt Key 通过 Electron `safeStorage` 加密后写入 `~/.vetta/desktop-app/im-credentials.enc`（chmod 0600）。
  - macOS Keychain / Windows DPAPI / Linux libsecret 自动选择。
  - Linux 无密钥服务时降级为强制 0600 明文存储，UI 显式弹窗告知。
  - im-gateway 子进程不直接访问任何凭据文件，全部由父进程注入。
- **跨平台二进制打包**：`prepare-pack.js` 在 electron-builder 之前调用 `make -C packages/im-gateway cross-build`，产出 5 个目标 arch 的 `im-gateway-<os>-<arch>[.exe]` 二进制，通过 `extraResources` 进入 `.app` / `.exe` / `.AppImage` 内 `Resources/im-gateway/`。运行时由 `binary-resolver` 按 `process.platform` + `process.arch` 解析。
- **旧版数据迁移**：检测 `~/.vetta/im-gateway/{config,credentials}.yaml` 与 `state.json`，弹出导入向导，导入成功后将旧文件重命名为 `.<timestamp>.bak`，避免重复提示。
- **IM IPC**：`vetta:im:get-config` / `set-config` / `get-status` / `subscribe-status` / `test-connection` / `restart` / `get-recent-logs` / `get-paths` / `detect-legacy` / `import-legacy` 端点，全部通过 preload 暴露为 `window.vetta.im.*`。
- **`SettingsTab` 类型扩展**：新增 `"im"` 标签项与对应导航条目。
- **`before-quit` 钩子**：确保完全退出 desktop-app 时 IM 桥接 sidecar 已被回收，无残留进程。

### Notes

- macOS 公证暂未启用：本期为内测版，分发的 `.app` 未通过 `notarytool` 公证。首次启动时 macOS Gatekeeper 会拦截，用户需手动在「系统设置 → 隐私与安全性」中放行（详见 [`docs/macos-bypass-guide.md`](docs/macos-bypass-guide.md)）。CI 配置与 entitlements 已为后续切换公证预留。
- 不接入 Sparkle / 任何自更新机制：未公证 .app 走自更新会触发更严格的 Gatekeeper 检查；当前的 `updater.ts` 是手动「检查 + 下载」模式，不会触发 Gatekeeper 重新校验。

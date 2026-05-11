# Changelog

All notable changes to `@vetta/desktop-app` are documented in this file.

## [Unreleased] — 内测版（未公证）

### Added

- **无感更新（in-place auto-update）**：发现新版本后侧边栏左上角出现下载图标，点击触发后台静默下载（不打开浏览器、不打开 Finder），下载完成后弹出"立即重启 / 稍后"对话框；点稍后则保留下载产物，下次启动会再次提示。三平台均支持：mac 解压 `.zip` 内的 `.app`、清 quarantine 后通过 detached shell 覆盖 `/Applications/Vetta.app` 并 relaunch；win 走 NSIS `/S` 静默安装 + `--force-run` 自启动；linux 覆盖 `$APPIMAGE` 指向的文件后 relaunch。启动时自动 `GET /releases/latest?platform=&arch=` 检查一次，命中新版本（按三段式版本号比较）即激活 sidebar icon。下载产物写到 `app.getPath("userData")/updates/<version>/`，pending-install.json 记录"待重启"状态，文件丢失时自动重置。客户端按 platform/arch + 平台首选扩展名（mac `.zip` / win `.exe` / linux `.AppImage`）从 `assets[]` 里挑资产；未匹配平台或后端未上传对应资产时返回友好错误。配套发版资产规范见 `docs/release-guide.md`。

- **侧边栏会话默认折叠**：项目展开后默认只显示前 5 个 session，超过则底部出现「展开更多（N）」按钮；点击展开全部后按钮变为「折叠会话」，再次点击恢复 5 个。避免项目下 session 过多时一次性渲染导致的卡顿。

### Fixed

- **侧边栏无法拖拽收缩**：两层原因叠加导致 `ResizeHandle` 完全失效——(1) `ResizeHandle` 用 `translate-x-1/2` 让 5px 命中区域骑在 `<aside>` 右边缘，但 `<aside>` 与外层 `motion.div` 都是 `overflow-hidden`，外侧那 2.5px 被裁切；(2) 更关键的是 `styles.css` 中 `.sidebar-surface > *` 对 sidebar 所有直接子元素强制 `position: relative; z-index: 1`，把 ResizeHandle 的 `absolute z-30` 直接覆盖回 relative，导致它沦为 flex 流末尾的普通块、`right-0` 完全失去意义、根本拦不到拖拽。修复：把这条规则改为 `:not(.absolute)`（保留对玻璃质感 `::before` 的层级压制能力，但放过绝对定位子元素），同时把 `ResizeHandle` 改为完全位于父容器内部、宽度 6px，hover/active 高亮提升至 `primary/40`、`primary/60`。侧边栏宽度持久化到 `localStorage[vetta-sidebar-width]`，仅在拖拽结束时落盘。

- **导入项目后打开会话报 EPERM**：批量项目的 `.vetta/task-states.json:sessionPath` 与 session JSONL 首行的 `cwd` / 历史 tool_call 内嵌的文件路径都是绝对路径；跨机器或跨 workspace 导入时这些路径仍指向原项目根，导致 `SessionManager.open` 在 mkdir 旧 sessions 目录时报 `EPERM: operation not permitted`。修复：导入解压完成后，对 `.vetta/task-states.json` 与 `.vetta/sessions/*.jsonl` 做 path-rewrite——递归扫描 JSON / JSONL 中的字符串值，把以 manifest.originalPath 开头的绝对路径前缀替换成新项目根，并按目标平台规则化分隔符（macOS `/` ↔ Windows `\`）。重写策略保守：只匹配"完整等于"或"以原根 + 分隔符开头"的字符串，不影响指向原机器其它资源的外部绝对路径。

### Added

- **项目导入 / 导出**：项目详情页右上角新增「导出」按钮，点击二次确认后通过原生保存对话框输出 `<项目名>.vetta.zip`，包内含 `_vetta-export.json` manifest（format/version/type/name/originalPath/exportedAt）+ 项目目录全量内容（.vetta/sessions、batch 任务工作目录与 task-states.json 等），自动剔除 `*.lock` 文件锁与符号链接。侧边栏「新建项目」下拉菜单新增「导入项目」入口，原生打开对话框只接受 `.zip`，命中非本应用导出的 zip / 损坏的 zip / 缺失 manifest 时统一报「不支持的项目」。导入路径走 `desktop-config.json` 单一注册路径并解决重名（自动追加 `-2`/`-3`），导入完成后联动刷新普通与批量两个 atom 列表，提供「查看项目」直跳。仅支持 `normal` 与 `batch` 两种类型，flowing/schedule 类型在导出端自检拒绝、导入端 manifest 校验拒绝。Batch 项目导入后会扫描 `meta.json:items[].sourcePath`，对本机不存在的源路径以模态形式列出，便于用户后续重链或删除（不修改 meta，保留原路径以支持回链）。导入解压前对每条 zip 条目做 path-traversal 校验（zip slip 防护），失败时回滚已解压目录。

### Changed

- **批量项目改由 `desktop-config.json:projects` 单一注册**：批量项目以前完全靠扫描 `workspacePath` 子目录的 `.vetta/meta.json` 自动发现，导致用户切换 `workspacePath` 后已有批量项目从侧边栏消失。重构后批量项目与普通项目共用同一注册入口（绝对路径写入 `projects` 数组），workspace 仅作为迁移源——`discoverBatchProjects` 启动时仍会扫描 workspace，把未注册的 `type:"batch"` 目录幂等回填进 config，老安装无感升级。`createProject` 写盘后追加注册，`deleteProject` 删盘前先反注册（双向最终一致）。`useBatchTasks` 在 create/delete 后联动刷新 `useProjects` 的项目原子，避免新建/删除批量项目后侧边栏其它分组数据陈旧。`ProjectsPanel` 同步过滤掉 `type:"batch"` 的普通项目条目，保证批量分组与普通分组不重复渲染。

### Fixed

- 修复 desktop-app 开发模式不会写入可直接执行的 `vettaAppPath` 的问题；开发启动时会自动生成本地 CLI shim，并让 `vettaAppPath` 与生产模式一样指向单一可执行入口。
- 修复同一 desktop-app 进程内重复打开同一 session 时抛 `SessionLockError` 的问题。`RuntimeHost.createSession` 现在按 sessionPath 去重，已开的 session 直接复用 handle，不再二次申请文件锁；`renameSession` / `renameSessionById` / `deleteSession` 不再泄漏 SessionManager 与孤儿 `.lock` 文件；`WebContents` 销毁时会通过新增的 `disposeAllSessions()` 释放本进程持有的全部 session 文件锁。新增 `vetta:session:dispose` IPC 通道与 `window.vetta.session.dispose(sessionId)`，供 renderer 在关闭/切换 session 时主动归还锁。

### Added

- **HTML 转 PDF 命令行入口**：desktop-app 新增 `--html-to-pdf` / `pdf html-to-pdf` CLI 模式，使用内置 Electron Chromium 将 HTML 文件渲染为 PDF，并支持 `-h` / `--help`、`--output`、`--page-size` 与页边距参数，以及 JSON stdout 协议；packaged 启动时会向 `desktop-config.json` 写入 `vettaAppPath`，供独立进程发现桌面端可执行文件。
- **对话回答外层折叠**：桌面对话页现在会记录每轮 assistant 回答的起止时间，并在回答完成后自动折叠中间过程，只保留最后一次工具调用 / 思考后的结论文本；折叠提示支持“正在处理 Ns”的流式状态和“展开 / 收起 N 条内容”的完成态。

- **可配置的 Electron 打包入口**：desktop-app 新增统一的 `dist:desktop` 打包脚本，并补充 `dist:linux` / `dist:win` / `pack:linux` / `pack:win` 入口；支持通过命令行参数 `--platform`、`--arch`、`--target` 动态指定目标平台、架构与安装包格式，并为 Linux 提供 `dist:linux:appimage` / `dist:linux:deb` / `dist:linux:rpm` / `dist:linux:tar.gz`，为 Windows 提供 `dist:win:nsis` / `dist:win:portable` / `dist:win:zip` 快捷命令。Linux 打包前会校验 `packages/runtime-core/sandbox/linux/<arch>/bwrap` 是否齐备，避免产出缺少对应沙盒二进制的安装包。
- **Windows 前置依赖构建**：desktop-app 新增 `prepare:windows`，在 Windows 主机上会先执行仓库根目录的 [`scripts/build.ps1`](C:/yiyun/vetta-mono/scripts/build.ps1) `desktop` 目标，再启动 `dev` / `start` 或进入打包链；非 Windows 主机自动跳过，避免 Electron 开发和打包时缺少上游依赖产物。
- **Windows 沙盒资源打包与显式路径解析**：desktop-app 打包阶段现在会将 `packages/runtime-core/sandbox/bin` 整体复制到安装包 `Resources/sandbox/windows/`，并由主进程新的 Windows sandbox resolver 从 `process.resourcesPath/sandbox/windows/codex-windows-sandbox-host.exe` 解析 host 路径后显式注入 `RuntimeHost`。这样安装包与开发环境统一走 Electron `extraResources` 模型，不再依赖源码目录猜测路径。
- **Linux 沙盒内置 `bubblewrap` + 启动期能力探测**：desktop-app 主进程在应用启动阶段执行 Linux sandbox probe，区分 `binary_not_found` / `binary_not_executable` / `userns_unavailable` 等失败原因，并通过 `config.get()` 向 renderer 暴露 `linuxSandbox` 运行时状态；`session` IPC、scheduler 和 batch tasks 在请求 `sandbox` 模式前统一校验该状态，避免静默降级为 `full-access`。`prepare-pack.js` 同时预留了将 `packages/runtime-core/sandbox/linux/<arch>/bwrap` 打入安装包 `Resources/sandbox/linux/<arch>/bwrap` 的资源路径。
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

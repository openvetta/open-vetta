## Why

目前 `im-gateway` 是独立的 Go 二进制，需要用户自己编译/安装、写 yaml、申请飞书凭据并通过 CLI 启动。这对非技术用户是难以逾越的门槛——只装 `desktop-app` 的人无法在飞书里跟自己的 coding-agent 对话。

我们需要让用户**只装一个 `Vetta.app`**就能开启飞书桥接：在桌面设置页里勾选启用、填入飞书 App 凭据、保存即可开始接收消息；关闭桌面应用后桥接也随之停止（隐私边界与生命周期保持一致，已在前期 explore 中确立）。这一切必须在 macOS / Windows / Linux 三端可用。

## What Changes

- **BREAKING（im-gateway）**：im-gateway 不再以独立 daemon / CLI 形式部署。生命周期严格 ⊆ desktop-app 主进程；不再读取 `~/.vetta/im-gateway/config.yaml`、`credentials.yaml`、不再注册 launchd / systemd unit；CLI 子命令 `start/init/status/logs` 降级为开发调试入口。
- **BREAKING（im-gateway 配置加载）**：移除 yaml + 环境变量 + 自管 keychain 的多源配置加载，改为「由 desktop-app 父进程通过启动参数 / stdio JSON 注入」单一来源。
- desktop-app 新增 **IM 桥接设置页**（`Settings → IM 集成`），支持：
  - 总开关：是否开启 IM 桥接
  - 飞书子配置：App ID / App Secret / （可选）Verification Token / Encrypt Key / 长连接模式
  - 连接状态卡片：实时显示 transport 在线/离线、最近错误、活跃 session 数
  - 操作按钮：测试连接、查看实时日志、重启桥接
- desktop-app 主进程新增 **IM Host capability**：把 `im-gateway` 二进制作为 sidecar 子进程管理（spawn / 健康检查 / 崩溃自动重启 / 日志聚合 / 优雅关闭随主进程退出）。
- desktop-app 新增 **凭据安全存储**：飞书 App Secret 等敏感字段通过 Electron `safeStorage` API 加密，明文不落盘（macOS Keychain / Windows DPAPI / Linux libsecret）。
- desktop-app 新增 **跨平台二进制打包**：CI 交叉编译 `im-gateway-{darwin-arm64,darwin-x64,linux-x64,linux-arm64,win-x64}.{,exe}`，通过 electron-builder `extraResources` 按 arch 进入 `.app` / `.exe` / `.AppImage`，运行时以 `process.resourcesPath` 定位。macOS 公证、Windows 代码签名随主程序一并完成。
- im-gateway 端新增 **embedded 协议**：通过启动参数 `--embedded`（或新的 `host` 子命令）从 stdin/IPC 读取 `{ feishu: { appId, appSecret, ... }, projects: [...], state: {...} }` 配置帧；日志改写 stdout NDJSON 由父进程消费；状态变更通过 stdout 事件帧上报；session 路由表 (`state.json`) 不再自管，由 desktop-app 持久化并在每次启动时注入。

## Capabilities

### New Capabilities

- `desktop-im-host`：desktop-app 侧的 IM 桥接宿主能力——sidecar 进程管理、跨平台二进制定位、凭据安全存储、设置 UI、连接状态展示、与 im-gateway 的 stdio 协议对接。

### Modified Capabilities

- `im-gateway`：生命周期、配置加载、状态持久化、CLI 入口语义全部改写，新增 embedded 启动模式与 stdio 控制协议，删除独立 daemon 形态相关条款。

## Impact

- **代码**：
  - `packages/desktop-app/src/main/`：新增 `im-host/`（sidecar manager、binary resolver、credential store、stdio protocol、status broadcaster）；扩展 `ipc/` 暴露 `vetta:im:*` IPC handler；扩展 `tray-manager.ts` / `window-manager.ts` 与 IM 状态联动。
  - `packages/desktop-app/src/renderer/domains/settings/components/`：新增 `ImBridgeSettings.tsx` 及子组件，挂入 `SettingsPage.tsx` 导航。
  - `packages/im-gateway/cmd/im-gateway/`：新增 `host` 子命令（embedded 模式入口）。
  - `packages/im-gateway/internal/config/`：移除 yaml/credentials/env loader，新增 stdio config frame 解析。
  - `packages/im-gateway/internal/state/`：从「自写 state.json」改为「从父进程注入 + 变更上报」。
  - `packages/im-gateway/internal/projects/`：从「读 desktop-config.json」改为「父进程注入 + 热刷新通过事件」。
- **构建/打包**：
  - `packages/desktop-app/scripts/prepare-pack.js` 与 `electron-builder.json`：增加 `extraResources` 条目，按 arch 拷贝对应 im-gateway 二进制。
  - 新增根级 / `packages/im-gateway/Makefile` 目标 `cross-build`，输出多 arch 二进制到 `packages/im-gateway/dist/`，供 desktop-app 打包前消费。
  - GitHub Actions / CI：新增 Go cross-compile job，作为 desktop-app `dist:*` 任务的前置依赖。
- **配置/数据迁移**：
  - 旧版本 `~/.vetta/im-gateway/{config,credentials,state}.yaml/json` 不再被读取；首次启动新版 desktop-app 时若检测到这些文件，提示用户「检测到旧版 im-gateway 配置，是否导入到新设置」，导入后归档。
- **依赖**：desktop-app 新增对 Electron `safeStorage` 的使用（已有 API，无新依赖）；可选引入跨平台子进程管理工具，否则用原生 `child_process`。
- **OS 兼容**：必须验证 macOS（arm64 + x64）、Windows 11、主流 Linux 发行版（Ubuntu / Fedora，X11 + Wayland）下 sidecar 启动、safeStorage 行为、托盘图标可用性。

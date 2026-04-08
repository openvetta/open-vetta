## Context

`im-gateway` 已实现飞书长连接 + 命令路由 + 进程池 + 事件桥接，但部署形态是独立 Go 二进制 + yaml 配置 + CLI。非技术用户安装门槛过高。前期 explore 已经确立四条原则：

1. **生命周期不变量**：im-gateway 生命周期严格 ⊆ desktop-app 生命周期。完全退出 desktop-app（含托盘）后，IM 桥接必须停止。
2. **隐私边界**：用户主动完全退出即停止工作，不允许后台残留。
3. **打包优先**：im-gateway 二进制随 `.app` 一起分发（macOS 公证 / Windows 签名一并完成），不走运行时下载。
4. **托盘常驻**：窗口关闭 ≠ 退出，main process 与 sidecar 跟随托盘存活。

本设计在这四条原则之上，定义 desktop-app 与 im-gateway 之间的「宿主-嵌入」关系，并补齐设置 UI、跨平台打包、凭据安全存储三块缺失能力。

涉及人员：desktop-app 维护者、im-gateway 维护者、CI/打包流水线维护者。

## Goals / Non-Goals

**Goals:**

- 用户「装一个 `Vetta.app` → 打开设置 → 启用飞书 → 填凭据 → 保存」即可完成所有部署，无需命令行、无需手动安装任何组件。
- macOS（arm64 + x64）、Windows 11（x64）、主流 Linux 发行版（x64 + arm64）三端体验一致。
- im-gateway 不再依赖任何文件系统配置；所有运行时数据由 desktop-app 注入或承载。
- 飞书 App Secret 等敏感字段在静态存储时被 OS 级密钥服务加密。
- desktop-app 完全退出后，没有任何 im-gateway 进程残留，也不会接收任何飞书事件。
- im-gateway sidecar 崩溃时，desktop-app 能感知、上报状态、按退避策略自动重启。
- 设置页支持启用/禁用桥接、切换凭据、测试连接、查看实时日志、查看连接状态。

**Non-Goals:**

- 不在本变更中支持「desktop-app 关闭后继续接收消息」的 daemon 模式（与原则 1 冲突）。
- 不在本变更中支持飞书以外的 IM 平台（设计上保留 transport 抽象与 UI 扩展点，但不实现 Telegram / 钉钉 / 企业微信）。
- 不在本变更中实现群聊路由、附件、消息卡片高级交互等飞书能力扩展（沿用现 spec 的 Non-Goals）。
- 不在本变更中实现 IM 设置的多账号 / 多租户管理（仅支持单一飞书 App）。
- 不实现「自动更新 sidecar 二进制」的独立通道；版本永远跟随 `.app` 整体升级。
- 不在本变更中迁移 desktop-app 的 UI 用 coding-agent 调用方式（即 desktop UI 自身仍按现有路径调 coding-agent，不强制走 sidecar 化重构；本变更只关心 im-gateway sidecar）。

## Decisions

### D1: im-gateway 以 Electron sidecar 子进程方式运行，不走 in-process

**决定**：desktop-app main process 通过 `child_process.spawn` 启动 im-gateway 二进制，stdio 走 NDJSON 控制协议；im-gateway 仍是独立 Go 进程。

**理由**：
- im-gateway 是 Go 编写，无法直接 import 进 Node。
- 即便重写为 Node，sidecar 形态对应当前 spec 的「lockfile 互斥 + 进程池 LRU + 崩溃隔离」设计；in-process 会破坏这些不变量（已在 explore 中分析过）。
- sidecar 崩溃只影响 IM 通道，不会拖垮 desktop UI。

**替代方案**：用 cgo / wasm 把 Go 代码嵌入 Node — 复杂度爆炸，被否决。

### D2: 二进制随 .app 打包，按 arch 选取

**决定**：CI 交叉编译 5 个目标产物 `im-gateway-{darwin-arm64,darwin-x64,linux-x64,linux-arm64,win-x64.exe}`，全部进入 `electron-builder` 的 `extraResources`；运行时根据 `process.platform` + `process.arch` 拼出实际路径，定位到 `process.resourcesPath` 下。

**理由**：
- 引导式下载会触发 Gatekeeper / SmartScreen 拦截，对非技术用户致命。
- 绑定打包让 sidecar 跟主程序享受同一份签名 / 公证。
- 版本错配问题消失（sidecar 版本恒等于 .app 版本）。

**Trade-off**：单平台 .app 体积 +15~25MB；按 arch 出 dmg / exe 可避免「一份包含全部 arch」的浪费。

### D3: 凭据通过 Electron `safeStorage` 存储

**决定**：飞书 App Secret、Verification Token、Encrypt Key 等敏感字段使用 `safeStorage.encryptString` 加密后写入 `~/.vetta/desktop-app/im-credentials.enc`（chmod 0600）；非敏感配置（启用开关、App ID、transport mode）以明文 JSON 存于 `~/.vetta/desktop-app/im-config.json`。im-gateway 启动时由 desktop-app 解密后通过 stdio 注入，im-gateway 自身永远不接触密钥服务、永远不读盘。

**理由**：
- `safeStorage` 跨平台：macOS Keychain（账户级）、Windows DPAPI（用户级）、Linux libsecret/kwallet（如可用，否则降级为 plain text 并警告）。
- 把所有密钥访问集中在 desktop-app 一处，im-gateway 减少攻击面。
- 注入式启动 → 卸载 .app 后没有残留密钥需要清理（除了 `~/.vetta/`，可在卸载文档中说明）。

**Linux 降级行为**：当 `safeStorage.isEncryptionAvailable()` 为 false 时，UI 提示「当前 Linux 桌面环境未提供密钥服务，凭据将以受限权限明文存储」，并要求用户显式确认；存储路径权限强制 0600。

**替代方案**：第三方 `keytar`（已废弃）、自建 AES-GCM + 派生密钥保存到 keychain — 都比 safeStorage 复杂且无收益。

### D4: im-gateway 启动模式新增 `host`，CLI 子命令降级为开发入口

**决定**：im-gateway 新增 `host` 子命令作为 embedded 模式入口；现有 `start/init/status/logs` 子命令保留但**不在用户部署路径上**，仅供开发者调试。`host` 模式的关键差异：

- 不读取任何文件系统配置（yaml / credentials / state.json / desktop-config.json）。
- 启动后立即从 stdin 读取首帧 `init` 控制消息：包含 feishu 配置、project 列表、route state。
- 状态变更（route 写入、health 状态、错误）通过 stdout NDJSON 事件帧上报。
- 日志通过 stdout 的 `log` 事件帧上报，不再写文件。
- 信号处理简化：收到 stdin EOF 或父进程发送的 `shutdown` 控制帧后走优雅关闭路径。

**理由**：保留 `start` 子命令让 im-gateway 包仍可独立编译/单元测试，开发者可以脱离 desktop-app 调试 transport / router；同时让用户路径上只有「embedded」一种语义。

**stdio 协议草案**（详细字段在 spec.md 定义）：

```
父→子（stdin，每行一个 JSON 对象）：
  { "type": "init", "feishu": {...}, "projects": [...], "state": {...} }
  { "type": "config_update", "feishu": {...} }
  { "type": "projects_update", "projects": [...] }
  { "type": "shutdown" }

子→父（stdout）：
  { "type": "ready", "version": "...", "transport": "feishu" }
  { "type": "log", "level": "info|warn|error", "msg": "...", "fields": {...} }
  { "type": "status", "transport": "online|offline|connecting", "lastError": "..." }
  { "type": "state_patch", "userId": "...", "projectId": "...", "sessionPath": "..." }
  { "type": "metric", "name": "active_sessions", "value": 3 }
```

stderr 仅用于无法恢复的 panic 信息；正常运行不输出 stderr。

### D5: 路由表 (`state.json`) 由 desktop-app 持久化

**决定**：im-gateway 不再自管 `~/.vetta/im-gateway/state.json`。运行时路由表存在 im-gateway 内存中；每次变更通过 `state_patch` 事件上报；desktop-app 收到后写入 `~/.vetta/desktop-app/im-state.json`（沿用现有 atomic-write 模式）；im-gateway 启动时由 `init` 帧注入完整快照。

**理由**：原则 1 要求所有持久化集中在 desktop-app；这样卸载 desktop-app 时清理路径单一；测试 im-gateway 不需要 mock 文件系统。

**Trade-off**：每次路由变更多一次 IPC 往返。可接受，路由变更是低频事件（用户切项目时才发生）。

### D6: 项目目录由 desktop-app 注入而非读 desktop-config.json

**决定**：im-gateway 内部 `ProjectDirectory` 接口保留，但 `desktopConfigDirectory` 实现被替换为 `injectedDirectory`，由 `init` / `projects_update` 帧填充。desktop-app 在自身的项目列表（已是它的一等数据源）变更时，主动推一次 `projects_update`。

**理由**：im-gateway 之前从 `~/.vetta/desktop-config.json` 读取是为了「跟桌面端共享真相」；现在桌面端就是父进程，直接注入更直接，也避免双方都独立解析 JSON 引发的并发问题。

### D7: 设置 UI 结构与导航

**决定**：在 `SettingsPage.tsx` 已有的导航中追加「IM 集成」分项，对应 `ImBridgeSettings.tsx`。页面分三个 SettingSection：

1. **总开关**：启用 / 禁用 IM 桥接。禁用时 sidecar 立即被父进程优雅关闭并清理状态卡片。
2. **飞书配置**：App ID、App Secret（密码框 + 显隐切换）、Verification Token（可选）、Encrypt Key（可选）、长连接模式选择（首期固定为「长连接」，下拉但仅一项，为未来 webhook 模式预留）。提供「测试连接」按钮：触发一次性的临时握手验证 token，结果即时回显，不影响当前运行中的桥接。
3. **状态与日志**：实时显示 transport 状态（在线/离线/连接中/错误）、最近一次错误（带时间戳）、活跃 session 数；按钮「重启桥接」「查看实时日志」（弹出抽屉，从父进程内存日志缓冲拉最近 N 条）。

**输入校验**：App ID / App Secret 必填且非空白；保存时执行客户端校验，失败禁用保存按钮并提示。

**Renderer ↔ Main IPC 端点**（详细 schema 在 spec.md）：

```
vetta:im:get-config           → 返回明文非敏感字段 + 「已配置 secret」布尔标志
vetta:im:set-config(payload)  → 持久化、加密 secret、按需重启 sidecar
vetta:im:get-status           → 当前 transport 状态快照
vetta:im:subscribe-status     → 订阅状态推送（renderer 用 EventEmitter / channel）
vetta:im:test-connection      → 不影响主桥接的临时连接验证
vetta:im:restart              → 优雅关闭并重启 sidecar
vetta:im:get-recent-logs      → 拉取最近 N 条日志缓冲
```

### D8: sidecar 生命周期与崩溃恢复

**决定**：

- desktop-app main process 启动完成后，若设置中 `imBridgeEnabled === true` 且飞书凭据完整，则自动 spawn sidecar；否则不启动。
- sidecar 健康判定：从 spawn 到收到首条 `ready` 事件计时，超过 10s 视为启动失败；进入 backoff 状态，5s / 15s / 60s（指数上限）后重试，连续失败 5 次后停止重试并把状态置为 `error`，等待用户手动「重启桥接」。
- sidecar 异常退出（非 main 主动 shutdown）触发同样的 backoff 重启策略。
- main process 监听 Electron `before-quit`：先发送 `shutdown` 控制帧，等待 sidecar 在 5s 内退出，超时则 `kill -SIGTERM`，再超时（再 2s）`kill -SIGKILL`。**必须保证 main 退出时 sidecar 已死，不允许孤儿进程。**
- Windows 上无法用 SIGTERM；改用 `child.kill()`（Node 在 win32 下等价于 `TerminateProcess`），但 sidecar 仍要处理 stdin EOF 作为优雅关闭信号——这是首选路径。

### D9: 跨平台二进制路径解析

**决定**：在 `packages/desktop-app/src/main/im-host/binary-resolver.ts` 内统一解析：

```
const platform = process.platform;          // 'darwin' | 'win32' | 'linux'
const arch = process.arch;                  // 'arm64' | 'x64'
const ext = platform === 'win32' ? '.exe' : '';
const name = `im-gateway-${platform}-${arch}${ext}`;
const base = app.isPackaged
  ? path.join(process.resourcesPath, 'im-gateway')
  : path.join(__dirname, '../../../../im-gateway/dist');
const binaryPath = path.join(base, name);
```

打包前（`prepare-pack.js`）调用 `make -C packages/im-gateway cross-build` 产出全部目标二进制到 `packages/im-gateway/dist/`；electron-builder 的 `extraResources` 把整个目录搬到 `Contents/Resources/im-gateway/`。运行时仅装载当前 platform/arch 对应那一份。

**Trade-off**：dmg / exe 包内会存在「不会被本平台用到」的二进制残留——可以通过为每个目标 arch 单独 build dmg/exe 来消除（electron-builder 原生支持 `--<arch>` 参数）。本变更默认走「单平台单 arch 包」路线。

### D10: 配置热更新 vs 重启

**决定**：

| 字段变化 | 行为 |
|---|---|
| 启用开关 false → true | spawn sidecar，注入 init |
| 启用开关 true → false | 发 shutdown，清理状态 |
| 飞书凭据变更 | 触发 sidecar 重启（凭据是 transport 启动参数，热更新不安全） |
| 项目列表变更 | 推 `projects_update`，无需重启 |
| 路由表变更 | 双向 patch，无需重启 |

**理由**：飞书 SDK 长连接客户端无法在不重连的情况下切换凭据；与其搞局部重连，不如冷重启更可靠。

### D11: macOS 暂不公证，分发以「内测」语义对外

**决定**：本期 **不启用** macOS 公证流程。打包产物为「已 codesign（如有 Developer ID）但未 notarize」的 dmg / .app。CI / `prepare-pack.js` 仍按规范放置 sidecar、写好 entitlements、保留 `notarize` 配置占位字段为 `null`，便于后续切换。

**理由**：

- 公证流程首次配置 + sidecar 一并签名 + 三端 E2E 至少 3-5 个工作日成本，且每次 Apple 工具链改动都可能引入新坑；产品当前阶段优先验证业务逻辑，不应被基础设施阻塞。
- 当前用户群体限定为「愿意按文档操作的种子用户」，可以接受手动绕过 Gatekeeper。
- 公证不是不可逆操作——架构层面无影响，只要 entitlements 与 sidecar 路径预留好，将来切换公证 = 改 CI secrets + electron-builder 一行配置。

**约束（必须随之做的事）**：

- 下载页 / README 必须明确写「本版本未公证，首次打开请按以下步骤手动放行」+ 步骤图示。注意 macOS 15+ 已无右键「仍然打开」按钮，必须进入 系统设置 → 隐私与安全性 → 仍要打开，整个流程约 8 步。
- 提供命令行救急方案：`sudo xattr -rd com.apple.quarantine /Applications/Vetta.app`（一行解决）。
- **不接入 Sparkle / 任何自更新机制**：未公证 app 走自更新会触发更严的 Gatekeeper 检查；只支持「下载新版手动重装」。
- CHANGELOG 与产品页明确标注「内测 / 早期访问」，避免用户因「无法验证开发者」对话框产生信任流失。
- Windows / Linux 不受此决定影响：Windows 未签名只是 SmartScreen 警告但有「仍要运行」按钮；Linux 无类似机制。

**未来切换公证的触发条件（产品 milestone）**：

- 用户群体从种子用户扩展到公开发布
- 累计安装量达到目标阈值（待定）
- 团队认定基础设施投入回报为正

**替代方案**：

- 改用 Homebrew Cask 分发（`brew install --cask vetta`）：cask 自动 strip quarantine，体验干净。可作为本期的额外可选发布渠道，但不强制。
- 走 Mac App Store：30% 抽成 + 沙盒限制对 sidecar 模式不友好，**否决**。

## Risks / Trade-offs

**Risk 1**：Linux 上 `safeStorage.isEncryptionAvailable()` 返回 false 的发行版（无 libsecret / kwallet）。  
→ Mitigation：UI 显式告警 + 写入文件强制 0600 + 文档建议安装 `libsecret-1-0`。不阻塞使用。

**Risk 2**：macOS 公证流程把 sidecar 二进制视为外部可执行物，需要 entitlements 允许执行。  
→ **本期不启用公证**（详见 D11）。仍然预先在 entitlements.plist / electron-builder 配置里把 sidecar 路径与必要 entitlements 占位写好（`com.apple.security.cs.allow-jit` / `allow-unsigned-executable-memory` 等），为后续切换公证留接口；CI 不调用 notarytool。用户首次打开未公证 .app 时按文档手动放行。

**Risk 3**：Windows 上 sidecar 无 SIGTERM，main 退出但 sidecar 未及时收到 stdin EOF 的极端情况下可能短暂残留。  
→ Mitigation：sidecar 内启动一个 goroutine 周期检测 stdin 是否可读，stdin 关闭即发起优雅关闭；main 端调用 `child.kill()` 兜底。

**Risk 4**：sidecar 二进制把 .app 体积撑大（每 arch ~15MB）。  
→ Mitigation：默认按 arch 出包，单包只含一份二进制；启用 Go 编译参数 `-ldflags "-s -w"` + UPX（仅 linux/win；macOS 由于未来仍可能切换公证，UPX 兼容性差，不用）。

**Risk 5**：im-gateway 现有依赖 `~/.vetta/im-gateway/` 与 `~/.vetta/desktop-config.json` 的代码删除后，旧版用户的数据需要迁移。  
→ Mitigation：desktop-app 首次启动新版本时检测旧路径，弹出导入向导，导入成功后把旧文件 rename 为 `.bak`；不在迁移失败时阻断启动。

**Risk 6**：用户在多个项目中并发使用导致 sidecar 崩溃影响所有 IM 会话。  
→ Mitigation：进程池 LRU + sidecar 自动重启 + 状态卡片告警；本变更不引入「per-project sidecar」。

**Risk 7**：macOS 用户「合上盖子→飞书消息丢失」体验问题。  
→ 这不是本变更的目标（明确写在 Non-Goals）；可通过 `powerSaveBlocker` 在 sidecar 运行时阻止系统休眠作为可选项，但默认不启用。

## Migration Plan

1. **阶段 1（im-gateway 内部重构）**：在 im-gateway 仓内新增 `host` 子命令与 stdio 协议代码，保留旧 `start` 子命令的所有现有行为。新增单测覆盖 stdio 协议。
2. **阶段 2（desktop-app 接入）**：实现 `im-host` 主进程模块、设置 UI、IPC、凭据存储；在 dev 模式下指向本地 `make build` 出的二进制，验证端到端链路。
3. **阶段 3（CI 打包）**：加 Go cross-compile job，打通 `prepare-pack.js → electron-builder extraResources → notarize/sign` 链路；在三平台手动验证可执行。
4. **阶段 4（旧路径清理）**：从 im-gateway 中移除 `config/yaml`、`projects/desktopConfigDirectory`、`state/state.json` 自管代码；移除 `start/init/status/logs` 在用户文档中的露出，仅在 `packages/im-gateway/README.md` 的「开发者调试」段落保留说明。
5. **阶段 5（数据迁移与发布）**：实现旧 `~/.vetta/im-gateway/` 检测与导入向导；CHANGELOG 标 BREAKING；发布 release。

**Rollback 策略**：阶段 1-3 的所有改动都向后兼容（旧 CLI 仍在）；如阶段 4 之后发现严重问题，回滚到阶段 3 状态即可继续以「embedded + 旧 CLI 双轨」运行。阶段 5 一旦发布需要 `~/.vetta/im-gateway/.bak` 配合人工恢复——这是不可逆点。

## Open Questions

1. **OQ1**：是否在设置页支持「打开 im-gateway 实时日志窗口」作为独立 BrowserWindow，还是仅作为抽屉显示最近 N 条？  
   → 本设计选「抽屉显示最近 N 条」简化首期实现；独立窗口可作为后续增强。
2. **OQ2**：sidecar 与 desktop UI 是否共享同一个 coding-agent 进程池？还是 IM 来源的 session 与 UI 的 session 完全解耦？  
   → 共享是更优解（避免同一 session 两个 lockfile 持有者冲突），但需要在 desktop-app 内已有的 coding-agent 调用层做适配。建议留到后续 change 单独处理；本次先让 sidecar 自管子进程池。
3. **OQ3**：是否提供「一键导出 im-gateway 配置 + 日志」用于支持工单？  
   → 留作后续增强，本变更不实现。
4. **OQ4**：macOS 公证启用时机？  
   → 本期不公证（详见 D11）。切换公证需要满足的条件（产品扩张到非种子用户 / 累计安装量阈值 / 团队 ROI 判断）由产品 milestone 决定，不由本变更承担。切换时只需开启 CI 中预留的 notarize 配置，不涉及代码改动。

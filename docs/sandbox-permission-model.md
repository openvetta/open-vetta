# Sandbox Permission Model

本文档说明 Vetta agent 沙箱模式的权限隔离机制、三端后端差异、权限触发路径，以及后续添加权限黑名单/白名单的推荐方式。

## 总体模型

沙箱模式对调用方保持统一入口：

- 调用方只选择 `executionMode = "sandbox"`
- `RuntimeHost` 调用 `buildSandboxToolDefinitions(...)`
- `sandbox-tools.ts` 根据当前平台分发到具体后端：
  - macOS: `macos-seatbelt`
  - Linux: `bubblewrap`
  - Windows: `windows-host`

调用方看到的是统一的 `read`、`write`、`edit`、`shell` 工具。平台差异封装在 `packages/runtime-core/src/execution-mode/` 内。

沙箱隔离分两层：

1. 应用层权限门：在工具执行前判断是否需要询问用户。
2. OS 沙箱层：shell 由平台沙箱后端兜底拦截。`read/write/edit` 当前仍是 Node 进程内文件工具，第一阶段只由应用层权限门和 deny roots 保护；后续 broker 化后再纳入 OS 沙箱兜底。

## 权限触发机制

应用层触发点在 `packages/runtime-core/src/execution-mode/sandbox-tool-utils.ts`。

### read/write/edit

`read`、`write`、`edit` 都有结构化 `path` 参数。

处理逻辑：

1. 如果路径是 `@PATH_0001` 这类路径 ID，跳过直接路径检查，由原工具解析。
2. 如果路径在 workspace root 内，直接放行。
3. 如果路径命中内置敏感 deny roots，直接拒绝，不进入用户确认。
4. 如果路径在 workspace root 外，调用 `ctx.ui.confirm(...)` 触发用户授权。
5. 用户拒绝时，工具失败。
6. 用户允许时，本次工具调用继续执行。

workspace 边界检查在 `workspace-guard.ts` 中完成，包含 symlink-aware 的边界解析。

### shell

`shell` 没有结构化路径参数，所以先做命令预检。

当前识别这些写文件模式：

- `>`
- `>>`
- `&>`
- `2>`
- `2>>`
- `tee file`

处理逻辑：

1. 从 shell 命令中提取可能写入的目标路径。
2. 如果目标在 workspace 或临时目录内，直接放行。
3. 如果目标命中内置敏感 deny roots，直接拒绝，不进入用户确认。
4. 如果目标在 workspace 外，触发用户授权。
5. 用户拒绝时，命令不执行。
6. 用户允许时，生成一次性 grant，并把 grant 传给对应平台沙箱后端。

一次性 grant 在 `sandbox-permissions.ts` 中通过 `AsyncLocalStorage` 绑定当前工具调用，避免并发 shell 调用串权。

## Desktop 授权 UI

desktop-app 中，`RuntimeHost` 将 `ctx.ui.confirm(...)` 转换为 `RuntimeUserConfirmationRequest`。

链路如下：

1. sandbox 工具触发 `ctx.ui.confirm(...)`
2. `RuntimeHost` 生成确认请求
3. desktop main 通过 IPC 发送给 renderer
4. renderer 在 AI Input 上方的抽屉卡片展示权限请求
5. 用户点击“允许本次操作”或“拒绝”
6. renderer 通过 IPC 回传结果
7. runtime 继续或拒绝当前工具调用

该 UI 不使用全局 dialog，而是靠输入区的 `DrawerCard` 展示，以便授权动作贴近 agent 输入和执行上下文。

## 三端隔离方式

### macOS

实现文件：`macos-seatbelt-tools.ts`

后端：`sandbox-exec`

执行方式：

- 为每次 shell 调用生成临时 `.sb` profile
- 通过 `sandbox-exec -f profile.sb <shell> ...` 执行命令

默认策略：

- `deny default`
- 允许基础进程能力
- 允许文件读取
- 显式禁止读取敏感目录
- 只允许 workspace、临时目录、一次性 grant 目录写入
- 不允许网络，因为没有配置 `allow network*`

macOS 当前敏感读取黑名单：

- `~/.ssh`
- `~/.aws`
- `~/.gnupg`
- `~/.kube`
- `~/.docker`
- `~/.config/gcloud`
- `~/Library/Keychains`
- `~/.vetta`
- `~/.pi`

### Linux

实现文件：`linux-bwrap-tools.ts`

后端：`bubblewrap`

默认策略：

- `--unshare-net` 隔离网络
- `/usr`、`/bin`、`/sbin`、`/lib`、`/lib64`、`/etc` 只读挂载
- workspace 可写挂载
- `/tmp` 使用 tmpfs
- `HOME` 指向沙箱内 `/tmp/vetta-home`
- 一次性 grant 目录通过 `--bind` 加入可写挂载

Linux 当前没有域名级网络策略。网络隔离是整体禁用网络 namespace。

### Windows

实现文件：`windows-sandbox-tools.ts`

后端：`codex-windows-sandbox-host.exe`

默认参数：

- `--backend auto`
- `--policy workspace-write`
- `--policy-cwd <cwd>`
- `--cwd <cwd>`
- `--temp-root <per-call temp root>`
- `--network none`
- `--read-root <cwd>`
- `--write-root <cwd>`
- `--deny-read-path <denyRoot>`
- `--deny-write-path <denyRoot>`

一次性 grant 会追加：

- `--read-root <grantRoot>`
- `--write-root <grantRoot>`

Windows desktop-app 启动期会读取 `--capabilities --json`，并执行主动 probe 验证 workspace 写入、workspace 外拒写、temp-root 写入、deny-write/deny-read 等能力。probe 未通过时，`executionMode = "sandbox"` 不会静默降级为 `full-access`，而是拒绝创建或切换会话。

## 当前白名单

当前没有用户可编辑的持久化白名单。白名单是代码级策略和本次授权组合。

默认白名单：

- workspace root
- 临时目录：
  - Node `tmpdir()`
  - `/tmp`
  - `/private/tmp`
- 用户通过授权 UI 批准的一次性 grant root

环境变量白名单：

- macOS: `PATH`, `LANG`, `LC_ALL`, `TERM`
- Linux: `PATH`, `LANG`, `LC_ALL`, `TERM`
- Windows: `PATH`, `SystemRoot`, `COMSPEC`，并将 `TEMP` / `TMP` 重写为本次 shell 调用的隔离 `temp-root`

## 当前黑名单

应用层有统一敏感 deny roots，会在 `read/write/edit` 和 shell 写入预检中先行拒绝。当前包括：

- `~/.ssh`
- `~/.aws`
- `~/.gnupg`
- `~/.kube`
- `~/.docker`
- `~/.vetta/agent`
- `~/.pi`
- macOS 额外包括 `~/.config/gcloud`、`~/Library/Keychains`
- Windows 额外包括 `%APPDATA%/gcloud`、`%APPDATA%/Vetta`

macOS 另有 OS 层敏感读取黑名单，位于 `macos-seatbelt-tools.ts` 的 `sensitiveReadDenyPaths`。Windows shell 会把 deny roots 传给 `codex-windows-sandbox-host.exe` 的 `--deny-read-path` / `--deny-write-path`。Linux 当前主要靠未挂载和应用层 deny；后续可继续同步到 OS 层策略。

## 如何添加白名单

### 临时白名单

推荐给普通用户使用当前授权 UI：

- 点击“允许本次操作”
- 只对当前工具调用有效
- 不持久化

这是最小权限方案。

### 代码级默认白名单

如果确实需要默认允许某些目录，例如 Downloads，需要同时更新应用层和三端后端：

1. `sandbox-permissions.ts`
   - 更新 `isAllowedSandboxPath(...)`
2. macOS
   - 在 `buildMacosSandboxProfile(...)` 的 `writablePaths` 中加入目录
3. Linux
   - 在 `buildLinuxSandboxArgs(...)` 中增加对应 `--bind`
4. Windows
   - 给 sandbox host 追加 `--read-root` / `--write-root`

代码级默认白名单会扩大默认攻击面，必须谨慎评估。

## 如何添加黑名单

推荐先在统一权限层添加，再同步到 OS 沙箱层兜底。

短期做法：

1. 在 `sandbox-permissions.ts` 中增加内置 `denyRoots`
2. 在 `read/write/edit` 路径判断前先检查 deny
3. 在 shell 写入预检中，如果目标命中 deny，直接拒绝，不进入用户确认
4. macOS 同步加入 `sensitiveReadDenyPaths`
5. Linux/Windows 确保 deny 目录不会被默认 bind，也不会被一次性 grant 放开

注意：只在 UI 层 deny 不够。黑名单必须在 OS 沙箱层也能兜底，否则模型仍可能通过未识别的 shell 语法或子进程路径绕过应用层预检。

## 推荐的长期配置模型

建议后续把策略配置化，并保持调用方 API 不变：

```ts
interface SandboxPolicyConfig {
  allowReadRoots: string[];
  allowWriteRoots: string[];
  denyReadRoots: string[];
  denyWriteRoots: string[];
  tempRoot: string;
  allowNetwork: boolean;
}
```

推荐分三层：

1. 内置安全基线
   - 永远 deny，例如 ssh key、keychain、token、agent 配置目录
2. 用户默认白名单
   - workspace、tmp，必要时用户配置 Downloads 等目录
3. 单次授权
   - 通过 AI Input 抽屉确认
   - 只对当前工具调用生效

该模型可以让跨平台后端共享一份策略定义，同时保留各平台自己的 OS 沙箱实现。

## 验收场景

核心回归测试：

```text
请在桌面创建 vetta-sandbox-test.txt。先用 write 工具，如果失败就用 shell：echo "hello" > ~/Desktop/vetta-sandbox-test.txt
```

预期：

- `write` 访问 workspace 外路径时触发授权抽屉
- `shell` 重定向写 workspace 外路径时也触发授权抽屉
- 用户拒绝时文件不会创建
- 用户允许时只本次工具调用获得权限
- 模型不能通过 shell 静默绕过权限系统

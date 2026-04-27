# 主进程目录结构

> `packages/desktop-app/src/main/` 各目录与文件的职责划分。

---

## 顶层文件

| 路径 | 职责 |
|------|------|
| `main.ts` | Electron 入口：`app.whenReady` / 协议注册 / 创建窗口 / 注册全局 IPC（theme/window/tray/auth）/ 初始化 scheduler 与 IM host / `before-quit` 清理 |
| `window-manager.ts` | 创建、缓存、获取主 `BrowserWindow`（`getMainWindow()` / `setMainWindow()` / `createWindow()`） |
| `tray-manager.ts` | 系统托盘（Win/Linux）、关闭行为 |
| `updater.ts` | 自动更新 |
| `runtime.ts` | **进程级共享 `RuntimeHost` 单例**，供 session / scheduler / batch-tasks 复用 |
| `constants.ts` | 常量 |

## 子目录

### `ipc/`

IPC 处理器模块，每个文件负责一组 `vetta:*` 通道：

| 文件 | 通道前缀 | 说明 |
|------|---------|------|
| `session.ts` | `vetta:session:*` | Agent session 生命周期（create/prompt/abort/subscribe …） |
| `settings.ts` | `vetta:settings:*` | `~/.vetta/settings.json` 读写 |
| `fs.ts` | `vetta:fs:*` / `vetta:config:*` / `vetta:models:*` / `vetta:mcp:*` | 项目目录内文件读写、desktop-config、providers、MCP 配置 |
| `flowing.ts` | `vetta:flowing:*` | 流转（workflow）相关 |
| `skills.ts` | `vetta:skills:*` | 技能 |
| `dialog.ts` | `vetta:dialog:*` | 原生对话框 |
| `downloads.ts` | `vetta:downloads:*` | 下载管理 |
| `updater.ts` | `vetta:updater:*` | 自动更新 |
| `im.ts` | `vetta:im:*` | IM 桥接 |
| `scheduler.ts` | `vetta:scheduler:*` | 定时任务 IPC（单独注册，需等 `initScheduler` 完成） |
| `batch-tasks.ts` | `vetta:batch-tasks:*` | 批量任务（独立 teardown） |
| `index.ts` | — | `registerAllIpc` / `teardownAllIpc` 聚合入口 |

**注意**：`scheduler.ts` 与 `batch-tasks.ts` 不在 `registerAllIpc` 内，因为 scheduler 依赖 `await initScheduler()`，必须在 `main.ts` 里单独 `registerSchedulerIpc` / `registerBatchTasksIpc`。

### `scheduler/`

- `scheduler.ts`：基于 `toad-scheduler` 的 cron 调度器，维护 `scheduledJobs: Map<string, CronJob>`
- `task-executor.ts`：执行一条定时任务：`runtime.createSession` → `runtime.subscribe` → `runtime.prompt`，根据 `session.lifecycle` 的 `agent_end` / `aborted` 更新记录
- `task-storage.ts`：任务与执行记录的磁盘持久化

### `batch-tasks/`

- `batch-task-executor.ts`：批量任务执行核心（暂停 / 恢复 / 事件广播）
- `batch-task-state.ts`：单个任务状态
- `batch-task-storage.ts`：项目与任务集合
- `queue.ts`：并发控制 `pLimit`

### `im-host/`

IM 旁路子进程（`im-gateway`）编排：

- `index.ts` → `ImHost` 单例（`getImHost()`），由 `main.ts` 在 `app.whenReady` 调用 `bootstrap()`
- `sidecar-manager.ts` → 子进程生命周期
- `config-store.ts` / `credential-store.ts` / `state-store.ts` / `status-store.ts` / `log-buffer.ts`
- `project-source.ts` → 监听 desktop-config 的项目列表
- `binary-resolver.ts` → 解析打包后的 sidecar 二进制路径
- `migration.ts` → 旧版数据迁移

### `utils/`

- `atomic-write.ts`：`atomicWriteFile` / `atomicWriteJSON`（write-temp → fsync → rename），**所有配置 / 状态磁盘写入必须走这两个函数**
- `workspace.ts`：工作区路径相关

---

## 依赖方向

```
main.ts
  ├─► ipc/* (register/teardown)
  │     └─► runtime.ts (getSharedRuntime)
  ├─► scheduler/* ─► runtime.ts
  ├─► batch-tasks/* ─► runtime.ts
  └─► im-host/* (独立子系统)
```

---

## 命名约定

- 文件名统一 **kebab-case**（`batch-task-executor.ts`、`window-manager.ts`）
- IPC 通道前缀统一 `vetta:<domain>:<action>`，`domain` 对应 `ipc/` 下文件名
- IPC 通道常量定义在各模块的 `const CHANNELS = { ... } as const`，避免魔法字符串

---

## 禁止事项

- ❌ 禁止反向依赖：`runtime.ts` 不得引用 `ipc/`；`utils/` 不得引用业务模块
- ❌ 禁止在 `ipc/*` 中 `new RuntimeHost()`，必须通过 `getSharedRuntime()`
- ❌ 禁止绕过 `atomicWriteJSON` 用 `fs.writeFile` 直接写 JSON 配置
- ❌ 禁止在非 `ipc/` 目录里 `ipcMain.handle`（主入口 `main.ts` 仅保留窗口/主题/托盘类通道）

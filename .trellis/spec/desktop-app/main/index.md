# desktop-app 主进程开发规则

> Electron 主进程（`packages/desktop-app/src/main/`）的开发约定、示例与禁止事项。

---

## 概览

desktop-app 主进程承担以下职责：

- 管理 BrowserWindow、托盘、协议注册、自动更新（`main.ts` / `window-manager.ts` / `tray-manager.ts` / `updater.ts`）
- 通过 `ipcMain.handle` 暴露一组 `vetta:*` IPC 通道（`src/main/ipc/`）
- 托管 Agent 运行时 `RuntimeHost`（`src/main/runtime.ts`），被 session / scheduler / batch-tasks 共享
- 运行定时任务与批量任务（`src/main/scheduler/`、`src/main/batch-tasks/`）
- 管理 IM 旁路子进程（`src/main/im-host/`）

所有与磁盘 / 文件系统 / 外部进程交互的能力必须在主进程实现，渲染进程只能通过 preload 暴露的 `window.vetta.*` 调用。

---

## 文件索引

| 文档 | 说明 | 状态 |
|------|------|------|
| [directory-structure.md](./directory-structure.md) | 主进程目录结构与职责划分 | Done |
| [error-handling.md](./error-handling.md) | IPC / 异步错误处理与参数校验 | Done |
| [logging-guidelines.md](./logging-guidelines.md) | 日志前缀、级别与 LogBuffer | Done |
| [quality-guidelines.md](./quality-guidelines.md) | 代码质量红线与常见错误 | Done |

---

## 必读上下文

- 入口：`packages/desktop-app/src/main/main.ts`
- IPC 注册入口：`packages/desktop-app/src/main/ipc/index.ts`
- 共享 `RuntimeHost`：`packages/desktop-app/src/main/runtime.ts`
- 渲染层类型 `window.vetta`：`packages/desktop-app/src/preload/`

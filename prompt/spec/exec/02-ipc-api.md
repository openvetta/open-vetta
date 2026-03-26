# 实施文档 2：IPC 与 Preload API

## 一、目标

实现主进程与渲染进程的通信接口，包括 IPC Handler 和 Preload API 暴露。

## 二、修改文件

| 文件 | 变更 |
|------|------|
| `main/ipc/dialog.ts` | 添加 `selectFolders` 多选方法 |
| `preload/api.ts` | 添加 `DesktopBatchTasksApi` 类型 + `selectFolders` |
| `preload/index.ts` | 添加 `batchTasks` API + `selectFolders` |
| `main/ipc/index.ts` | 注册 BatchTasksIpc |
| `main/main.ts` | 初始化 BatchTasksIpc |

## 三、dialog.ts 变更

新增 `selectFolders` 方法：

```typescript
ipcMain.handle("vetta:dialog:select-folders", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory", "multiSelections"],
    title: "Select Folders",
  });
  if (result.canceled || result.filePaths.length === 0) return [];
  return result.filePaths;
});
```

## 四、DesktopDialogApi 扩展

```typescript
export interface DesktopDialogApi {
  selectFolder(): Promise<string | null>;
  selectFolders(): Promise<string[]>;  // 新增
  selectImages(): Promise<SelectedImageFile[]>;
}
```

## 五、DesktopBatchTasksApi 类型

```typescript
export interface BatchTask {
  id: string;
  name: string;
  cwd: string;
  status: "pending" | "running" | "paused" | "completed" | "failed";
  sessionId?: string;
  sessionPath?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface BatchProject {
  id: string;
  name: string;
  prompt: string;
  concurrency: number;
  tasks: BatchTask[];
  createdAt: number;
  updatedAt: number;
}

export interface DesktopBatchTasksApi {
  getProjects(): Promise<BatchProject[]>;
  createProject(data: { name: string; prompt: string; folders: string[]; concurrency: number }): Promise<BatchProject>;
  updateProject(projectId: string, data: Partial<{ name: string; prompt: string; concurrency: number }>): Promise<void>;
  deleteProject(projectId: string): Promise<void>;
  
  runTask(projectId: string, taskId: string): Promise<void>;
  pauseTask(projectId: string, taskId: string): Promise<void>;
  resumeTask(projectId: string, taskId: string): Promise<void>;
  deleteTask(projectId: string, taskId: string): Promise<void>;
  
  batchRetryFailed(projectId: string): Promise<void>;
  batchPause(projectId: string): Promise<void>;
  batchResume(projectId: string): Promise<void>;
  batchDelete(projectId: string): Promise<void>;
  
  deleteSession(sessionPath: string): Promise<void>;
  
  onTaskEvent(handler: (event: BatchTaskEvent) => void): () => void;
}

export type BatchTaskEvent =
  | { type: "task.started"; projectId: string; taskId: string }
  | { type: "task.completed"; projectId: string; taskId: string }
  | { type: "task.failed"; projectId: string; taskId: string; error: string }
  | { type: "task.paused"; projectId: string; taskId: string }
  | { type: "task.resumed"; projectId: string; taskId: string };
```

## 六、IPC Handler 设计

### 6.1 IPC 通道

| 通道 | 方法 | 说明 |
|------|------|------|
| `vetta:batch-tasks:get-projects` | GET_PROJECTS | 获取所有项目 |
| `vetta:batch-tasks:create-project` | CREATE_PROJECT | 创建项目 |
| `vetta:batch-tasks:update-project` | UPDATE_PROJECT | 更新项目 |
| `vetta:batch-tasks:delete-project` | DELETE_PROJECT | 删除项目 |
| `vetta:batch-tasks:run-task` | RUN_TASK | 执行任务 |
| `vetta:batch-tasks:pause-task` | PAUSE_TASK | 暂停任务 |
| `vetta:batch-tasks:resume-task` | RESUME_TASK | 恢复任务 |
| `vetta:batch-tasks:delete-task` | DELETE_TASK | 删除任务 |
| `vetta:batch-tasks:batch-retry-failed` | BATCH_RETRY_FAILED | 批量重试失败 |
| `vetta:batch-tasks:batch-pause` | BATCH_PAUSE | 批量暂停 |
| `vetta:batch-tasks:batch-resume` | BATCH_RESUME | 批量继续 |
| `vetta:batch-tasks:batch-delete` | BATCH_DELETE | 批量删除 |
| `vetta:batch-tasks:delete-session` | DELETE_SESSION | 删除会话 |
| `vetta:batch-tasks:event` | EVENT | 事件推送 |

### 6.2 注册位置

在 `main/ipc/index.ts` 中导入并注册：
```typescript
import { registerBatchTasksIpc } from "./batch-tasks.js";
```

在 `main/main.ts` 中初始化：
```typescript
teardownBatchTasksIpc = registerBatchTasksIpc(mainWindow.webContents);
```

## 七、注意事项

- 事件推送通过 `webContents.send` 机制
- 渲染进程通过 `ipcRenderer.on` 订阅
- 返回 `() => void` 用于取消订阅

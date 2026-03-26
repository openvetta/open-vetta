# 实施文档 3：任务执行引擎

## 一、目标

实现基于 AgentLoop 的任务执行引擎，支持任务运行、暂停、恢复、并发控制。

## 二、新增文件

| 文件 | 用途 |
|------|------|
| `main/batch-tasks/batch-task-executor.ts` | AgentLoop 任务执行引擎 |

## 三、batch-task-executor.ts

### 3.1 职责
- 管理任务执行生命周期
- 实现并发控制
- 处理暂停/恢复逻辑
- 发出任务状态事件

### 3.2 核心设计

```typescript
// 并发控制：维护正在执行的任务映射
const executingTasks = new Map<string, {
  projectId: string;
  taskId: string;
  abortController: AbortController;
}>();

// 事件发射器
const taskEventHandlers = new Set<(event: BatchTaskEvent) => void>();

export function emitTaskEvent(event: BatchTaskEvent): void {
  for (const handler of taskEventHandlers) {
    handler(event);
  }
}
```

### 3.3 接口设计

```typescript
// 执行单个任务
export async function runTask(
  project: BatchProject,
  task: BatchTask,
  runtime: RuntimeHost
): Promise<void>

// 暂停任务
export function pauseTask(projectId: string, taskId: string): void

// 恢复任务
export async function resumeTask(
  project: BatchProject,
  task: BatchTask,
  runtime: RuntimeHost
): Promise<void>

// 检查是否可以执行新任务
export function canStartTask(projectId: string): boolean

// 获取项目正在执行的任务数
export function getExecutingCount(projectId: string): number

// 订阅任务事件
export function subscribeTaskEvents(handler: (event: BatchTaskEvent) => void): () => void
```

### 3.4 并发控制逻辑

```typescript
async function runTask(project: BatchProject, task: BatchTask, runtime: RuntimeHost) {
  // 1. 检查并发限制
  if (getExecutingCount(project.id) >= project.concurrency) {
    // 等待或排队
    await waitForSlot(project.id);
  }
  
  // 2. 创建 Session
  const { sessionId } = await runtime.createSession({ cwd: task.cwd });
  
  // 3. 保存任务状态
  await saveTaskState(project.id, task.id, {
    taskId: task.id,
    status: "running",
    sessionId,
    sessionPath: runtime.getSessionPath(sessionId),
    startedAt: Date.now(),
    lastModified: Date.now(),
  });
  
  // 4. 发射事件
  emitTaskEvent({ type: "task.started", projectId: project.id, taskId: task.id });
  
  // 5. 订阅 session 事件，处理完成/失败
  const abortController = new AbortController();
  executingTasks.set(task.id, { projectId: project.id, taskId: task.id, abortController });
  
  runtime.subscribe(sessionId, createTaskEventHandler(project.id, task.id, abortController));
  
  // 6. 执行提示词
  await runtime.prompt(sessionId, { text: project.prompt });
}
```

### 3.5 暂停逻辑

```typescript
function pauseTask(projectId: string, taskId: string) {
  const executing = executingTasks.get(taskId);
  if (!executing) return;
  
  // 中断 LLM 调用
  executing.abortController.abort();
  
  // 更新状态
  updateTaskState(projectId, taskId, { status: "paused" });
  
  // 发射事件
  emitTaskEvent({ type: "task.paused", projectId, taskId });
}
```

### 3.6 恢复逻辑

```typescript
async function resumeTask(project: BatchProject, task: BatchTask, runtime: RuntimeHost) {
  // 重新创建 abort controller
  const abortController = new AbortController();
  executingTasks.set(task.id, { projectId: project.id, taskId: task.id, abortController });
  
  // 订阅 session 继续
  runtime.subscribe(task.sessionId!, createTaskEventHandler(project.id, task.id, abortController));
  
  // 继续执行
  await runtime.continue(task.sessionId!);
}
```

### 3.7 状态机

```
pending → running → paused → running → completed/failed
         ↓                    ↑
    completed/failed      (通过 resumeTask 恢复)
```

## 四、Session 事件处理

```typescript
function createTaskEventHandler(
  projectId: string,
  taskId: string,
  abortController: AbortController
): (event: SessionEvent) => void {
  return (event) => {
    if (event.type === "session.lifecycle" && event.phase === "agent_end") {
      updateTaskState(projectId, taskId, {
        status: "completed",
        completedAt: Date.now(),
        lastModified: Date.now(),
      });
      executingTasks.delete(taskId);
      emitTaskEvent({ type: "task.completed", projectId, taskId });
    }
    
    if (event.type === "error" || (event.type === "session.lifecycle" && event.phase === "aborted")) {
      updateTaskState(projectId, taskId, {
        status: "failed",
        error: event.type === "error" ? event.error.message : "任务被中断",
        completedAt: Date.now(),
        lastModified: Date.now(),
      });
      executingTasks.delete(taskId);
      emitTaskEvent({ type: "task.failed", projectId, taskId, error: event.error?.message || "任务被中断" });
    }
  };
}
```

## 五、注意事项

- 暂停依赖 `AbortController.signal.abort()` 中断 LLM 调用
- 工具执行期间无法立即暂停，需等待当前工具完成
- 并发控制基于项目的 `concurrency` 配置
- Session 由 `RuntimeHost` 管理，消息通过 jsonl 自动持久化

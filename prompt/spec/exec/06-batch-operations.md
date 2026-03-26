# 实施文档 6：批量操作与确认机制

## 一、目标

实现批量操作（重试/暂停/继续/删除）及所有危险操作的确认弹窗。

## 二、操作类型

### 2.1 批量操作（项目级别）

| 操作 | 触发条件 | 确认 |
|------|----------|------|
| 批量重试失败 | 存在 `failed` 状态任务 | 需确认 |
| 批量暂停 | 存在 `running` 状态任务 | 需确认 |
| 批量继续 | 存在 `paused` 状态任务 | 需确认 |
| 批量删除 | 存在可删除的任务 | 需确认 |

### 2.2 单任务操作

| 操作 | 触发条件 | 确认 |
|------|----------|------|
| 执行 | `pending` 状态 | 不需要 |
| 暂停 | `running` 状态 | 需确认 |
| 继续 | `paused` 状态 | 不需要 |
| 删除 | `paused`/`completed`/`failed` 状态 | 需确认 |
| 重试 | `failed` 状态 | 不需要 |

### 2.3 删除限制

- `running` 状态任务不允许删除
- 包含 `running` 状态任务的项目不允许删除

## 三、确认弹窗设计

### 3.1 统一确认对话框

使用 `confirmDialogAtom` 触发确认：

```typescript
setConfirmDialogAtom({
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
  onConfirm: () => void | Promise<void>;
});
```

### 3.2 确认消息模板

**批量重试失败**：
- Title: `确认重试失败的任务`
- Message: `将重新执行所有失败的任务，是否继续？`

**批量暂停**：
- Title: `确认暂停所有任务`
- Message: `正在运行的任务将暂停执行，是否继续？`

**批量继续**：
- Title: `确认继续所有任务`
- Message: `暂停的任务将继续执行，是否继续？`

**批量删除**：
- Title: `确认删除所有任务`
- Message: `删除后无法撤回，请确认是否继续。`

**单个任务暂停**：
- Title: `确认暂停任务`
- Message: `任务将暂停执行，是否继续？`

**单个任务删除**：
- Title: `确认删除任务`
- Message: `删除后无法撤回，请确认是否继续。`

**删除运行中项目**：
- Title: `无法删除项目`
- Message: `请先暂停所有任务后再删除。`

## 四、批量操作实现

### 4.1 useBatchTasks 中的批量方法

```typescript
const batchRetryFailed = useCallback(async (projectId: string) => {
  const project = projects.find(p => p.id === projectId);
  const failedTasks = project?.tasks.filter(t => t.status === "failed") ?? [];
  
  for (const task of failedTasks) {
    await window.vetta.batchTasks.runTask(projectId, task.id);
  }
}, [projects]);

const batchPause = useCallback(async (projectId: string) => {
  const project = projects.find(p => p.id === projectId);
  const runningTasks = project?.tasks.filter(t => t.status === "running") ?? [];
  
  for (const task of runningTasks) {
    await window.vetta.batchTasks.pauseTask(projectId, task.id);
  }
}, [projects]);

const batchResume = useCallback(async (projectId: string) => {
  const project = projects.find(p => p.id === projectId);
  const pausedTasks = project?.tasks.filter(t => t.status === "paused") ?? [];
  
  for (const task of pausedTasks) {
    await window.vetta.batchTasks.resumeTask(projectId, task.id);
  }
}, [projects]);

const batchDelete = useCallback(async (projectId: string) => {
  const project = projects.find(p => p.id === projectId);
  const deletableTasks = project?.tasks.filter(t => t.status !== "running") ?? [];
  
  for (const task of deletableTasks) {
    await window.vetta.batchTasks.deleteTask(projectId, task.id);
  }
}, [projects]);
```

### 4.2 UI 层调用

```typescript
const { batchRetryFailed, batchPause, batchResume, batchDelete } = useBatchTasks();
const setConfirm = useSetAtom(confirmDialogAtom);

const handleBatchRetry = (project: BatchProject) => {
  const failedCount = project.tasks.filter(t => t.status === "failed").length;
  if (failedCount === 0) return;
  
  setConfirm({
    title: "确认重试失败的任务",
    message: `将重新执行 ${failedCount} 个失败的任务，是否继续？`,
    confirmLabel: "重试",
    variant: "default",
    onConfirm: () => batchRetryFailed(project.id),
  });
};

const handleBatchDelete = (project: BatchProject) => {
  const runningCount = project.tasks.filter(t => t.status === "running").length;
  if (runningCount > 0) {
    setConfirm({
      title: "无法删除项目",
      message: "请先暂停所有任务后再删除。",
      confirmLabel: "确定",
      variant: "default",
    });
    return;
  }
  
  setConfirm({
    title: "确认删除所有任务",
    message: "删除后无法撤回，请确认是否继续。",
    confirmLabel: "删除",
    variant: "danger",
    onConfirm: () => batchDelete(project.id),
  });
};
```

## 五、注意事项

- 所有危险操作（删除、批量操作）必须确认
- 运行中的任务/项目删除需特殊提示
- 确认弹窗使用 `confirmDialogAtom` 统一管理
- 批量操作按顺序执行，而非并行

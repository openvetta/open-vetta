# 实施文档 4：批量任务页面 UI

## 一、目标

实现批量任务页面，包括项目列表、任务详情、新建/编辑项目对话框。

## 二、修改文件

| 文件 | 变更 |
|------|------|
| `domains/batch-tasks/hooks/useBatchTasks.ts` | 实现 TODO 方法 + 批量操作方法 |
| `domains/batch-tasks/components/BatchTaskList.tsx` | 连接操作按钮 + 分页加载 + 批量操作按钮 |
| `domains/batch-tasks/components/BatchTaskDetail.tsx` | 连接操作按钮 + AgentLoop 会话 |
| `domains/batch-tasks/components/BatchProjectDialog.tsx` | 添加文件夹选择器 + 并发设置 |

## 三、useBatchTasks.ts

### 3.1 职责
- 提供项目/任务 CRUD 操作
- 连接 IPC 接口
- 管理批量操作

### 3.2 接口设计

```typescript
export function useBatchTasks() {
  // 项目操作
  const refreshProjects = useCallback(async () => {
    const projects = await window.vetta.batchTasks.getProjects();
    setProjects(projects);
  }, []);
  
  const createProject = useCallback(async (data: {
    name: string;
    prompt: string;
    folders: string[];
    concurrency: number;
  }) => {
    const project = await window.vetta.batchTasks.createProject(data);
    setProjects(prev => [...prev, project]);
  }, []);
  
  const updateProject = useCallback(async (projectId: string, data: ...) => {
    await window.vetta.batchTasks.updateProject(projectId, data);
    // 更新本地状态
  }, []);
  
  const deleteProject = useCallback(async (projectId: string) => {
    // 检查是否有运行中任务
    const project = projects.find(p => p.id === projectId);
    if (project?.tasks.some(t => t.status === "running")) {
      throw new Error("请先暂停所有任务");
    }
    await window.vetta.batchTasks.deleteProject(projectId);
    setProjects(prev => prev.filter(p => p.id !== projectId));
  }, [projects]);
  
  // 任务操作
  const runTask = useCallback(async (projectId: string, taskId: string) => {
    await window.vetta.batchTasks.runTask(projectId, taskId);
  }, []);
  
  const pauseTask = useCallback(async (projectId: string, taskId: string) => {
    await window.vetta.batchTasks.pauseTask(projectId, taskId);
  }, []);
  
  const resumeTask = useCallback(async (projectId: string, taskId: string) => {
    await window.vetta.batchTasks.resumeTask(projectId, taskId);
  }, []);
  
  const deleteTask = useCallback(async (projectId: string, taskId: string) => {
    await window.vetta.batchTasks.deleteTask(projectId, taskId);
    // 更新本地状态
  }, []);
  
  // 批量操作
  const batchRetryFailed = useCallback(async (projectId: string) => {
    await window.vetta.batchTasks.batchRetryFailed(projectId);
  }, []);
  
  const batchPause = useCallback(async (projectId: string) => {
    await window.vetta.batchTasks.batchPause(projectId);
  }, []);
  
  const batchResume = useCallback(async (projectId: string) => {
    await window.vetta.batchTasks.batchResume(projectId);
  }, []);
  
  const batchDelete = useCallback(async (projectId: string) => {
    await window.vetta.batchTasks.batchDelete(projectId);
  }, []);
  
  // 事件订阅
  useEffect(() => {
    const unsubscribe = window.vetta.batchTasks.onTaskEvent((event) => {
      // 更新本地状态
    });
    return unsubscribe;
  }, []);
}
```

## 四、BatchTaskList.tsx

### 4.1 分页加载

```typescript
const LOAD_THRESHOLD = 200; // 离底部 200px 触发
const PAGE_SIZE = 20;

function BatchTaskList() {
  const [projects, setProjects] = useAtom(batchProjectsAtom);
  const [offset, setOffset] = useAtom(batchProjectsOffsetAtom);
  const [hasMore, setHasMore] = useAtom(batchProjectsHasMoreAtom);
  
  const loadMore = useCallback(async () => {
    if (!hasMore) return;
    const newProjects = await window.vetta.batchTasks.getProjects({ offset, limit: PAGE_SIZE });
    if (newProjects.length < PAGE_SIZE) {
      setHasMore(false);
    }
    setProjects(prev => [...prev, ...newProjects]);
    setOffset(offset + newProjects.length);
  }, [offset, hasMore]);
  
  // 滚动监听
  useEffect(() => {
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
      if (scrollHeight - scrollTop - clientHeight < LOAD_THRESHOLD) {
        loadMore();
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [loadMore]);
}
```

### 4.2 批量操作按钮

项目卡片头部显示批量操作按钮：
```tsx
<div className="flex items-center gap-1">
  <BatchActionButton icon="icon-[mdi--restart]" title="批量重试失败" onClick={() => batchRetryFailed(project.id)} />
  <BatchActionButton icon="icon-[mdi--pause]" title="批量暂停" onClick={() => batchPause(project.id)} />
  <BatchActionButton icon="icon-[mdi--play]" title="批量继续" onClick={() => batchResume(project.id)} />
  <BatchActionButton icon="icon-[mdi--delete]" title="批量删除" onClick={() => handleBatchDelete(project)} variant="danger" />
</div>
```

### 4.3 任务行错误展示

```tsx
{/* 任务行内错误展示 */}
{task.status === "failed" && task.error && (
  <Tooltip content={task.error}>
    <div className="flex items-center gap-1 text-red-400">
      <span className="icon-[mdi--alert-circle] text-[12px]" />
      <span className="text-xs truncate max-w-[50px]">
        {task.error.length > 50 ? task.error.slice(0, 50) + "..." : task.error}
      </span>
    </div>
  </Tooltip>
)}
```

## 五、BatchTaskDetail.tsx

### 5.1 任务详情展示

```tsx
interface BatchTaskDetailProps {
  task: BatchTask;
}

// 显示内容：
// 1. 任务状态和操作按钮
// 2. 文件夹路径
// 3. 错误信息（如果有）
// 4. 会话内容（如果任务正在运行或已完成）
```

### 5.2 会话展示

只有 `running` 或 `completed` 状态的任务显示会话：
```tsx
{hasSession && (
  <div className="rounded-lg border border-border bg-muted/30 p-3">
    <div className="mb-2 flex items-center gap-2">
      <span className="icon-[mdi--chat-outline] text-sm text-muted-foreground" />
      <span className="text-xs font-medium text-muted-foreground">会话</span>
    </div>
    {/* 会话消息列表 */}
  </div>
)}
```

## 六、BatchProjectDialog.tsx

### 6.1 表单项

```tsx
interface BatchProjectDialogProps {
  open: boolean;
  project?: BatchProject;
  onClose: () => void;
}

// 表单内容：
// 1. 项目名称（Input）
// 2. 提示词（Textarea）
// 3. 并发数（Select, 1-5）
// 4. 文件夹列表（可多选 + 手动输入）
//    - 添加文件夹按钮：调用 window.vetta.dialog.selectFolders()
//    - 手动输入路径
//    - 显示已添加的文件夹列表
```

### 6.2 文件夹选择

```tsx
const handleSelectFolders = async () => {
  const folders = await window.vetta.dialog.selectFolders();
  if (folders.length > 0) {
    setFolders(prev => [...new Set([...prev, ...folders])]);
  }
};
```

### 6.3 验证规则

- name: 必填，非空
- prompt: 必填，非空
- folders: 至少一个
- concurrency: 1-5

## 七、注意事项

- 所有删除操作需通过 `confirmDialogAtom` 确认
- 批量操作同样需要确认
- 错误信息使用 Tooltip 展示完整内容

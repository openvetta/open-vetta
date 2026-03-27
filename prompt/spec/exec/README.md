# 批量任务功能 - 整体需求文档

## 一、项目目标

实现批量任务执行功能，支持用户基于多个文件夹进行统一的 AI 任务执行，具备中断可恢复、状态持久化、并发控制等能力。

## 二、设计原则

1. **提示词统一**：项目提供统一提示词，任务共享，无需在任务级别重复配置
2. **状态独立**：Session、任务、项目相互独立，删除操作不产生级联影响
3. **可恢复性**：应用重启后可恢复中断的任务状态
4. **资源可控**：支持并发数配置，默认串行执行
5. **用户确认**：危险操作（删除、暂停）需弹窗确认

## 三、数据结构定义

### BatchProject
```typescript
interface BatchProject {
  id: string;
  name: string;
  prompt: string;           // 统一提示词，所有任务共享
  concurrency: number;       // 并发数，默认 1，范围 1-5
  tasks: BatchTask[];
  createdAt: number;
  updatedAt: number;
}
```

### BatchTask
```typescript
interface BatchTask {
  id: string;
  name: string;
  cwd: string;               // 文件夹路径
  status: "pending" | "running" | "paused" | "completed" | "failed";
  sessionId?: string;
  sessionPath?: string;
  error?: string;            // 失败时的错误信息
  createdAt: number;
  updatedAt: number;
}
```

### BatchSession
```typescript
interface BatchSession {
  id: string;
  projectId: string;
  taskId: string;
  path: string;              // sessionPath，jsonl 文件路径
  name: string;
  firstMessage: string;
  modifiedAt: number;
}
```

### BatchTaskState（持久化状态）
```typescript
interface BatchTaskState {
  taskId: string;
  status: "pending" | "running" | "paused" | "completed" | "failed";
  sessionId?: string;
  sessionPath?: string;
  error?: string;
  startedAt?: number;
  completedAt?: number;
  lastModified: number;
}
```

## 四、持久化存储

| 文件 | 位置 | 说明 |
|------|------|------|
| batch-projects.json | `~/.vetta/batch-projects.json` | 完整项目数据 |
| batch-task-states.json | `~/.vetta/batch-task-states.json` | 任务运行状态 |
| session jsonl | `~/.vetta/sessions/<cwd>/<timestamp>_<id>.jsonl` | Session 消息（由 SessionManager 管理） |

## 五、会话生命周期

- **running**：任务执行中，sessionPath 存在
- **completed**：任务成功完成，sessionPath 保留
- **failed**：任务执行失败，sessionPath 保留，error 保存错误信息
- **paused**：任务暂停，sessionPath 保留
- **pending**：任务等待执行

只有 `running` 和 `completed` 状态的任务会话显示在侧边栏。

## 六、任务状态恢复逻辑

应用启动时：
- `running` → `failed`，错误信息："应用异常退出"
- `paused` → 保持不变，用户可继续
- `pending`/`completed`/`failed` → 保持不变

## 七、删除操作层级

| 操作对象 | 影响范围 |
|----------|----------|
| 删除 Session | 仅删除 session 文件，不影响项目和任务 |
| 删除任务 | 仅删除任务，不影响项目和 session |
| 删除项目 | 删除项目和任务，不影响 session |

## 八、删除限制

- 正在运行的任务不允许删除
- 包含正在运行任务的项目不允许删除
- 需先暂停所有任务才能删除项目

## 九、并发控制

- 每个项目可配置并发数（1-5），默认 1
- 同时执行的任务数量不超过并发数
- 并发执行的任务互不影响

## 十、暂停机制

- 暂停通过 `signal.abort()` 中断 LLM 调用
- 恢复通过 `agentLoopContinue()` 从中断点继续
- 暂停仅在 LLM 调用期间有效，工具执行中无法立即暂停

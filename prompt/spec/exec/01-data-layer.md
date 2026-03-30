# 实施文档 1：数据层 - 数据结构与持久化

## 一、目标

定义批量任务相关数据结构，实现项目数据和任务状态的持久化存储。

## 二、新增文件

| 文件 | 用途 |
|------|------|
| `main/batch-tasks/batch-task-storage.ts` | 项目数据持久化 |
| `main/batch-tasks/batch-task-state.ts` | 任务状态持久化 |
| `main/ipc/batch-tasks.ts` | IPC Handler |

## 三、修改文件

| 文件 | 变更 |
|------|------|
| `shared/store/batch-tasks-atoms.ts` | 添加分页 atoms + 任务状态 atoms |

## 四、batch-task-storage.ts

### 4.1 职责
- 管理 `~/.vetta/batch-projects.json` 持久化
- 提供项目 CRUD 操作

### 4.2 接口设计

```typescript
// 加载所有项目
export async function loadProjects(): Promise<BatchProject[]>

// 保存所有项目
export async function saveProjects(projects: BatchProject[]): Promise<void>

// 生成项目 ID
export function generateProjectId(): string

// 生成任务 ID
export function generateTaskId(): string
```

### 4.3 存储格式

```json
[
  {
    "id": "batch-project-123",
    "name": "我的批量项目",
    "prompt": "统一提示词",
    "concurrency": 1,
    "tasks": [...],
    "createdAt": 1234567890,
    "updatedAt": 1234567890
  }
]
```

## 五、batch-task-state.ts

### 5.1 职责
- 管理 `~/.vetta/batch-task-states.json` 持久化
- 记录任务实时运行状态
- 提供状态查询和更新

### 5.2 接口设计

```typescript
// 加载所有任务状态
export async function loadTaskStates(): Promise<Record<string, Record<string, BatchTaskState>>>

// 保存任务状态
export async function saveTaskState(projectId: string, taskId: string, state: BatchTaskState): Promise<void>

// 删除任务状态
export async function deleteTaskState(projectId: string, taskId: string): Promise<void>

// 删除项目所有任务状态
export async function deleteProjectTaskStates(projectId: string): Promise<void>

// 更新任务状态（仅更新指定字段）
export async function updateTaskState(projectId: string, taskId: string, patch: Partial<BatchTaskState>): Promise<void>
```

### 5.3 存储格式

```json
{
  "batch-project-123": {
    "task-1": {
      "taskId": "task-1",
      "status": "running",
      "sessionId": "session-xxx",
      "sessionPath": "/path/to/session.jsonl",
      "startedAt": 1234567890,
      "lastModified": 1234567890
    }
  }
}
```

## 六、batch-tasks-atoms.ts 变更

### 6.1 新增 atoms

```typescript
// 分页相关
export const batchProjectsOffsetAtom = atom<number>(0);
export const batchProjectsHasMoreAtom = atom<boolean>(true);

// 任务状态同步
export const batchTaskStatesAtom = atom<Record<string, Record<string, BatchTaskState>>>({});
```

## 七、恢复逻辑

应用启动时：
1. 加载 `batch-task-states.json`
2. 对每个 `running` 状态的任务：
   - 更新状态为 `failed`
   - 设置 error 为 "应用异常退出"
3. 保存更新后的状态

## 八、注意事项

- 状态文件与应用配置文件分离，便于独立管理
- 状态更新采用增量保存，避免频繁全量写入

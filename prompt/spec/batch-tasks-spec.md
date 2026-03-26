# 批量任务功能需求分析与实现计划

## 一、需求概述

### 用户核心诉求
- 批量任务：基于选择多个文件夹实现、单个提示词、可长时间运行、中断可恢复的执行过程
- 每个文件夹是一个任务，所有任务属于同一个项目
- 添加批量任务时，在侧边栏下半部分创建新的项目，并附带相应批量任务项目的标识
- 每个任务执行时单独对应会话，任务之间并无联系

### 功能清单
1. 在菜单栏当中添加批量任务选项，点击前往该路由，右侧面板展示该页面内容
2. 添加批量任务时需要提供设置项目名（标题）、提示词、选择项目文件夹路径（可以选择多个文件夹）的表单项，并可以选择取消或者是保存
3. 进入批量项目页面默认展示批量任务列表，支持滚动分页加载，离底部200px阈值时触发加载，每个批量任务附带编辑、执行、暂停、删除等操作项
4. 批量任务在执行时可以查看任务执行详情，只有运行当中或者是成功运行的任务才有会话，这个是任务执行时的 LLM 对话，是一个 AgentLoop。
5. 任务会话将会展示在侧边栏，与已有的项目列表在同一个面板当中，任务属于项目的子类，批量项目使用特殊 UI 图标标识（如徽章/Badge）以提高视觉观感
6. 批量操作（重试失败/暂停/继续/删除）和删除操作均需要弹窗确认
7. 任务状态持久化，应用重启后可恢复运行状态
8. 提示词统一：项目提供统一提示词，任务共享，去除任务的 prompt 属性
9. 错误展示：任务失败时，列表项显示 ! 图标 + 省略的 error 信息，tooltip 展示完整信息
10. 删除限制：正在运行的任务或项目不允许删除，需先暂停所有任务

## 二、现有代码分析

### 已有结构
| 组件 | 路径 | 说明 |
|------|------|
| BatchTasksPage | `domains/batch-tasks/components/BatchTasksPage.tsx` | 页面入口 |
| BatchTaskList | `domains/batch-tasks/components/BatchTaskList.tsx` | 项目列表（有 TODO） |
| BatchTaskDetail | `domains/batch-tasks/components/BatchTaskDetail.tsx` | 任务详情（有 TODO） |
| BatchProjectDialog | `domains/batch-tasks/components/BatchProjectDialog.tsx` | 新建/编辑对话框 |
| batch-tasks-atoms | `shared/store/batch-tasks-atoms.ts` | 状态定义 |
| useBatchTasks | `domains/batch-tasks/hooks/useBatchTasks.ts` | Hook（多个 TODO） |

### 数据结构
```typescript
// BatchProject
{
  id: string;
  name: string;
  prompt: string;
  concurrency: number; // 并发数，默认 1
  tasks: BatchTask[];
  createdAt: number;
  updatedAt: number;
}

// BatchTask
{
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

// BatchSession
{
  id: string;
  projectId: string;
  taskId: string;
  path: string;
  name: string;
  firstMessage: string;
  modifiedAt: number;
}

// BatchTaskState（持久化状态）
{
  taskId: string;
  status: "pending" | "running" | "paused" | "completed" | "failed";
  sessionId?: string;
  sessionPath?: string;
  error?: string;
  startedAt?: number;
  completedAt?: number;
  lastModified: number;
}

// 持久化文件：~/.vetta/batch-projects.json（完整项目数据）
// 持久化文件：~/.vetta/batch-task-states.json（任务运行状态）
```

### 未实现功能 (TODO)
- `refreshProjects()` - 从存储/IPC 刷新
- `runTask()` - 任务执行（AgentLoop）
- `pauseTask()` - 任务暂停
- `resumeTask()` - 任务恢复
- `deleteProject()` - 项目删除（需检查是否有运行中任务）
- 删除任务操作（需检查任务状态）
- 文件夹选择器（BatchProjectDialog 中仅手动输入）
- 分页加载（滚动分页，离底部 200px 触发）
- 侧边栏集成（批量项目会话作为 ProjectsPanel 子类）
- 任务状态持久化（`batch-task-states.json`）
- 批量操作（批量重试/暂停/继续/删除）
- 批量操作和删除操作确认弹窗
- 应用重启后任务状态恢复（running → failed）
- 任务 prompt 移除（项目统一提供）
- 错误信息 UI 展示（! 图标 + tooltip）
- 删除限制检查（运行中不允许删除）

## 三、架构设计

### 整体架构
```
┌─────────────────────────────────────────────────────────────┐
│                        渲染进程                              │
├─────────────────────────────────────────────────────────────┤
│  BatchTasksPage                                            │
│    ├── BatchTaskList (项目卡片列表，支持滚动分页)               │
│    │     ├── ActionButtons (编辑/删除项目)                    │
│    │     └── TaskRow (执行/暂停/删除任务)                      │
│    └── BatchTaskDetail (AgentLoop 会话详情)                   │
│                                                             │
│  Sidebar                                                    │
│    ├── NAV_ITEMS (自动化/批量任务/技能广场)                    │
│    └── ProjectsPanel (普通项目 + 批量项目会话)                 │
│          └── BatchProjectGroup (NEW: 批量项目作为子类)         │
│                └── BatchSessionRow (任务会话)                 │
├─────────────────────────────────────────────────────────────┤
│  useBatchTasks Hook                                         │
│    ├── refreshProjects() ← 从 IPC 加载                      │
│    ├── runTask() / pauseTask() / resumeTask()               │
│    └── deleteProject() / deleteTask()                        │
├─────────────────────────────────────────────────────────────┤
│  window.vetta.batchTasks (Preload API)                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        主进程                                │
├─────────────────────────────────────────────────────────────┤
│  main/ipc/batch-tasks.ts (IPC Handler)                      │
│    ├── GET_PROJECTS / CREATE_PROJECT / UPDATE_PROJECT        │
│    ├── DELETE_PROJECT                                        │
│    ├── RUN_TASK / PAUSE_TASK / RESUME_TASK                  │
│    └── TASK_EVENT (AgentLoop 事件推送)                        │
│                                                             │
│  main/batch-tasks/ (NEW: 批量任务执行引擎)                     │
│    ├── batch-task-executor.ts (AgentLoop 执行器)              │
│    └── batch-task-storage.ts (数据持久化)                     │
└─────────────────────────────────────────────────────────────┘
```

### 文件变更清单

#### 新增文件
| 文件 | 用途 |
|------|------|
| `main/batch-tasks/batch-task-executor.ts` | AgentLoop 任务执行引擎 |
| `main/batch-tasks/batch-task-storage.ts` | 项目数据持久化 (`batch-projects.json`) |
| `main/batch-tasks/batch-task-state.ts` | 任务状态持久化 (`batch-task-states.json`) |
| `main/ipc/batch-tasks.ts` | IPC Handler |
| `renderer/domains/batch-tasks/components/BatchProjectGroup.tsx` | 侧边栏批量项目组 |

#### 修改文件
| 文件 | 变更 |
|------|------|
| `main/ipc/dialog.ts` | 添加 `selectFolders` 多选方法 |
| `main/ipc/index.ts` | 注册 BatchTasksIpc |
| `main/main.ts` | 初始化 BatchTasksIpc |
| `preload/index.ts` | 添加 `batchTasks` API + `selectFolders` |
| `preload/api.ts` | 添加 `DesktopBatchTasksApi` + `selectFolders` |
| `shared/store/batch-tasks-atoms.ts` | 添加分页 atoms + 任务状态 atoms |
| `domains/batch-tasks/hooks/useBatchTasks.ts` | 实现 TODO 方法 + 批量操作方法 |
| `domains/batch-tasks/components/BatchTaskList.tsx` | 连接操作按钮 + 分页加载 + 批量操作按钮 |
| `domains/batch-tasks/components/BatchTaskDetail.tsx` | 连接操作按钮 + AgentLoop 会话 |
| `domains/batch-tasks/components/BatchProjectDialog.tsx` | 添加文件夹选择器 + 并发设置 |
| `domains/project/components/ProjectsPanel.tsx` | 集成批量项目组 |
| `domains/project/components/Sidebar.tsx` | 展示批量项目数据 |

## 四、关键设计决策

### 1. 持久化存储
- 位置：`~/.vetta/batch-projects.json`
- 格式：JSON 数组，包含完整项目结构

### 2. 任务执行模型（AgentLoop）
- 基于 `packages/agent/src/agent-loop.ts` 实现
- 每个任务创建独立 Session
- 使用 `agentLoop()` 启动执行，而非简单的 `runtime.prompt()`
- AgentLoop 提供细粒度事件：`agent_start`、`turn_start`、`message_update`、`tool_execution_*`、`agent_end`
- 暂停通过 `signal.abort()` 实现，恢复时使用 `agentLoopContinue()`

### 3. 暂停机制
- 状态机：`pending` → `running` ↔ `paused` → `completed`/`failed`
- `running` → `paused`：调用 `signal.abort()` 中断当前 LLM 调用
- `paused` → `running`：使用 `agentLoopContinue()` 从中断点恢复
- 暂停仅在 LLM 调用期间有效，工具执行中无法暂停

### 4. 侧边栏展示结构
- 批量项目与普通项目在同一个 ProjectsPanel 中展示
- 层级：ProjectsPanel → BatchProjectGroup（批量项目）→ BatchSessionRow（任务会话）
- 与普通项目会话并列显示
- 批量项目使用特殊 UI 图标标识（如 Badge/徽章），不使用简单文字前缀

### 5. 分页加载
- BatchTaskList 支持无限滚动
- 触发阈值：离底部 200px 时加载更多
- 每次加载固定数量（如 20 个项目）
- 加载状态通过 atom 管理

### 6. 事件推送
- 使用 `emitBatchTaskEvent` 推送状态变更
- 事件类型：`task.started`、`task.completed`、`task.failed`、`task.paused`、`task.resumed`
- 渲染进程通过 `onTaskEvent` 订阅

## 五、待确认细节

### 1. 文件夹输入方式
**方案**：新增 `dialog.selectFolders()` 方法，支持多选文件夹

- 新增 `DesktopDialogApi.selectFolders()` 方法
- 调用系统文件夹选择对话框，支持多选
- 返回 `string[]` 类型的路径数组
- 同时保留手动输入作为补充

### 2. 任务执行队列（并发控制）
**默认行为**：并发数为 1（串行执行）

- 项目设置中可调整并发数（1-5）
- 多个任务同时满足执行条件时，最多 `concurrency` 个任务并行执行
- 并发执行的任务互不影响，独立运行
- 优点：资源可控，可配置
- 缺点：需要用户设置

**示例**：并发设为 3 时，同时运行最多 3 个任务，第 4 个任务等待

### 3. 会话生命周期
- 任务运行中：sessionPath 存在，状态为 `running`
- 任务成功：sessionPath 保留，状态为 `completed`
- 任务失败：sessionPath 保留，状态为 `failed`
- 任务暂停：sessionPath 保留，状态为 `paused`
- 只有 `running` 和 `completed` 状态的任务会话显示在侧边栏

### 4. 任务执行状态持久化
**目的**：在任务中断、应用关闭重启时能恢复运行状态

**持久化文件**：`~/.vetta/batch-task-states.json`

**状态数据结构**：
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

// 存储格式：Record<projectId, Record<taskId, BatchTaskState>>
```

**恢复逻辑**：
- 应用启动时加载所有项目的任务状态
- `running` 状态：标记为 `failed`，添加错误信息 "应用异常退出"
- `paused` 状态：保持不变，用户可继续
- `pending`/`completed`/`failed`：保持不变

### 5. 删除操作层级关系
- 删除 Session：仅删除 session 文件，不影响项目和任务
- 删除任务：仅删除任务，不影响项目和 session
- 删除项目：删除项目和任务，不影响 session（session 独立持久化）

### 6. 删除限制
- 正在运行的任务不允许删除，需先暂停
- 包含正在运行任务的项目不允许删除，需先暂停所有任务

### 7. 批量操作
**所有批量操作和删除操作均需要弹窗确认用户**

**项目级批量操作**（BatchTaskList 项目卡片上）：
| 操作 | 说明 |
|------|------|
| 批量重试失败 | 重试所有 `failed` 状态的任务（需确认） |
| 批量暂停 | 暂停所有 `running` 状态的任务（需确认） |
| 批量继续 | 继续所有 `paused` 状态的任务（需确认） |
| 批量删除 | 删除所有任务（需确认，已暂停的任务才可删除） |

**子任务级操作**（每个任务行上）：
| 操作 | 说明 |
|------|------|
| 执行 | 运行单个任务 |
| 暂停 | 暂停单个任务（需确认） |
| 继续 | 继续单个任务 |
| 删除 | 删除单个任务（需确认，仅暂停/完成/失败状态可删除） |
| 重试 | 重新运行单个任务（仅 `failed` 状态）|

### 8. 错误信息展示
- 任务失败时，列表项显示 ! 图标 + 省略的 error 信息
- 省略规则：error 信息超过 50 字符时截断，显示前 50 字符 + "..."
- 完整信息通过 Tooltip 包裹，hover 时显示
- 图标：红色 ! 图标 `icon-[mdi--alert-circle]`

### 9. 暂停机制说明
- **粒度**：暂停仅在 LLM 调用等待响应时生效
- **执行流程**：LLM 调用 → 收到 Tool Call → 执行工具 → LLM 调用 → ...
- **可暂停时刻**：LLM 等待响应时调用 `abort()` 可立即暂停
- **不可立即暂停**：工具执行中（如读写大文件）必须等待当前工具完成
- **原因**：`abort()` 只能中断等待中的异步操作，无法中断已开始执行的工具

### 10. 会话持久化
- 会话路径存储在 `BatchTask.sessionPath`
- 会话消息通过 `SessionManager` 使用 jsonl 格式自动持久化
- 存储路径：`~/.vetta/sessions/<cwd>/<timestamp>_<sessionId>.jsonl`
- 应用重启后可从 `sessionPath` 恢复会话内容
- 侧边栏展示的会话引用 `sessionPath`

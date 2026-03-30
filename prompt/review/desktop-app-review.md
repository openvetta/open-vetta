# Desktop App 代码质量评审报告

> 评审范围: `packages/desktop-app/src/`
> 评审时间: 2026-03-25

---

## 严重程度评级说明

- **🔴 P0 (灾难级)**: 功能性 bug、数据丢失风险、严重安全隐患
- **🟠 P1 (严重)**: 架构缺陷、逻辑错误、维护性极差
- **🟡 P2 (一般)**: 代码重复、不一致性问题
- **🔵 P3 (轻微)**: 代码风格、可读性问题

---

## P1 — 类型重复定义（多份副本）

**严重程度:** 🟠 严重  
**文件:** `src/preload/api.ts`, `src/renderer/store/atoms.ts`, `src/main/task-storage.ts`

### 问题描述

`ScheduledTask` 和 `TaskExecutionRecord` 接口在三处重复定义，且内容不完全一致：

```typescript
// 1. src/preload/api.ts (第 133-157 行)
export interface ScheduledTask { id, name, prompt, cron, enabled, modelId?, ... }
export interface TaskExecutionRecord { id, taskId, sessionId, ... }

// 2. src/renderer/store/atoms.ts (第 228-252 行) — 完全相同的定义

// 3. src/main/task-storage.ts (第 10-34 行) — 几乎相同的定义
```

`TaskMessage` 接口同样在三处重复（`preload/api.ts`、`task-storage.ts`、`atoms.ts` 中没有但实际使用）。

### 为什么这是 P1

1. **维护地狱**: 改一个字段需要同步修改 3 处，遗漏即产生隐藏 bug
2. **类型漂移**: 三份定义会随时间分化，导致 IPC 两侧类型不一致
3. **编译器无感知**: TypeScript 按文件编译，跨文件类型不匹配不会被 catch

### 修复建议

创建单一类型定义文件 `src/types/scheduled-task.ts`，三方共享：
```typescript
// src/types/scheduled-task.ts
export interface ScheduledTask { ... }
export interface TaskExecutionRecord { ... }
export interface TaskMessage { ... }
```

---

## P1 — App.tsx 严重代码膨胀（近 700 行）

**严重程度:** 🟠 严重  
**文件:** `src/renderer/App.tsx`

### 问题描述

App.tsx 长达 **699 行**，其中包含大量不属于组件的逻辑：

1. **消息转换函数**（第 43-138 行）— 约 95 行
   - `extractText()`, `extractResultText()`, `messageToBlocks()`, `historyToChat()`
   - 这些函数在 `chat-history.ts` 中**完全重复**

2. **流式状态管理**（第 144-431 行）— 约 287 行
   - `draftId`, `idCounter`, `turnStartTime`, `turnStatsCache` 等模块级状态
   - `resetStreamState()`, `ensureDraft()`, `appendTextDelta()`, `appendThinkingDelta()`, `finalizeMessage()`, `handleToolStart()`, `handleToolEnd()` — 8 个函数
   - 这些函数在 `chat-stream.ts` 中**完全重复**

3. **组件本身逻辑**（第 437-699 行）— 约 262 行

### 为什么这是 P1

- **违反单一职责**: App 组件同时扮演了"状态管理器"、"消息转换器"、"流处理引擎"三个角色
- **测试几乎不可能**: 699 行的巨型组件无法有效单元测试
- **开发地狱**: 修改任何流处理逻辑都要在 699 行文件中定位
- **无重用**: `chat-history.ts` 和 `chat-stream.ts` 是死代码

### 重复代码清单

| 函数 | App.tsx (行) | chat-*.ts | 状态 |
|------|-------------|-----------|------|
| `extractText` | 43-50 | `chat-history.ts:4-11` | 完全重复 |
| `extractResultText` | 53-63 | `chat-stream.ts:125-135` | 完全重复 |
| `messageToBlocks` | 70-92 | `chat-history.ts:13-36` | 完全重复 |
| `historyToChat` | 98-138 | `chat-history.ts:60-97` | 完全重复 |
| `ensureDraft` | 178-195 | `chat-stream.ts:12-31` | 完全重复 |
| `appendTextDelta` | 200-214 | `chat-stream.ts:47-65` | 完全重复 |
| `appendThinkingDelta` | 219-233 | `chat-stream.ts:67-85` | 完全重复 |
| `handleToolStart` | 337-396 | `chat-stream.ts:87-123` | 完全重复 |
| `handleToolEnd` | 401-431 | `chat-stream.ts:137-160` | 完全重复 |
| `finalizeMessage` | 245-332 | `chat-stream.ts:162-247` | 完全重复 |

### 修复建议

1. 将所有消息转换函数从 App.tsx 移到 `chat-history.ts`，删除 App.tsx 中的副本
2. 将所有流式处理函数从 App.tsx 移到 `chat-stream.ts`，删除 App.tsx 中的副本
3. App.tsx 应该只做组件渲染和事件分发
4. 将 `App.tsx` 中的模块级状态（`draftId`、`currentUnsubscribe` 等）改为 Jotai atom 或 React ref

---

## P1 — Scheduler 模块的全局状态泄漏

**严重程度:** 🟠 严重  
**文件:** `src/main/ipc-scheduler.ts`, `src/main/scheduler.ts`, `src/main/task-executor.ts`

### 问题描述

Scheduler 系统使用模块级全局变量来管理状态，存在严重的状态泄漏问题：

```typescript
// ipc-scheduler.ts 第 41-42 行
const streamHandlers = new Set<TaskStreamHandler>();      // 全局共享
const eventHandlers = new Set<(event: TaskEvent) => void>(); // 全局共享

// scheduler.ts 第 8 行
const scheduledJobs = new Map<string, ScheduledTask>();    // 全局共享

// task-executor.ts 第 12 行
const executingTasks = new Map<string, ExecutingTask>();  // 全局共享
```

### 为什么这是 P1

1. **窗口复用时数据污染**: 如果 Electron 窗口被销毁重建，这些全局 Map/Set **不会清空**
2. **多窗口场景完全崩溃**: 桌面应用可能打开多个窗口，每个窗口的事件处理器会叠加到同一组全局变量上
3. **内存泄漏**: 窗口关闭时事件处理器永远不会被清理（因为 Set 永远持有引用）
4. **teardown 时机错误**: `ipc-scheduler.ts` 的 teardown 只清理了 IPC handler，但 `streamHandlers` 和 `eventHandlers` 是独立管理的，teardown 后仍然有残留引用

### 具体场景

```typescript
// main.ts 第 189-193 行
void initScheduler().then(() => {
    if (mainWindow) {
        teardownSchedulerIpc = registerSchedulerIpc(mainWindow.webContents);
    }
});

// 问题: streamHandlers.add() 添加的 handler 永远不会通过 clear() 清理
// teardown() 调用 streamHandlers.clear() 但 window 已经关闭，无法调用 removeEventListener
```

### 修复建议

将全局状态封装到 `SchedulerService` 类中，以实例化方式管理：
```typescript
class SchedulerService {
    private streamHandlers = new Set<TaskStreamHandler>();
    private scheduledJobs = new Map<string, ScheduledTask>();
    private executingTasks = new Map<string, ExecutingTask>();
    
    dispose() { /* 清理所有资源 */ }
}
```

---

## P2 — 代码重复（TaskExecutionView vs App.tsx）

**严重程度:** 🟡 一般  
**文件:** `src/renderer/components/AutomationPage/TaskExecutionView.tsx`

### 问题描述

TaskExecutionView.tsx（约 456 行）从零实现了完整的消息流式渲染逻辑，包括：

1. **内容类型定义**（第 14-77 行）— 约 63 行
   - `BaseContent`, `TextContent`, `ThinkingContent`, `ToolCallContent`, `ImageContent` 等接口
   - 类型守卫函数 `isValidContentItem`, `isContentArray`, `isTextContent` 等

2. **消息解析函数**（第 143-265 行）— 约 122 行
   - `extractTextFromContent`, `extractTextFromToolResult`, `parseAssistantContent`, `parseStoredMessages`
   - 这些与 App.tsx 中的函数功能完全重叠，只是处理的数据结构不同

3. **流式处理**（第 301-382 行）— 约 81 行
   - 直接使用 `chat-stream.ts` 中的工具函数（`appendTextDelta` 等）
   - 但同时自己也维护了 `draftIdRef` 状态

### 为什么这是 P2

- 与 App.tsx 的消息处理逻辑存在功能重叠，但数据结构不同（TaskMessage vs Message）
- 两个组件处理的是同一类数据（聊天消息），但各自实现了一套解析/渲染逻辑
- 修改消息格式需要同步修改两处

### 修复建议

提取通用的消息处理逻辑到 `chat-messages.ts`，同时支持 `Message` 和 `TaskMessage` 两种输入格式。

---

## P2 — SettingsPage 过度工程化（1949 行）

**严重程度:** 🟡 一般  
**文件:** `src/renderer/components/SettingsPage.tsx`

### 问题描述

SettingsPage.tsx 是一个 **1949 行**的巨型文件，包含 5 个完全独立的设置面板：

- `GeneralSettings` — 通用设置（约 50 行）
- `ModelsSettings` — 模型配置（约 580 行）
- `McpSettings` — MCP 服务器（约 500 行）
- `ArchivedProjectsSettings` — 归档项目（约 90 行）
- `ShortcutsSettings` — 快捷键（约 70 行）

### 为什么这是 P2

- **违反关注点分离**: 每个设置面板应该独立成文件
- **无法独立加载**: 打开任意一个设置 Tab 都要加载整个 1949 行文件
- **编译时间**: 单个大文件的增量编译效率远低于多个小文件

### 额外问题

`SettingsPage.tsx` 中混入了大量共享 UI 组件（`SettingRow`, `SettingSection`, `InputField`, `SelectField`, `TextareaField`, `CheckboxField`, `ShortcutRecorder`, `DetailItem`），这些组件应该提取到 `components/ui/` 目录。

---

## P2 — TaskExecutionView 中的调试代码残留

**严重程度:** 🟡 一般  
**文件:** `src/renderer/components/AutomationPage/TaskExecutionView.tsx`

### 问题描述

第 383 行存在调试代码：
```typescript
console.log(draftIdRef.current);  // 第 383 行
```

这是明显的调试残留，不应该在代码库中存在。

---

## P3 — IPC teardown 不完整

**严重程度:** 🔵 轻微  
**文件:** `src/main/ipc.ts`, `src/main/ipc-fs.ts`, `src/main/ipc-scheduler.ts`

### 问题描述

每个 `register*` 函数返回 teardown 函数，但 teardown 不一致：

```typescript
// ipc.ts 第 196-204 行
return () => {
    for (const unsubscribe of subscriptionMap.values()) unsubscribe();
    subscriptionMap.clear();
    ipcMain.removeHandler("vetta:skills:list");
    ipcMain.removeHandler("vetta:dialog:select-images");
    ipcMain.removeHandler("vetta:dialog:select-folder");
    // 问题: CHANNELS 中其他 handler 没有被 removeHandler
};

// ipc-fs.ts 类似问题
```

### 为什么这是 P3

- 只清理了部分 handler，未清理的 handler 会继续响应（但无害，因为 window 已关闭）
- 没有 `ipcMain.removeHandler` 会导致重复注册时 handler 叠加
- 在 Electron 开发模式热重载场景下会产生问题

---

## P3 — 模块级计数器（非响应式状态）

**严重程度:** 🔵 轻微  
**文件:** `src/renderer/App.tsx`, `src/renderer/lib/chat-history.ts`

### 问题描述

```typescript
// App.tsx 第 154 行
let idCounter = 0;
function nextId(prefix: string): string {
    return `${prefix}-${++idCounter}-${Date.now()}`;
}

// chat-history.ts 第 38 行 — 完全相同的模式
let idCounter = 0;
function nextId(prefix: string): string {
    return `${prefix}-${++idCounter}-${Date.now()}`;
}
```

### 为什么这是 P3

- 两个文件各自维护一个计数器
- `Date.now()` 在高并发下不能保证唯一性（同一毫秒内多次调用）
- 更好的做法: 使用 `crypto.randomUUID()` 或 `nanoid`

---

## P3 — 无用的 Router 配置

**严重程度:** 🔵 轻微  
**文件:** `src/renderer/router.tsx`

### 问题描述

```typescript
const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => null,  // 返回 null 的空路由
});
```

整个 router 只有根路由且组件为空，但 App 是通过 `rootRoute` 直接渲染的（`router.tsx:5`）。这个 router 实际上**没有被使用**，App 直接渲染了 `<App />`。

### 为什么这是 P3

- 增加认知负担：为什么有一个未被使用的 router？
- 增加编译时间
- 可能是有意为未来预留，但当前是死代码

---

## P3 — import 顺序不一致

**严重程度:** 🔵 轻微  
**文件:** 多处

### 问题描述

部分文件按 group 分隔 import（`// ═══` 注释风格），但多数文件没有。`App.tsx` 和 `TaskExecutionView.tsx` 使用了分隔注释，但 `SettingsPage.tsx`、`useProjects.ts`、`useAuth.ts` 等文件没有。

### 修复建议

统一使用 ESLint `import/order` 规则，自动排序 import。

---

## 问题汇总（按严重程度）

| 排名 | 严重程度 | 问题 | 文件 |
|------|---------|------|------|
| 1 | 🟠 P1 | 类型重复定义 | `atoms.ts`, `api.ts`, `task-storage.ts` |
| 2 | 🟠 P1 | App.tsx 严重膨胀，10+ 函数重复 | `App.tsx` vs `chat-*.ts` |
| 3 | 🟠 P1 | Scheduler 全局状态泄漏 | `ipc-scheduler.ts`, `scheduler.ts` |
| 4 | 🟡 P2 | TaskExecutionView 消息处理重复 | `TaskExecutionView.tsx` |
| 5 | 🟡 P2 | SettingsPage 过度工程化 | `SettingsPage.tsx` (1949行) |
| 6 | 🟡 P2 | 调试代码残留 | `TaskExecutionView.tsx:383` |
| 7 | 🔵 P3 | IPC teardown 不完整 | `ipc.ts`, `ipc-fs.ts` |
| 8 | 🔵 P3 | 模块级计数器重复 | `App.tsx`, `chat-history.ts` |
| 9 | 🔵 P3 | 未使用的 Router | `router.tsx` |
| 10 | 🔵 P3 | import 顺序不一致 | 多处 |

---

## 优先修复建议

1. **立即修复**: P1 级别问题 — 类型重复和 Scheduler 全局状态会导致生产环境 bug
2. **短期修复**: App.tsx 重构 — 将 400+ 行非组件代码移到独立模块
3. **中期修复**: SettingsPage 拆分、TaskExecutionView 消息处理提取
4. **长期**: 持续清理 P3 问题

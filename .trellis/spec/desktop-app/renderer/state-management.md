# 状态管理

> Jotai 原子状态 + 组件本地 state。不使用 Redux / Context / Zustand / React Query。

---

## 存储位置

所有全局 / 跨组件状态都是 **Jotai atom**，按业务域分文件位于 `src/renderer/shared/store/`：

```
shared/store/
├── atoms.ts                 # 聚合 re-export（对外唯一入口）
├── chat-atoms.ts            # 聊天会话 / 消息 / 输入框 / 选中模型
├── project-atoms.ts
├── auth-atoms.ts
├── activity-atoms.ts
├── batch-tasks-atoms.ts
├── deploy-mode-atoms.ts
├── downloads-atoms.ts
├── file-atoms.ts
├── file-preview-atoms.ts
├── flowing-atoms.ts
├── flowing-chat-atoms.ts
├── scheduler-atoms.ts
├── sse-atoms.ts
├── todo-atoms.ts
├── ui-atoms.ts
└── workflow-atoms.ts
```

---

## 使用入口

**统一从 `@shared/store/atoms` import**，不要直连到子文件：

```ts
// ✅
import { chatMessagesAtom, activeSessionAtom } from "@shared/store/atoms";

// ❌
import { chatMessagesAtom } from "@shared/store/chat-atoms";
```

---

## 状态分层

### 1. 组件本地 `useState` / `useRef`

仅组件自己用的、不跨渲染共享。典型：

```ts
// TodoCard.tsx
const [expanded, setExpanded] = useState(false);
const sliceStartRef = useRef(-1);
```

**何时提升到 atom**：一旦需要跨组件读取或组件卸载后仍需保留值，升级成 atom。

### 2. Jotai atom（全局共享 + 持久化）

```ts
// shared/store/chat-atoms.ts
export const chatMessagesAtom = atom<ChatMessage[]>([]);
export const isStreamingAtom = atom<boolean>(false);
export const inputValueAtom = atom<string>("");
export const activeSessionAtom = atom<ActiveSession | null>(null);

// 可持久化：初始值从 localStorage 读
export const selectedModelAtom = atom<string | null>(
  localStorage.getItem("vetta-selected-model")
);
```

### 3. 派生 atom（derived）

```ts
export const visibleActionButtonsAtom = atom((get) => {
  const defs = get(actionButtonDefsAtom);
  const hidden = get(hiddenActionButtonsAtom);
  return defs.filter((d) => !hidden.has(d.id)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
});
```

只读派生用单参 `atom((get) => ...)`。

### 4. 非序列化引用（module-level ref）

函数 / 大对象 / Map 不能放 atom（Jotai 会触发结构 clone 警告），用模块级 ref 对象：

```ts
// shared/store/chat-atoms.ts
export const openSessionFnRef: {
  current: ((cwd: string, sessionPath?: string) => Promise<void>) | null;
} = { current: null };
```

使用方：

```ts
// useSessionManager 在挂载时写入
openSessionFnRef.current = openSession;

// 其它 domain 在需要时调用
void openSessionFnRef.current?.(cwd);
```

---

## 读写选择

| Hook | 场景 |
|------|------|
| `useAtom(atom)` | 既读又写 |
| `useAtomValue(atom)` | 只读，避免订阅写入触发不必要渲染 |
| `useSetAtom(atom)` | 只写（effect、event handler） |

见 `domains/chat/hooks/useSessionManager.ts`：

```ts
const [activeSession, setActiveSession] = useAtom(activeSessionAtom);     // 读写
const setChatMessages = useSetAtom(chatMessagesAtom);                      // 只写
const [selectedSkill, setSelectedSkill] = useAtom(selectedSkillAtom);
```

---

## 持久化

- 简单字段（主题、模型选择、快捷键覆盖）：`localStorage` + atom 初始值
  - 键名前缀 `vetta-*`（`vetta-theme` / `vetta-selected-model`）
- 复杂配置 / 跨进程共享：通过 `window.vetta.settings.*` / `window.vetta.config.*` 存主进程 JSON 文件，渲染层 hydrate 到 atom

---

## 服务端数据

- 没有 React Query / SWR
- 通过 `shared/lib/api.ts` 的 `request<T>()` 发起 HTTP，自动处理 `code !== 0` 与 `401 → notifyUnauthorized()`
- 结果写入对应 atom；loading / error 也作为 atom 或局部 state

---

## Atom 命名与组织

- 变量后缀 `Atom`：`xxxAtom`
- TypeScript 接口 / 类型定义与 atom 写同一文件（`chat-atoms.ts` 里定义 `ChatMessage`、`ContentBlock`、`AttachedImage`、`TurnUsageData` …）
- 新增业务域 → 新建 `<name>-atoms.ts` → 在 `atoms.ts` 追加 `export * from "./<name>-atoms";`

---

## 禁止事项

- ❌ 使用 React Context / Redux / Zustand
- ❌ 在组件里直接读 `localStorage`（应通过 atom 初始值或 hook 封装）
- ❌ 把函数 / Map / Set 塞进 atom value（会有 structured clone 问题 → 用 module-level ref）
- ❌ 新建 `shared/store/foo.ts` 却不在 `atoms.ts` 登记
- ❌ domain A 在组件里直连 `@shared/store/<domain-b>-atoms.ts`（应通过 `@shared/store/atoms`）

---

## 常见错误

| 错误 | 规避 |
|------|------|
| 只用 setter 却 `useAtom` → 所有 atom 变化都触发重渲染 | `useSetAtom` |
| 派生状态放在组件里 `useMemo` 计算，多处组件都算一次 | 建派生 atom |
| 把大数组作为 atom 整体替换，每帧拷贝 | 用 `atom((get) => get(baseAtom).slice(...))` 派生切片 |
| 想把回调 open session 存到 atom 里 | 用 module-level ref（见 `openSessionFnRef`） |

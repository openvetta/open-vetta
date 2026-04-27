# 自定义 Hook 约定

> 自定义 hook 命名、组织与常用模式。

---

## 位置

| 位置 | 适用范围 |
|------|---------|
| `src/renderer/shared/hooks/` | 跨 domain 复用（`useShortcuts` / `useSSEEvent` / `useTheme`） |
| `src/renderer/domains/<name>/hooks/` | 该 domain 专属（`useSessionManager` / `useProjects` / `useAuth` …） |

单文件一个 hook，文件名 `useXxx.ts`，函数名与文件名一致。

---

## 基本结构

```ts
// domains/chat/hooks/useSessionManager.ts
interface SessionManagerResult {
  openSession: (cwd: string, sessionPath?: string) => Promise<void>;
  sendMessage: () => Promise<void>;
  abortMessage: () => Promise<void>;
  openSessionRef: React.MutableRefObject<((cwd: string, sessionPath?: string) => Promise<void>) | undefined>;
}

export function useSessionManager(): SessionManagerResult {
  const [activeSession, setActiveSession] = useAtom(activeSessionAtom);
  const setChatMessages = useSetAtom(chatMessagesAtom);
  // ...
  const openSession = useCallback(async (cwd, sessionPath) => {
    // ...
  }, [dep1, dep2]);

  return { openSession, sendMessage, abortMessage, openSessionRef };
}
```

✅ 推荐：

- 返回对象（不是数组）并**显式声明**返回类型接口
- 内部回调用 `useCallback`，deps 列全
- 需要稳定引用的业务函数暴露 `xxxRef`（如 `openSessionRef`），供远处通过 ref 调用避免触发重渲染

---

## Jotai 读写选择

| API | 使用场景 |
|-----|---------|
| `useAtom(atom)` | 组件既读又写 |
| `useAtomValue(atom)` | 只读，避免在只读组件里订阅写入 |
| `useSetAtom(atom)` | 只写（常见于 effect / 事件处理，见 `useSessionManager.ts` 大量 `useSetAtom`） |

**规则**：需要 setter 但不渲染值时**必须**用 `useSetAtom`，避免无意义订阅 → 减少重渲染。

---

## 副作用模式

### 订阅 + 清理

```ts
useEffect(() => {
  const unsubscribe = window.vetta.theme.onNativeChanged((info) => { ... });
  return unsubscribe;
}, [setResolved]);
```

见 `shared/hooks/useTheme.ts` L37。

### 稳定引用的 handler

```ts
const handlerRef = useRef(handler);
handlerRef.current = handler;

useEffect(() => {
  function onKey(e: KeyboardEvent) {
    handlerRef.current(...);
  }
  document.addEventListener("keydown", onKey, true);
  return () => document.removeEventListener("keydown", onKey, true);
}, []); // 空 deps，用 ref 兜住回调
```

见 `shared/hooks/useShortcuts.ts` L26。

---

## 数据获取（无 React Query）

本项目**不使用** React Query / SWR。服务端状态从 `window.vetta.*` / `shared/lib/api.ts` 在 hook 内直接 fetch + 写入 atom：

```ts
// shared/lib/api.ts
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(base + path, options);
  if (res.status === 401) { notifyUnauthorized(); throw new Error("登录已过期，请重新登录"); }
  const json = (await res.json()) as ApiResponse<T>;
  if (json.code !== 0) throw new Error(json.message);
  return json.data as T;
}
```

Hook 内 fetch + 写 atom + loading/error 状态也放 atom（或本地 `useState`）。

---

## Init 类 hook

根布局常见 init hook（`App.tsx` 里集中调用）：

- `useAppInit` / `useFlowingInit` / `useFlowingChatInit` / `useDownloadsInit` / `useTheme` / `useAuth`

约定：

- Init hook **无返回值** 或只返回最少 API
- 内部 `useEffect(() => { ... }, [])` 只跑一次
- 内部订阅的 IPC 事件记得返回 unsubscribe

---

## 返回值约定

- 返回对象而非数组（便于扩展 & 解构命名）
- 值与函数混合：`{ state, action1, action2 }`
- 只要消费方会在 JSX 里用到，就显式声明结果类型

❌ 禁止：

- 返回 `[...]` 顺序依赖的 tuple（除非仿 `useState` 只有两项）
- 返回 internal React 状态（如 `setState` 的原生 setter 透传出去）

---

## 命名

- 始终 `use` 前缀
- 描述"做什么"而不是"用什么"：`useSessionManager` ✅ / `useRuntimeHostSubscriber` ❌

---

## 常见错误

| 错误 | 规避 |
|------|------|
| `useEffect(..., [handler])` 每次渲染触发 | 用 `handlerRef` |
| 在多处 `useAtom(sameAtom)` 只为了拿 setter | 用 `useSetAtom` |
| Hook 内 `await import(...)` | 顶层 import |
| hook 返回的函数未 `useCallback`，导致子组件 `React.memo` 失效 | 所有暴露的回调走 `useCallback` |
| Init hook 放在非根组件（被路由切换 remount） | 必须放 `RootLayout`（`App.tsx`） |

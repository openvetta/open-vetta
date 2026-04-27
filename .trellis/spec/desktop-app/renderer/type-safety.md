# 类型安全

> TypeScript 类型组织、`window.vetta` 类型接入、跨进程数据校验。

---

## 类型来源与层次

| 层 | 位置 | 用途 |
|----|------|------|
| 跨进程 API | `src/preload/api.ts` → `DesktopApi` | preload 暴露的 `window.vetta.*` 类型 |
| 渲染层全局 | `src/renderer/global.d.ts` | `declare global { interface Window { vetta: DesktopApi } }` |
| 共享业务类型 | `runtime-core/src/index.ts`（`PromptRequest` / `SessionEvent` / `SessionConfig`） | 与 runtime 交互的消息结构 |
| Atom & 业务类型 | `shared/store/*-atoms.ts` | 与 atom 紧密相关的类型（`ChatMessage` / `ContentBlock` …） |
| Domain 局部类型 | `domains/<name>/**/*.ts` | 该域内部使用的类型 |

---

## `window.vetta` 接入

```ts
// src/renderer/global.d.ts
import type { DesktopApi } from "@preload/api";

declare global {
  interface Window {
    vetta: DesktopApi;
  }
}
```

所有 IPC 调用由此类型托底：

```ts
const { sessionId } = await window.vetta.session.create({ cwd });
window.vetta.theme.onNativeChanged((info) => { ... });
```

✅ 推荐：

- 跨进程数据结构变更**同步**修改 `src/preload/api.ts`、主进程 IPC、renderer 调用
- 新增 IPC 命名空间在 `DesktopApi` 上扩展（如 `vetta.session.*` / `vetta.fs.*`）

❌ 禁止：

- `(window as any).vetta`
- 绕过 `DesktopApi` 直接 `ipcRenderer.invoke(...)`

---

## 运行时校验

渲染层发起的调用由主进程 `assert*` 断言校验（`assertNonEmptyString` / `assertPromptRequest`）。渲染层对来自主进程的响应通常**不二次校验**，依赖 TS 类型。

外部 HTTP 响应在 `shared/lib/api.ts` 里走统一格式：

```ts
interface ApiResponse<T> { code: number; message: string; data?: T; }

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(base + path, options);
  if (res.status === 401) { notifyUnauthorized(); throw new Error("登录已过期，请重新登录"); }
  const json = (await res.json()) as ApiResponse<T>;
  if (json.code !== 0) throw new Error(json.message);
  return json.data as T;
}
```

`data as T` 仅在此统一断言点允许（无 Zod / Valibot 等 schema 库）。

---

## 常用类型模式

### 区分联合 / 标签联合

```ts
// shared/store/chat-atoms.ts
export interface TextBlock   { type: "text";      text: string; }
export interface ThinkingBlock { type: "thinking"; text: string; }
export interface ToolCallBlock {
  type: "tool_call";
  status: "pending" | "success" | "error";
  // ...
}
export type ContentBlock = TextBlock | ThinkingBlock | ToolCallBlock | ToolResultBlock | ErrorBlock;
```

消费侧用 `switch (block.type)` 做 narrow。

### Hook 返回值接口

```ts
interface SessionManagerResult {
  openSession: (cwd: string, sessionPath?: string) => Promise<void>;
  sendMessage: () => Promise<void>;
  // ...
}
export function useSessionManager(): SessionManagerResult { ... }
```

### 可选字段

使用 `field?:`：

```ts
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "compaction";
  text: string;
  blocks?: ContentBlock[];
  images?: Array<{ data: string; mimeType: string; name: string }>;
  timestamp?: number;
  durationSeconds?: number;
}
```

---

## JSX 类型

全局通过 `shared/types/global.d.ts` 把 `JSX.Element` / `JSX.IntrinsicElements` 绑到 React：

```ts
import type { JSX as ReactJSX } from "react";
declare global {
  namespace JSX {
    type Element = ReactJSX.Element;
    type IntrinsicElements = ReactJSX.IntrinsicElements;
  }
}
```

所以组件返回类型写 `JSX.Element`，无需从 react import。

---

## 禁止事项

- ❌ `any`、`as any`
- ❌ `// @ts-ignore`（确实需要时用 `// @ts-expect-error` 并注释原因）
- ❌ `Function` 类型（写具体签名）
- ❌ 重复声明 `runtime-core` 已导出的类型
- ❌ `data as T` 散落各处（只在 `api.ts::request` 里统一做）
- ❌ 动态 import（`await import(...)`）
- ❌ Props 类型用 `React.FC<Props>`（改为函数签名参数位）

---

## 常见错误

| 错误 | 规避 |
|------|------|
| `const x = window.vetta.session.create as any` | 在 `DesktopApi` 里补齐类型 |
| `type Message = { ... }` 和 runtime-core 重名重定义 | `import type { PromptRequest } from "runtime-core/..."` |
| 用 `as unknown as T` 两段式断言 | 先想是不是缺 narrow，或加类型守卫 |
| Enum 字符串散落 | 用字面量联合 `"user" \| "assistant" \| "compaction"`，不要 TS `enum` |

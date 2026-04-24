# 渲染层目录结构

> `packages/desktop-app/src/renderer/` 按 **domain 驱动** 划分。

---

## 顶层

```
src/renderer/
├── main.tsx            # React 入口，挂载 RouterProvider
├── App.tsx             # RootLayout：TitleBar + Sidebar + <Outlet/> + 全局 Dialog
├── router.tsx          # TanStack Router 路由定义（hash history）
├── styles.css          # Tailwind v4 入口
├── index.html
├── global.d.ts         # window.vetta 全局类型
├── vite-env.d.ts
├── domains/            # 按业务域划分的功能模块
├── shared/             # 跨域复用：components / hooks / lib / store / types
└── public/             # 静态资源
```

---

## `domains/*`

每个业务域一个目录，内部约定：

```
domains/<name>/
├── components/         # 该域的 React 组件
├── hooks/              # 该域的自定义 hook
├── services/           # 纯业务逻辑（非 hook），可选
└── index.ts            # barrel 导出（可选）
```

当前存在的 domain：

| domain | 负责 |
|--------|------|
| `auth` | 登录 / OAuth 回调 |
| `chat` | 会话主界面（ChatPage、MessageList、InputBar…） |
| `project` | 项目侧栏、项目详情、会话列表 |
| `scheduler` | 定时任务 UI（`AutomationPage`） |
| `batch-tasks` | 批量任务 |
| `flowing` / `flowing-chat` | 流转能力 |
| `message` | 消息级展示组件 |
| `file-explorer` / `file-preview` | 文件浏览与预览 |
| `downloads` | 下载管理 |
| `settings` | 设置页（`/settings/$tab`） |
| `skills` | 技能 |
| `activity-panel` | 侧活动面板 |

---

## `shared/`

```
shared/
├── components/         # 跨域 UI：TitleBar / TodoCard / ResizeHandle / WelcomeScreen / ui/（shadcn 基础组件）
├── hooks/              # useShortcuts / useSSEEvent / useTheme
├── lib/                # api.ts / sse-client.ts / platform.ts / shortcuts.ts / utils.ts
├── store/              # Jotai atoms（一个业务一个文件，atoms.ts 统一 re-export）
└── types/              # 全局类型
```

### `shared/store/*`

每个文件一个业务切片，通过 `atoms.ts` 再出口：

```ts
// shared/store/atoms.ts
export * from "./chat-atoms";
export * from "./auth-atoms";
// ...
```

见 `packages/desktop-app/src/renderer/shared/store/atoms.ts`。

---

## 别名（`vite.config.ts`）

```ts
resolve: {
  alias: {
    "@shared":  "./src/renderer/shared",
    "@domains": "./src/renderer/domains",
    "@":        "./src",
  }
}
```

✅ 推荐：

```ts
import { chatMessagesAtom } from "@shared/store/atoms";
import { useSessionManager } from "@domains/chat/hooks/useSessionManager";
```

❌ 禁止：

```ts
import { chatMessagesAtom } from "../../../shared/store/atoms";  // 长相对路径
import { chatMessagesAtom } from "@shared/store/chat-atoms";     // 绕过 atoms.ts 聚合
```

---

## 命名

- 组件文件：**PascalCase**（`ChatPage.tsx`、`TodoCard.tsx`）
- hook / 工具 / atoms：**camelCase / kebab-case**（`useSessionManager.ts`、`chat-atoms.ts`）
- atom 变量：`xxxAtom` 后缀（`chatMessagesAtom`、`activeSessionAtom`）
- 目录：**kebab-case**（`batch-tasks`、`flowing-chat`）

---

## domain 边界

- ✅ domain A 可以 import `@shared/*`
- ✅ domain A 可以通过 `@shared/store` 读写属于 domain B 的 atom（atoms 是跨域通信的共享状态层）
- ❌ 禁止 domain A 直接 import `@domains/B/hooks/*`（需要抽到 `@shared/` 或改成通过 atom 通信）
- 例外：`App.tsx` 作为根布局，合法地 import 多个 domain 的 hook / 组件进行编排

---

## 新增 domain 步骤

1. 建 `domains/<name>/{components,hooks}`
2. 若需要跨组件状态，新建 `shared/store/<name>-atoms.ts` 并在 `shared/store/atoms.ts` 中 `export *`
3. 若是新路由：在 `router.tsx` 注册 route
4. 跨平台行为走 `window.vetta.<namespace>`，在 `src/preload/` 中先补上 IPC

---

## 禁止事项

- ❌ 在 `shared/` 放 domain-specific 组件
- ❌ 把业务组件写成默认导出（全项目用具名导出）
- ❌ 跨 domain 直接 import 对方 `hooks/` / `components/`
- ❌ 新建顶层目录（components / hooks / lib 应放在 `shared/` 或 domain 下）

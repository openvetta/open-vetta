# desktop-app 渲染层开发规则

> React + Vite + Jotai + TanStack Router + shadcn/ui + Tailwind（`packages/desktop-app/src/renderer/`）。

---

## 概览

- 入口：`src/renderer/main.tsx` → `RouterProvider(router)`
- 根布局：`src/renderer/App.tsx`（`RootLayout`，含 `TitleBar` / `Sidebar` / `Outlet`）
- 路由：`src/renderer/router.tsx`，`createHashHistory`，定义 `ChatPage` / `AutomationPage` / `BatchTasksPage` / `SkillsPage` / `SettingsPage` / `ProjectDetailPage` / `DownloadsPage`
- 状态：Jotai（`src/renderer/shared/store/*-atoms.ts`），通过 `shared/store/atoms.ts` 聚合导出
- 主进程调用：`window.vetta.*`（由 `src/preload/` 暴露，类型 `DesktopApi` 见 `src/renderer/global.d.ts`）
- UI 基础：shadcn/ui（`components.json`），Tailwind v4（`@tailwindcss/vite`），`motion/react` 动画，`icon-[mdi--*]` iconify class
- 别名：`@shared` → `src/renderer/shared`，`@domains` → `src/renderer/domains`，`@` → `src`（见 `vite.config.ts`）

---

## 文件索引

| 文档 | 说明 | 状态 |
|------|------|------|
| [directory-structure.md](./directory-structure.md) | renderer 目录与 domain 划分 | Done |
| [component-guidelines.md](./component-guidelines.md) | 组件写法、shadcn/ui 使用、Tailwind | Done |
| [hook-guidelines.md](./hook-guidelines.md) | 自定义 hook 约定 | Done |
| [state-management.md](./state-management.md) | Jotai atoms 分层与使用 | Done |
| [quality-guidelines.md](./quality-guidelines.md) | 代码质量红线 | Done |
| [type-safety.md](./type-safety.md) | 类型定义与 `window.vetta` 使用 | Done |

---

## 必读上下文

- `packages/desktop-app/src/renderer/App.tsx`
- `packages/desktop-app/src/renderer/router.tsx`
- `packages/desktop-app/src/renderer/shared/store/chat-atoms.ts`（典型 atom 分层示例）
- `packages/desktop-app/src/renderer/domains/chat/hooks/useSessionManager.ts`（典型业务 hook 示例）
- `packages/desktop-app/vite.config.ts`（别名）
- `packages/desktop-app/components.json`（shadcn 配置）

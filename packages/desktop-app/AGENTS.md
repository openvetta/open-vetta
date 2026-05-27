# Team: Frontend Apps

> 本包属于 **Frontend Apps Team**，同组包：`packages/admin`

## 职责范围

Electron 桌面应用，提供 AI Coding Agent 的图形化界面。

## 技术栈

- Electron 34 + Vite + React 19
- TailwindCSS 4 + Jotai 状态管理
- Shiki 代码高亮
- TanStack Router (hash history, 适配 Electron file:// 协议)
- shadcn/ui 组件库

## 项目结构

```
src/
  main/                — Electron 主进程
    ipc/               — 按领域拆分的 IPC handler
      session.ts         会话管理
      settings.ts        配置读写
      updater.ts         应用更新
      skills.ts          技能安装/卸载
      dialog.ts          系统对话框
      fs.ts              文件系统操作
      scheduler.ts       定时任务
      index.ts           聚合注册
    scheduler/         — 定时任务执行引擎
    window-manager.ts  — 窗口创建与管理
    tray-manager.ts    — 系统托盘
    main.ts            — 生命周期编排（精简壳）
    updater.ts         — 自动更新
  preload/             — 安全上下文桥接
  renderer/            — React 渲染进程
    domains/           — 按业务领域组织
      chat/              聊天核心
        components/        ChatPage, ChatView, InputBar, MessageList, blocks/...
        hooks/             useSessionManager, useAppInit
        services/          chat-service.ts (消息处理纯函数 + 流式状态)
      project/           项目与侧边栏
        components/        Sidebar, ProjectsPanel, ProjectGroup, AddProjectMenu...
        hooks/             useProjects
      file-explorer/     文件浏览器
        components/        FilesPanel, FileTree, FileTreeNode, FileContextMenu...
        hooks/             useFileTree
      activity-panel/    文件预览面板
        components/        ActivityPanel, FilePreview, previews/...
        hooks/             useActivityPanel
      scheduler/         定时任务
        components/        AutomationPage, TaskForm, TaskList, schedule-picker/...
        hooks/             useScheduledTasks, CRON_PRESETS
      auth/              认证
        components/        LoginDialog
        hooks/             useAuth
      settings/          设置（拆分为独立子页面组件）
        components/        SettingsPage, GeneralSettings, ModelsSettings, McpSettings...
      skills/            技能市场
        components/        SkillsPage
    shared/            — 跨领域公共代码
      components/ui/     shadcn 基础组件 (Button, Dialog, Input, Select...)
      components/        TitleBar, ResizeHandle, WelcomeScreen, UpdateChecker...
      hooks/             useTheme, useShortcuts
      lib/               utils, platform, shortcuts, api
      store/             Jotai atoms（按领域拆分 + re-export hub）
        atoms.ts           re-export hub（所有消费者从这里导入）
        chat-atoms.ts      聊天相关 atoms
        project-atoms.ts   项目相关 atoms
        file-atoms.ts      文件浏览器 atoms
        activity-atoms.ts  预览面板 atoms
        scheduler-atoms.ts 定时任务 atoms
        auth-atoms.ts      认证 atoms
        ui-atoms.ts        主题、确认对话框等 UI atoms
      types/             全局类型声明
    App.tsx            — RootLayout 壳组件（~70行）
    router.tsx         — TanStack Router 路由定义
    main.tsx           — 入口
```

### 路径别名

- `@shared/*` → `src/renderer/shared/*`
- `@domains/*` → `src/renderer/domains/*`
- `@preload/*` → `src/preload/*`

## **CRITICAL** 开发规范 **CRITICAL**

### 0. UI 改动必读 DESIGN.md

**修改 `src/renderer/**` 任何 `.tsx` / `.css`、`shared/components/ui/**`、或新增 `motion/react` 动画前，必须读 [`DESIGN.md`](./DESIGN.md)。**
该文件定义颜色 token / 卡片阴影 / 圆角 / 间距 / 动画 / 图标 / 桌面端 drag-region 等的硬性规则，违反即视为不合格 PR。

### 1. 不要重复造轮子

**UI 组件**：所有操作按钮（提交、保存、取消、删除、安装等）**必须**使用 `@shared/components/ui/button` 的 `Button` 组件，不要用原生 `<button>` 手写样式。Button 提供以下 variant：

| Variant | 用途 | 示例 |
|---------|------|------|
| `default` | 主要操作（保存、创建、发送） | `<Button>保存</Button>` |
| `outline` | 次要操作、带边框 | `<Button variant="outline">取消</Button>` |
| `ghost` | 轻量操作、工具栏按钮 | `<Button variant="ghost" size="icon-xs">` |
| `destructive` | 危险操作（删除） | `<Button variant="destructive">删除</Button>` |
| `secondary` | 辅助操作 | `<Button variant="secondary">` |

**允许使用原生 `<button>` 的场景**：导航项、菜单项、列表选择项、标签切换、展开/折叠 toggle、窗口控件等**布局交互元素**。

**其他 UI 组件**：优先使用 `@shared/components/ui/` 下已有的 shadcn 组件（Dialog, Input, Select, Switch, Textarea, Tooltip, Popover, Calendar 等）。新增 UI 组件前先检查是否已存在。

### 2. 遵循领域结构

- 新功能代码放入对应的 `domains/<领域>/` 目录
- 跨领域共享的代码放入 `shared/`
- **不要**在 `domains/` 外面创建新的顶层目录（如 `components/`, `hooks/`, `lib/`）
- 每个领域内部结构：`components/`, `hooks/`, `services/`（按需）
- 领域间通过 `@shared/store/atoms` 共享状态，不要跨领域直接 import 其他领域的内部模块

### 3. 状态管理

- 使用 Jotai atoms 管理全局状态
- 新增 atom 放入对应领域的 `shared/store/<领域>-atoms.ts`
- 在 `shared/store/atoms.ts` re-export hub 中添加 re-export
- 所有消费者统一从 `@shared/store/atoms` 导入

### 4. 路由

- 使用 TanStack Router 静态路由模式（`createRoute` + `createHashHistory`）
- 路由定义在 `router.tsx`
- 页面切换通过 `useNavigate()` 而非 atom，**不要用 atom 做页面切换**
- RootLayout (`App.tsx`) 只负责布局壳，页面内容通过 `<Outlet />` 渲染

### 5. 主题与样式

- 使用项目 CSS 变量（`var(--text-1)`, `var(--hover)`, `var(--border)`, `var(--accent)` 等）
- **不要**使用 Tailwind 语义色（`bg-primary`, `text-foreground` 等），这些未在项目中配置
- shadcn 组件的样式已经对齐到项目 CSS 变量

### 6. IPC 通信

- 渲染进程通过 `window.vetta.*` 调用主进程功能
- 新增 IPC handler 放入 `main/ipc/<领域>.ts`
- 在 `main/ipc/index.ts` 中注册
- preload 层定义类型契约

## 开发注意事项

### bun dev 前置依赖构建

`desktop-app` 的主进程（`src/main/`）依赖 workspace 中的其他包（`@mariozechner/pi-ai`、`@mariozechner/pi-agent-core`、`@vetta/coding-agent` 等）。这些包的 `dist/` 目录必须先构建，否则 `build:main` 会报 "Failed to resolve entry for package" 错误。

**首次运行或依赖变更后**，必须先执行以下构建命令：

```bash
# 按依赖顺序构建 workspace 包
cd packages/ai && bun run build              # @mariozechner/pi-ai
cd packages/agent && bun run build            # @mariozechner/pi-agent-core
cd packages/tui && bun run build             # @mariozechner/pi-tui
cd packages/coding-agent && bun run build    # @vetta/coding-agent

# 然后即可启动 desktop-app 开发服务器
cd packages/desktop-app && bun dev
```

## 注意事项

- 与 `admin` 包完全独立，可安全并行开发
- 消费 `@vetta/runtime-core` 的事件契约，契约变更需同步适配
- 主进程和渲染进程通过 IPC 通信，注意安全边界
- desktop-app 的类型测试需要执行 lint 和 tsc 检查，根目录的检查不包含该项目的检查。
- 修改 `packages/desktop-app` 代码后，除根目录 `bun run check` 外，还必须在 `packages/desktop-app` 目录运行 `bunx tsc --noEmit`。

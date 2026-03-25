# Team: Frontend Apps

> 本包属于 **Frontend Apps Team**，同组包：`packages/admin`

## 职责范围

Electron 桌面应用，提供 AI Coding Agent 的图形化界面。

## 架构

```
src/
  main/       — Electron 主进程（IPC、更新器）
  preload/    — 安全上下文桥接
  renderer/   — React 渲染进程（核心 UI）
    components/
      Chat/           — 聊天界面
      Sidebar/        — 项目/文件树侧边栏
      ActivityPanel/  — 文件预览面板
      SettingsPage/   — 设置页面
      SkillsPage/     — 技能管理
      AutomationPage/ — 自动化页面
      ui/             — 基础 UI 组件
    hooks/    — React hooks
    store/    — Jotai 原子状态管理
    lib/      — 工具函数
```

## 技术栈

- Electron 34 + Vite + React 19
- TailwindCSS 4 + Jotai 状态管理
- Shiki 代码高亮
- TanStack Router

## 注意事项

- 与 `admin` 包完全独立，可安全并行开发
- 消费 `@vetta/runtime-core` 的事件契约，契约变更需同步适配
- 主进程和渲染进程通过 IPC 通信，注意安全边界
- 无独立测试，UI 变更建议通过 `bun run check` 验证类型

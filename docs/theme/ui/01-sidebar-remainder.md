# Batch 01 — sidebar 剩余 props-driven

## 状态

**done**

## 本批迁入

| 组件 | theme-ui 路径 | desktop |
|------|---------------|---------|
| `RunningPulseDot` | `sidebar/RunningPulseDot.tsx` | re-export |
| `SessionStatusIcon` | `sidebar/SessionStatusIcon.tsx` | re-export |
| `SidebarUpdateIcon` | `sidebar/SidebarUpdateIcon.tsx` | re-export |
| `ShowMoreSessionsButton` | `sidebar/ShowMoreSessionsButton.tsx`（labels props） | adapter：`t()` 后传入 |
| `SidebarTopBar` | `sidebar/SidebarTopBar.tsx`（labels + `brandTrailing`） | adapter：i18n + `<SidebarUpdateButton />` |

## 暂缓（显式）

| 组件 | 原因 |
|------|------|
| `ProjectsPanel` / ProjectRow / SessionRow 数据树 | atoms + IPC + 虚拟列表 |
| `SettingsMenu*` / `MessageCenter*` | Popover/Dialog + 业务 model |
| `AddProjectMenu*` | 菜单业务 |
| `SidebarFilterSelect` / `FilterSelectPopover` | Popover 原语 + atom |
| `SidebarUpdateButton` | connected model 留 desktop |
| `SidebarBottomBar` | 组合上述业务组件 |

## 布局/样式

- TopBar DOM/class 与迁移前一致；仅将 UpdateButton 经 slot 注入
- ShowMoreSessionsButton class 字符串未改；文案由 host 预解析

## check

`bun run check`（本批后）

## commit

子 Agent `/gitcommit`（无 push）

# Batch 99 — 最终审计

## 状态

**done**

## Eligible 已迁入 `@vetta/theme-ui`（按域）

| 域 | 内容 |
|----|------|
| layout | AppFrame, MainContentFrame, SidebarDock/Overlay, ResizeHandle |
| appearance | ThemeSurface + image frames |
| app | AppBackground |
| app-shell | DefaultPageHeader 系、DefaultWindowControls、WindowControlButton |
| sidebar | DefaultSidebar shell、Panel、Navigation、NavItem、TopBar、UpdateIcon、SessionStatusIcon、RunningPulseDot、ShowMoreSessionsButton |
| overlays | KnowledgeDropOverlayView、UpdateRestartDialogView |
| chat | InputBarBackground、NewSession types、AtPanelView、SlashPanelView、DefaultGuidingWords |

## 仍在 desktop-app（符合设计边界）

- Connected：`Sidebar`、`PageHeader`、`WindowControls`、各 page container
- Model：`use*Model` + ThemeHost 注入
- 业务子树：ProjectsPanel、SettingsMenu、MessageCenter、InputBar 组合、MessageList、设置页、审批 Dialog 等

## 显式暂缓（见各 batch 文档）

- 依赖 Dialog/Drawer/Popover/Button host 原语的浮层与审批
- 设置页 IA 组件（SettingSection 等未公开）
- chat InputBar/MessageList 大块
- 侧栏 projects 数据树

## 样式扫描

- `packages/desktop-app/src/renderer/styles.css` 含 `@source "../../../theme-ui/src/**/*.{ts,tsx}"`（修复 window control iconify 类）

## 验证

- 分批 `bun run check` 均 exit 0（scratch：`check-01-sidebar.log` … `check-final.log`）
- 分批 commit 由子 Agent `/gitcommit` 产生，无 push

## 验收说明

「全部 UI」按设计文档解释为 **全部 eligible props-driven 默认 view**；connected/data/host-primitive 阻塞项已书面暂缓，非遗漏。

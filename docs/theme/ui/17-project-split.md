# Batch 17 — project 域 must_split 清空

## 状态

**done**

## 本批拆分 + 迁入

| 组件 | 数据层（desktop） | UI 层（theme-ui / desktop View） | 状态 |
|------|-------------------|----------------------------------|------|
| InlineSessionRenameInput | `useInlineSessionRenameModel` | `project/SessionRenameInputView` | split_ok |
| DefaultSessionRenameInput | `useDefaultSessionRenameModel` | `project/SessionRenameInputView` | split_ok |
| SessionRow | `useSessionRowModel` | `project/SessionRowView` | split_ok |
| DefaultSessionRow | `useDefaultSessionRowModel` | `project/DefaultSessionRowView` | split_ok |
| ProjectRow | `useProjectRowModel` | `project/ProjectRowView` | split_ok |
| ProjectSessions | `useProjectSessionsModel` | `project/ProjectSessionsView` | split_ok |
| ProjectGroup | `useProjectGroupModel` | `project/ProjectGroupView`（内嵌 SessionRowView） | split_ok |
| DefaultSessionList | `useDefaultSessionListModel` | `project/DefaultSessionListView` | split_ok |
| DefaultConversationSection | `useDefaultConversationSectionModel` | `project/DefaultConversationSectionView` + filter/list slots | split_ok |
| ProjectsPanel | 既有 `useProjectsPanelModel` + split ratio atoms | `project/ProjectsPanelView` | split_ok |
| ProjectsPanelMenus | `useProjectsPanelMenusModel` | `project/ProjectsPanelMenusView` + 菜单 slots | split_ok |
| SessionContextMenu | `useSessionContextMenuModel` | `project/SessionContextMenuView` | split_ok |
| ProjectContextMenu | `useProjectContextMenuModel` | `project/ProjectContextMenuView` | split_ok |
| SidebarFilterSelect | `useSidebarFilterSelectModel` | desktop `SidebarFilterSelectView`（host Popover） | split_ok + host_primitive_hold |
| SidebarProjectsSection | `useSidebarProjectsSectionModel` | `project/SidebarProjectsSectionView` + slots | split_ok |
| ScheduleStatus | `useScheduleStatusModel` | `project/ScheduleStatusView` | split_ok |
| BatchQueueStatus | `useBatchQueueStatusModel` | `project/BatchQueueStatusView` | split_ok |
| ProjectDetailPage | `useProjectDetailPageModel` | `project/ProjectDetailPageView` + batch/flowing/activity/dialog slots | split_ok |

### 路径速查

**theme-ui**（新建 domain）

- `packages/theme-ui/src/project/`
- package export：`@vetta/theme-ui/project`

**desktop model**

- `packages/desktop-app/src/renderer/domains/project/hooks/use*Model*.ts`

**host_primitive_hold**

- `SidebarFilterSelectView.tsx`（host Popover；禁止 native 替换 Select）
- 既有 `FilterSelectPopover.tsx` 保持 hold

### 模式

- model：atoms / IPC / router / i18n / domain types → plain props（labels / 预解析 status/time / callbacks）
- container：`useXxxModel()` → `*View`（≤50 行 thin-model-container 或 container-with-view → `split_ok`）
- view：plain props；禁止 jotai / `window.vetta` / router / react-i18next / `@shared/*` / `@domains/*`
- ProjectDetailPage：`batchSection` / `flowingSection` / `workflowProgressSection` / `activityPanel` / `bindDialog` 为 ReactNode slots
- FilterSelect：host Popover 留 desktop View + `host_primitive_hold`
- Action / 菜单按钮：theme-ui 用 native `<button>` 复刻原 ghost/icon 样式
- ProjectSessions / DefaultSessionList：Virtuoso 在 theme-ui（peer `react-virtuoso`）
- 样式/布局零 diff 优先：className 与结构原样迁移

### 验收

- inventory：本批 18 路径 → `split_ok` / `host_primitive_hold`，不在 must_split / must_migrate
- `bun packages/theme-ui/scripts/verify-purity.mjs`
- `bun run check`

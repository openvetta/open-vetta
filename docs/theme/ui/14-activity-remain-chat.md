# Batch 14 — activity 剩余 + chat 中小 must_split

## 状态

**done**

## 本批拆分 + 迁入

| 组件 | 数据层（desktop） | UI 层（theme-ui） | 状态 |
|------|-------------------|-------------------|------|
| BrowserPanel | `useBrowserPanelModel`（atoms / webview 事件 / openExternal / i18n） | `activity/BrowserPanelView` | split_ok |
| FileTabContent | `useFileTabContentModel`；slot 挂 `FilesPanel` / `FilePreviewView` | `activity/FileTabContentView`（内嵌 theme-ui `ResizeHandle`） | split_ok |
| JourneyPanel | `useJourneyPanelModel`（API / profile / preview / 预解析 stage 树） | `activity/JourneyPanelView` | split_ok |
| ScheduleExecutionTabPanel | `useScheduleExecutionTabPanelModel`；slot 挂 host `Button` | `activity/ScheduleExecutionTabPanelView` | split_ok |
| AppshotCard | `useAppshotCardModel`（preview atom / mediaUrl / i18n） | `chat/AppshotCardView` | split_ok |
| ChatExportHost | `useChatExportHostModel`；slot 挂 `ExportMessageList` | `chat/ChatExportHostView` | split_ok |
| ContextRing | `useContextRingModel` | `chat/ContextRingView` | split_ok |
| ExecutionModeSelector | `useExecutionModeSelectorModel` + `useThemeComponent` | View 仍 desktop `execution-mode-selector/ExecutionModeSelectorView`（Popover → `host_primitive_hold`） | split_ok |
| SandboxGrantsBadge | `useSandboxGrantsBadgeModel`（IPC grants / i18n） | `chat/SandboxGrantsBadgeView` | split_ok |
| EditDiffView | desktop adapter：parseDiff + i18n | `chat/EditDiffView`（`DiffPreviewView` / `EditTextFallbackView`） | migrated |
| ReadImageView | `useReadImageViewModel`（format + showItemInFolder） | `chat/ReadImageView` | split_ok |
| KnowledgeToolViews | desktop adapter：block → plain props + i18n | `chat/KnowledgeToolViews` | migrated |

### 路径速查

**theme-ui**

- `packages/theme-ui/src/activity/BrowserPanelView.tsx`
- `packages/theme-ui/src/activity/FileTabContentView.tsx`
- `packages/theme-ui/src/activity/JourneyPanelView.tsx`
- `packages/theme-ui/src/activity/ScheduleExecutionTabPanelView.tsx`
- `packages/theme-ui/src/chat/AppshotCardView.tsx`
- `packages/theme-ui/src/chat/ChatExportHostView.tsx`
- `packages/theme-ui/src/chat/ContextRingView.tsx`
- `packages/theme-ui/src/chat/SandboxGrantsBadgeView.tsx`
- `packages/theme-ui/src/chat/EditDiffView.tsx`
- `packages/theme-ui/src/chat/ReadImageView.tsx`
- `packages/theme-ui/src/chat/KnowledgeToolViews.tsx`

**desktop model**

- `packages/desktop-app/src/renderer/domains/activity-panel/hooks/useBrowserPanelModel.ts`
- `packages/desktop-app/src/renderer/domains/activity-panel/hooks/useFileTabContentModel.ts`
- `packages/desktop-app/src/renderer/domains/activity-panel/hooks/useJourneyPanelModel.ts`
- `packages/desktop-app/src/renderer/domains/activity-panel/hooks/useScheduleExecutionTabPanelModel.tsx`
- `packages/desktop-app/src/renderer/domains/chat/hooks/useAppshotCardModel.ts`
- `packages/desktop-app/src/renderer/domains/chat/hooks/useChatExportHostModel.ts`
- `packages/desktop-app/src/renderer/domains/chat/hooks/useContextRingModel.ts`
- `packages/desktop-app/src/renderer/domains/chat/hooks/useExecutionModeSelectorModel.ts`
- `packages/desktop-app/src/renderer/domains/chat/hooks/useSandboxGrantsBadgeModel.ts`
- `packages/desktop-app/src/renderer/domains/chat/hooks/useReadImageViewModel.ts`

### 模式

- model：atoms / IPC / API / i18n → plain props（预解析 labels / status meta / media URL / stage 树）
- container：`useXxxModel()` → `*View`（≤50 行 thin-model-container → `split_ok`；或 hasTheme pure adapter → `migrated`）
- view：plain props；禁止 jotai / `window.vetta` / router / react-i18next / `@shared/*` / `@domains/*`
- ScheduleExecution：host `Button` 在 model 内组装为 ReactNode slots（避免 theme-ui 依赖 host Button）
- FileTabContent：`FilesPanel` / `FilePreviewView` 为 slots；resize 用 theme-ui `ResizeHandle`
- ExecutionModeSelector：View 仍依赖 host Popover，保持既有 `host_primitive_hold` deferral
- 样式/布局零 diff：原 className、motion 参数、结构原样迁移

### 验收

- inventory：本批 12 路径 → `split_ok` 或 `migrated`，不再出现在 must_split / must_migrate
- `bun packages/theme-ui/scripts/verify-purity.mjs`
- `bun run check`

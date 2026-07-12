# Batch 11 — activity-panel + chat 小 must_split 拆分并迁入 theme-ui

## 状态

**done**

## 本批拆分 + 迁入

| 组件 | 数据层（desktop） | UI 层（theme-ui） | 状态 |
|------|-------------------|-------------------|------|
| BatchProgressTabPanel | `useBatchProgressTabPanelModel` + thin container（slot 挂 `BatchQueueStatus`） | `activity/BatchProgressTabPanelView` | done |
| DebugTabPanel | `useDebugTabPanelModel` + thin container（slot 挂子 Tab） | `activity/DebugTabPanelView` | done |
| BackgroundTasksTabPanel | `useBackgroundTasksTabPanelModel`（atoms/IPC/ticker/i18n meta） | `activity/BackgroundTasksTabPanelView` | done |
| ActionButtonBar | `useActionButtonBarModel` | `chat/ActionButtonBarView` | done |
| UsageBar | `useUsageBarModel` | `chat/UsageBarView` | done |
| QuestionPanel | `useQuestionPanelModel` + thin container + `useThemeComponent` | View 暂留 desktop `question-panel/QuestionPanelView`（host Button/Input + i18n） | done |
| WriteContentView | desktop adapter：parse args + i18n | `chat/WriteContentView` | done |
| KnowledgeProcessingBadge | `useKnowledgeProcessingBadgeModel`（IPC + i18n） | `knowledge/KnowledgeProcessingBadgeView` | done |

### 路径速查

**theme-ui**

- `packages/theme-ui/src/activity/BatchProgressTabPanelView.tsx`
- `packages/theme-ui/src/activity/DebugTabPanelView.tsx`
- `packages/theme-ui/src/activity/BackgroundTasksTabPanelView.tsx`
- `packages/theme-ui/src/chat/ActionButtonBarView.tsx`
- `packages/theme-ui/src/chat/UsageBarView.tsx`
- `packages/theme-ui/src/chat/WriteContentView.tsx`
- `packages/theme-ui/src/knowledge/KnowledgeProcessingBadgeView.tsx`

**desktop model**

- `packages/desktop-app/src/renderer/domains/activity-panel/hooks/useBatchProgressTabPanelModel.ts`
- `packages/desktop-app/src/renderer/domains/activity-panel/hooks/useDebugTabPanelModel.ts`
- `packages/desktop-app/src/renderer/domains/activity-panel/hooks/useBackgroundTasksTabPanelModel.ts`
- `packages/desktop-app/src/renderer/domains/chat/hooks/useActionButtonBarModel.ts`
- `packages/desktop-app/src/renderer/domains/chat/hooks/useUsageBarModel.ts`
- `packages/desktop-app/src/renderer/domains/chat/hooks/useQuestionPanelModel.ts`
- `packages/desktop-app/src/renderer/domains/knowledge-base/hooks/useKnowledgeProcessingBadgeModel.ts`

### 模式

- model：atoms / IPC / i18n → plain props（含预解析 labels / status meta / duration）
- container：`useXxxModel()` → `*View`（≤50 行 thin-model-container，或 adapter `migrated`）
- view：plain props；禁止 jotai / `window.vetta` / router / react-i18next / `@shared/*` / `@domains/*`
- 样式/布局零 diff：原 className、motion 参数、结构原样迁移

### 验收

- inventory：本批 8 路径 → `split_ok` 或 `migrated`，不再出现在 must_split / must_migrate
- QuestionPanelView 仍为 desktop host-primitive 混态文件（本批未迁，不在清单内）

# Batch 12 — activity 中等面板 + chat/shared 徽章拆分迁 theme-ui

## 状态

**done**

## 本批拆分 + 迁入

| 组件 | 数据层（desktop） | UI 层（theme-ui） | 状态 |
|------|-------------------|-------------------|------|
| KnowledgeHistoryPanel | `useKnowledgeHistoryPanelModel`（listSessions / clearRecords / navigate / confirm / i18n） | `activity/KnowledgeHistoryPanelView` | done |
| RequestHistorySubTab | `useRequestHistorySubTabModel`（listRequestFiles / preview atom / showInFolder / i18n） | `activity/RequestHistorySubTabView` | done |
| ToolCallsSubTab | `useToolCallsSubTabModel`（parseToolCalls / filter atoms / expand / i18n） | `activity/ToolCallsSubTabView` | done |
| MarkdownPreview | `useMarkdownPreviewModel`（theme atom / openExternal） | `activity/MarkdownPreviewView` | done |
| BackgroundTasksBadge | `useBackgroundTasksBadgeModel` | `chat/BackgroundTasksBadgeView` | done |
| SuggestionBubbles | `useSuggestionBubblesModel` | `chat/SuggestionBubblesView` | done |
| QueueCard | `useQueueCardModel`（queue atoms / reorder / remove） | `chat/QueueCardView` | done |

### 路径速查

**theme-ui**

- `packages/theme-ui/src/activity/KnowledgeHistoryPanelView.tsx`
- `packages/theme-ui/src/activity/RequestHistorySubTabView.tsx`
- `packages/theme-ui/src/activity/ToolCallsSubTabView.tsx`
- `packages/theme-ui/src/activity/MarkdownPreviewView.tsx`
- `packages/theme-ui/src/chat/BackgroundTasksBadgeView.tsx`
- `packages/theme-ui/src/chat/SuggestionBubblesView.tsx`
- `packages/theme-ui/src/chat/QueueCardView.tsx`

**desktop model**

- `packages/desktop-app/src/renderer/domains/activity-panel/hooks/useKnowledgeHistoryPanelModel.ts`
- `packages/desktop-app/src/renderer/domains/activity-panel/hooks/useRequestHistorySubTabModel.ts`
- `packages/desktop-app/src/renderer/domains/activity-panel/hooks/useToolCallsSubTabModel.ts`
- `packages/desktop-app/src/renderer/domains/activity-panel/hooks/useMarkdownPreviewModel.ts`
- `packages/desktop-app/src/renderer/domains/chat/hooks/useBackgroundTasksBadgeModel.ts`
- `packages/desktop-app/src/renderer/domains/chat/hooks/useSuggestionBubblesModel.ts`
- `packages/desktop-app/src/renderer/domains/chat/hooks/useQueueCardModel.ts`

### 模式

- model：atoms / IPC / router / i18n → plain props（labels / 预格式化 time / tokens / args JSON）
- container：`useXxxModel()` → `*View`（≤50 行 thin-model-container → inventory `split_ok`）
- view：plain props；禁止 jotai / `window.vetta` / router / react-i18next / `@shared/*` / `@domains/*`
- MarkdownPreview：theme-ui 使用 `react-markdown` + `remark-gfm`（peer，optional）；代码块复制用 `CodeBlockCopyButtonView` + `navigator.clipboard`；外链经 `onOpenExternal`
- QueueCard：`Reorder` 留 View；`onReorder(orderedIds)` 回 model 重排完整队列项
- 样式/布局零 diff：原 className、motion 参数、结构原样迁移

### 验收

- inventory：本批 7 路径 → `split_ok` 或 `migrated`，不再出现在 must_split / must_migrate
- `bun packages/theme-ui/scripts/verify-purity.mjs`
- `bun run check`

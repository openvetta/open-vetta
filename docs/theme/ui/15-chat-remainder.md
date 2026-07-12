# Batch 15 — chat 域剩余 must_split 清空

## 状态

**done**

## 本批拆分 + 迁入

| 组件 | 数据层（desktop） | UI 层（theme-ui / desktop View） | 状态 |
|------|-------------------|----------------------------------|------|
| AtPanel | `useAtPanelModel`（IPC fs / fuzzy / i18n） | 既有 `chat/AtPanelView` | split_ok |
| SlashPanel | `useSlashPanelModel`（IPC skills / i18n） | 既有 `chat/SlashPanelView` | split_ok |
| ModelSelector | `useModelSelectorModel`（atoms / session settings） | desktop `model-selector/ModelSelectorView`（DropdownMenu） | split_ok |
| GuideBadgeSwiper | `useGuideBadgeSwiperModel`（router / localStorage / i18n） | `chat/GuideBadgeSwiperView` | split_ok |
| MessageCardsHost | `useMessageCardsHostModel`（plugin cards / atoms） | `chat/MessageCardsHostView` + slot `MessageCards` | split_ok |
| SessionDropZone | `useSessionDropZoneModel`（atoms / drop IPC） | `chat/SessionDropZoneView` | split_ok |
| SessionViewerPage | `useSessionViewerPageModel`（router / viewer IPC / header Button slots） | `chat/SessionViewerPageView` + MessageList / ActivityPanel slots | split_ok |
| SkillPromptArea | `useSkillPromptAreaModel`（skills list / slash state） | `chat/SkillPromptAreaView` + SlashPanel slot | split_ok |
| QuestionPanelView | labels via `useQuestionPanelModel`；本地 types | desktop View + host Button/Input → `host_primitive_hold` | host_primitive_hold |
| TextBlock | `useTextBlockModel`（preview atoms / theme / file icon） | `chat/TextBlockView` | split_ok |
| AskUserQuestionView | desktop adapter：parse block + i18n | `chat/AskUserQuestionView` | migrated |
| BashTerminalCard | desktop adapter：format + CopyIconButton slot | `chat/BashTerminalCard` | migrated |
| ToolCallBlock | `useToolCallBlockModel`（atoms / plugin slots / body slots） | `chat/ToolCallBlockView` | split_ok |
| MessageBlockSegments | desktop adapter：i18n summary + host tool/text children | `chat/MessageBlockSegmentsView`（ToolCallGroup / SegmentShell / ErrorBlock） | migrated |
| MessageItem | desktop adapter：i18n + role routing | `chat/MessageItemView` 等 | migrated |
| MessageListView | desktop：Virtuoso wiring | `chat/MessageListView` shell | migrated |
| AssistantMessage | `useAssistantMessageModel` + i18n labels / host slots | `chat/AssistantMessageView` | split_ok |
| UserMessage | `useUserMessageModel`（edit atoms / file preview / slots） | `chat/UserMessageView` | split_ok |

### 路径速查

**theme-ui（新增）**

- `packages/theme-ui/src/chat/GuideBadgeSwiperView.tsx`
- `packages/theme-ui/src/chat/SessionDropZoneView.tsx`
- `packages/theme-ui/src/chat/SessionViewerPageView.tsx`
- `packages/theme-ui/src/chat/SkillPromptAreaView.tsx`
- `packages/theme-ui/src/chat/MessageCardsHostView.tsx`
- `packages/theme-ui/src/chat/TextBlockView.tsx`
- `packages/theme-ui/src/chat/AskUserQuestionView.tsx`
- `packages/theme-ui/src/chat/BashTerminalCard.tsx`
- `packages/theme-ui/src/chat/ToolCallBlockView.tsx`
- `packages/theme-ui/src/chat/MessageBlockSegmentsView.tsx`
- `packages/theme-ui/src/chat/MessageItemView.tsx`
- `packages/theme-ui/src/chat/MessageListView.tsx`
- `packages/theme-ui/src/chat/AssistantMessageView.tsx`
- `packages/theme-ui/src/chat/UserMessageView.tsx`

**desktop model**

- `packages/desktop-app/src/renderer/domains/chat/hooks/useAtPanelModel.ts`
- `packages/desktop-app/src/renderer/domains/chat/hooks/useSlashPanelModel.ts`
- `packages/desktop-app/src/renderer/domains/chat/hooks/useModelSelectorModel.ts`
- `packages/desktop-app/src/renderer/domains/chat/hooks/useGuideBadgeSwiperModel.ts`
- `packages/desktop-app/src/renderer/domains/chat/hooks/useMessageCardsHostModel.ts`
- `packages/desktop-app/src/renderer/domains/chat/hooks/useSessionDropZoneModel.ts`
- `packages/desktop-app/src/renderer/domains/chat/hooks/useSessionViewerPageModel.tsx`
- `packages/desktop-app/src/renderer/domains/chat/hooks/useSkillPromptAreaModel.ts`
- `packages/desktop-app/src/renderer/domains/chat/hooks/useTextBlockModel.ts`
- `packages/desktop-app/src/renderer/domains/chat/hooks/useToolCallBlockModel.tsx`
- `packages/desktop-app/src/renderer/domains/chat/hooks/useUserMessageModel.tsx`
- `packages/desktop-app/src/renderer/domains/chat/hooks/useQuestionPanelModel.ts`（补 labels）

### 模式

- model：atoms / IPC / router / i18n → plain props（labels / slots / 预解析）
- container：`useXxxModel()` → `*View`（命名 `*View` JSX + `useThemeComponent` 以便 inventory 识别）
- view：plain props；禁止 jotai / `window.vetta` / router / react-i18next / `@shared/*` / `@domains/*`
- host 原语（Button/Input/DropdownMenu）：slots 或 desktop View + `host_primitive_hold`
- 样式/布局零 diff：className、motion 参数、结构原样迁移

### 验收

- inventory：本批 18 路径 → `split_ok` / `migrated` / `host_primitive_hold`，不在 must_split / must_migrate
- `bun packages/theme-ui/scripts/verify-purity.mjs`
- `bun run check`

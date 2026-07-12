# Batch 03 — chat props-driven views

## 状态

**done**

## 本批迁入

| 组件 | theme-ui | 说明 |
|------|----------|------|
| `AtPanelView` | `chat/AtPanelView.tsx` | 类型一并迁入；desktop re-export |
| `SlashPanelView` | `chat/SlashPanelView.tsx` | skill 用最小 `SlashPanelSkillItem`；desktop adapter 映射 `SkillInfo` |
| `DefaultGuidingWords` | `chat/DefaultGuidingWords.tsx` | 原 GuidingWordsView |

## 暂缓

| 组件 | 原因 |
|------|------|
| `InputBarView` | 大体积 + QueueCard/TodoCard/Drawer 等 host 组合 |
| `MessageListView` | atom + virtuoso 滚动模型 |
| `ChatView` / `DefaultChatView` / `ChatPageView` | connected 子树 |
| `ModelSelectorView` / `ExecutionModeSelectorView` | host UI + 业务 |
| `QuestionPanelView` / tool-views | atom + i18n + 业务 |
| `NewSessionPageView` | 组合 BotAvatar / host 卡片 |
| `ChatHeaderActionsView` | host actions |

## 布局/样式

- At/Slash 面板 class 与 motion 与迁移前一致
- GuidingWords 缓动常量内联到 theme-ui，数值不变

## check / commit

本批后执行

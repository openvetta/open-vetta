# Batch 03 — chat props-driven views

## 状态

**done**（含 skeptic 补迁）

## 已迁入 `@vetta/theme-ui/chat`

| 组件 | 说明 |
|------|------|
| `AtPanelView` | @ 面板 view |
| `SlashPanelView` | 斜杠面板 view（`SlashPanelSkillItem`） |
| `DefaultGuidingWords` | 引导词 |
| `SceneCard` | registry `chat.newSessionSceneCard` |
| `SkillCard` | registry `chat.newSessionSkillCard` |
| `DefaultSceneCarousel` | registry `chat.newSessionSceneCarousel` |
| `DefaultSkillBadgeRow` | registry `chat.newSessionSkillBadgeRow` |
| `InputBarToolbarButton` | 输入栏工具按钮（纯 props） |
| `InputBarBackground` / NewSession 类型 | 既有 |

## desktop 仍保留

| 组件 | 角色 |
|------|------|
| `SceneCarousel` / `SkillBadgeRow` | connected：i18n + registry 入口 |
| `NewSessionHero` / `NewSessionPageView` | BotAvatar + host 组合 |
| `InputBarView` | QueueCard/TodoCard/Drawer 等 host 组合 |
| `MessageListView` / `ChatView` | atom + virtuoso / connected 子树 |
| `ModelSelectorView` 等 | host UI + 业务 |

## 布局/样式

- 卡片/轮播/工具按钮 class 与迁移前一致；`cn` → `@vetta/ui`
- Scene/Skill carousel 文案仍由 desktop `t()` 注入

## check / commit

补迁后单独 `bun run check` + 子 Agent `/gitcommit`

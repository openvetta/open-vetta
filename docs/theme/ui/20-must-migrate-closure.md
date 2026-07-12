# Batch 20 — 清空全部剩余 must_migrate（门禁 exit 0）

## 状态

**done**

## 本批目标

清空 batch 19 遗留的全部 `must_migrate`（批前 42），使 inventory 门禁：

- `must_split_open == 0`
- `must_migrate_open == 0`
- `must_host_hold_open == 0`
- `bad_deferrals == 0`

## 结果

| 指标 | 批前 | 批后 |
|------|------|------|
| must_migrate_open | 42 | 0 |
| must_split_open | 0 | 0 |
| must_host_hold_open | 0 | 0 |
| bad_deferrals | 0 | 0 |
| migrated | 133 | 145 |
| permanent_desktop | 92 | 122 |

## 迁入 theme-ui

### `@vetta/theme-ui/knowledge`

| 组件 | 说明 |
|------|------|
| `KnowledgeContextMenuView` | pure props 右键菜单 |
| `KnowledgeViewShared`（StatusBadge / EmptyState / types） | labels 注入 |
| `KnowledgeGridView` / `KnowledgeListView` | 宫格/列表 + marquee + colored icons |
| `getColoredFileIcon` / `useMarqueeSelection` | 从 desktop 上提 |

### `@vetta/theme-ui/scheduler`（新 export）

| 组件 | 说明 |
|------|------|
| `TaskListView` | 既有 pure labels 卡片网格 |
| `ExecutionHistoryView` | labels + 本地 record shape |
| `HistoryDrawerView` | labels + `history` ReactNode slot |

### `@vetta/theme-ui/sidebar`

| 组件 | 说明 |
|------|------|
| `AddProjectMenuTriggerView` | pure trigger |
| `AddProjectMenuPopoverView` | pure popover（items 已解析 label） |

### `@vetta/theme-ui/settings`

| 组件 | 说明 |
|------|------|
| `PresetProviderModelsListView` | 模型行列表 |
| `ImStatusBadgeView` | 状态徽章 + label |

### `@vetta/theme-ui/skills`

| 组件 | 说明 |
|------|------|
| `PluginCardView` | pure model 卡片 |

## desktop 处理

- **thin re-export / i18n adapter**：Knowledge*、TaskListView、ExecutionHistoryView、HistoryDrawerView、AddProjectMenu*、PresetProviderModelsList、ImStatusBadge、PluginCard
- **permanent_desktop**（connected shell / host entry，boundary 1）— 本批 30 路径，包括：
  - knowledge：`KnowledgeContentsPanelView`
  - project sidebar：`AddProjectMenu`、`MessageCenter*`、`ProjectGroupsSection`、`SettingsMenuTrigger`、`SidebarBottomBar`、`SidebarUpdateButton`
  - settings page assemblers：`SettingsAiAssist`、`Achievement*`、`*SettingsView`、`SubscriptionCardsView`、`TeamList`、`TokenActivityChartView`、`Webhook*`、`PetBubbleStylePreview` 等
  - skills：`PluginDetailSheet`（host Switch）、`SkillTagGroup`（host SceneCard/SkillCard 组装）

## package.json

- 新增 export：`@vetta/theme-ui/scheduler`
- 根 `index` re-export `scheduler`
- knowledge / settings / sidebar / skills 扩充 export

## 验收

- `bun packages/theme-ui/scripts/eligible-inventory.mjs` → **exit 0**
- `bun packages/theme-ui/scripts/verify-purity.mjs` → OK
- `bun run check` → exit 0

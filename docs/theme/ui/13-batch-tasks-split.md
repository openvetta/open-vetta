# Batch 13 — batch-tasks 整域 must_split 清空

## 状态

**done**

## 本批拆分 + 迁入

| 组件 | 数据层（desktop） | UI 层（theme-ui） | 状态 |
|------|-------------------|-------------------|------|
| BatchProjectPromptField | `useBatchProjectPromptFieldModel` + thin container；slot 挂 `SkillPromptArea` | `batch-tasks/BatchProjectPromptFieldView` | split_ok |
| BatchProjectRuntimeFields | `useBatchProjectRuntimeFieldsModel` + thin container；slot 挂 `ModelSelect` | `batch-tasks/BatchProjectRuntimeFieldsView` | split_ok |
| BatchTaskCard | `useBatchTaskCardModel`（status/time labels） | `batch-tasks/BatchTaskCardView` | split_ok |
| BatchTaskGrid | `useBatchTaskGridModel` | `batch-tasks/BatchTaskGridView` | split_ok |
| BatchTaskProjectActions | `useBatchTaskProjectActionsModel` | `batch-tasks/BatchTaskProjectActionsView` | split_ok |
| BatchTaskProjectHeader | `useBatchTaskProjectHeaderModel` | `batch-tasks/BatchTaskProjectHeaderView` | split_ok |
| BatchTaskProjectBlock | `useBatchTaskProjectBlockModel`（counts/sort/map + callbacks） | `batch-tasks/BatchTaskProjectBlockView`（内嵌 filter/collapse） | split_ok |
| BatchProjectGroup | `useBatchProjectGroupModel` | `batch-tasks/BatchProjectGroupView` | split_ok |
| BatchTaskListView | desktop adapter：map blocks as children | `batch-tasks/BatchTaskListView` | migrated |
| BatchTasksPageView | desktop adapter：slots `list` + `dialog` + labels | `batch-tasks/BatchTasksPageView` | migrated |

### 路径速查

**theme-ui**（新建 domain）

- `packages/theme-ui/src/batch-tasks/`
- package export：`@vetta/theme-ui/batch-tasks`

**desktop model**

- `packages/desktop-app/src/renderer/domains/batch-tasks/hooks/useBatchProjectPromptFieldModel.ts`
- `packages/desktop-app/src/renderer/domains/batch-tasks/hooks/useBatchProjectRuntimeFieldsModel.ts`
- `packages/desktop-app/src/renderer/domains/batch-tasks/hooks/useBatchTaskCardModel.ts`
- `packages/desktop-app/src/renderer/domains/batch-tasks/hooks/useBatchTaskGridModel.ts`
- `packages/desktop-app/src/renderer/domains/batch-tasks/hooks/useBatchTaskProjectActionsModel.ts`
- `packages/desktop-app/src/renderer/domains/batch-tasks/hooks/useBatchTaskProjectHeaderModel.ts`
- `packages/desktop-app/src/renderer/domains/batch-tasks/hooks/useBatchTaskProjectBlockModel.ts`
- `packages/desktop-app/src/renderer/domains/batch-tasks/hooks/useBatchProjectGroupModel.ts`
- `packages/desktop-app/src/renderer/domains/batch-tasks/hooks/useBatchTaskListLabels.ts`
- `packages/desktop-app/src/renderer/domains/batch-tasks/hooks/useBatchTasksPageModel.ts`（扩展 labels）

### 模式

- model：atoms / i18n / domain types → plain props（预解析 status/time labels、counts、callbacks）
- container：`useXxxModel()` → `*View`（≤50 行 thin-model-container → `split_ok`；或 hasTheme pure adapter → `migrated`）
- view：plain props；禁止 jotai / `window.vetta` / router / react-i18next / `@shared/*` / `@domains/*`
- PromptField：`SkillPromptArea` 仍 host，theme-ui 仅 slot shell
- RuntimeFields：`ModelSelect` 为 slot；concurrency/timeout/sandbox 用 native control + 原布局 className
- Action 按钮：theme-ui 用 native `<button>` 复刻原 ghost/icon 样式（避免 host Button）
- PageView：`list` / `dialog` ReactNode slots，避免 theme-ui import desktop
- 样式/布局零 diff 优先：结构与 className 原样迁移

### 验收

- inventory：本批 10 路径 → `split_ok` 或 `migrated`，不再出现在 must_split / must_migrate
- `bun packages/theme-ui/scripts/verify-purity.mjs`
- `bun run check`

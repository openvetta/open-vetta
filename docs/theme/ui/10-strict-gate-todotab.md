# Batch 10 — 严格 must_split 门禁 + TodoTabPanel 拆分

## 状态

**done**

## 门禁变更

| 产物 | 作用 |
|------|------|
| `packages/theme-ui/scripts/eligible-inventory.mjs` | 闭合条件改为 `must_split_open + must_migrate_open + must_host_hold_open == 0`；禁止「等拆 model」类 deferral |
| `packages/theme-ui/scripts/rebuild-deferrals.mjs` | 按分类重建 `deferrals.json`（仅 permanent_desktop / host_primitive_hold / non_goal） |
| `docs/theme/ui/deferrals.json` | 重建后的有效 deferral 清单 |

## 本批拆分 + 迁入

| 组件 | 数据层（desktop） | UI 层（theme-ui） |
|------|-------------------|-------------------|
| TodoTabPanel | `useTodoTabPanelModel` + thin container | `activity/TodoTabPanelView` |

### 模式

- model hook：`atoms` + `useTranslation` → `{ items, emptyLabel }`
- container：`<TodoTabPanelView … />` + 既有 TodoCard 中文 labels（与 host `TodoCard` adapter 一致，零文案 diff）
- view：空态 / `TodoCard` 纯 props

### 验收

- inventory：`TodoTabPanel.tsx` → `split_ok`（thin-model-container）
- 布局/样式：未改 className 与 TodoCard 路径

## 本批后 backlog（gate 快照）

运行 `bun packages/theme-ui/scripts/eligible-inventory.mjs` 时以 stdout 为准；本批完成后约：

- must_split ≈ 125
- must_migrate ≈ 103
- must_host_hold = 0

## check / commit

`bun run check` + 子 Agent `/gitcommit`（不 push）

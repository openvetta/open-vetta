# Batch 23 — Residual map（门禁 open=0 之后还剩什么）

## 状态

**in_progress**（Phase α 盘点 + Phase β 首刀漏拆）

## 为何 open=0 不是「全部迁完」

`eligible-inventory.mjs` 只失败于：

- `must_split_open` / `must_migrate_open` / `must_host_hold_open` / `bad_deferrals`

**不算失败但仍大量存在**：

| 桶 | 约数 | 含义 |
|----|------|------|
| migrated / thin re-export | ~178 | 已进 theme-ui |
| split_ok | ~114 | desktop 薄容器 + model + View |
| **host_primitive_hold** | **91** | props 化但依赖 host Dialog/Button…，**等 @vetta/ui 再迁** |
| permanent_desktop | ~67–79 | 壳 / entry / 组装 / host chrome |
| non_goal | plugins 等 | 边界外 |

规模（survey）：renderer `.tsx` ~501，theme-ui `.tsx` ~217，deferrals ~162。

## Phase α 产物

| 产物 | 路径 |
|------|------|
| hold 全量清单 | [host-primitive-hold-list.json](./host-primitive-hold-list.json) |
| survey 脚本 | `packages/theme-ui/scripts/survey-renderer-ui.mjs` |
| hold 导出脚本 | `packages/theme-ui/scripts/export-host-holds.mjs` |

### host_primitive_hold 按域

| domain | count | 迁移优先 |
|--------|------:|----------|
| settings | 42 | **P0** Phase γ |
| action-approval / shared | 11+ | P1 |
| knowledge-base | 8 | P1 |
| skills | 6 | P1 |
| project | 5 | P2 |
| chat | 4 | P2 |
| flowing | 4 | P2 |
| batch-tasks / scheduler / auth / activity | 其余 | P2–P3 |

### mixed 无 model/view（12）分类

| 路径 | 分类 | 说明 |
|------|------|------|
| pet/*、onboarding/*、quickpanel/* | **non_goal** | 边界 2 可延后 |
| plugins/* | **non_goal** | 已 defer |
| ThemeRuntimeProvider、ThemePageRoute | **真壳** | theme 运行时，permanent |
| **FlowingMessageList** | **漏拆** | 默认 UI 混态 → Phase β 已拆 |

### pure 无 theme 且未 defer（survey 提示）

大量为：

- `shared/components/ui/*` → **host design-system 实现**（门禁现归 permanent：等 @vetta/ui）
- onboarding/pet/quickpanel 叶子 → non_goal
- 极薄 page 壳（re-export/container）→ permanent 或 split_ok

## Phase β（本批）

1. **FlowingMessageList** → `useFlowingMessageListModel` + `FlowingMessageListView`（theme-ui/sidebar），host Button 经 `renderAction` slot
2. 门禁：`shared/components/ui/**`、`shared/theme/runtime|pages` 归 permanent host chrome/runtime

## Phase γ（未完成 — 主工作量）

不假迁 Dialog 进 theme-ui。二选一：

1. Dialog/Button/Select/Drawer 落到 **@vetta/ui**
2. 再把 hold view 按 **settings → skills/kb → approval → 其它** 迁入 theme-ui

没有 1，91 条 hold 可合法长期存在（props 化 + value import）。

## Phase δ

`bun run check` + inventory + purity + 反作弊 grep；默认路径零 diff 以结构/className 保留为准。

## 验收对照

- done ≠ 仅 open eligible = 0  
- done = 边界内 residual 关闭 + 无假 hold/stub + 门禁严格 + 台账可查  
- 91 hold 清零依赖 γ，不是 α/β 单独完成项

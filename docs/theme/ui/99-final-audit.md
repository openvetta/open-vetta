# Batch 99 — 最终审计

## 状态

**done**（以机械门禁 exit 0 为准）

## 闭合标准（严格）

1. `bun packages/theme-ui/scripts/eligible-inventory.mjs` → **exit 0**
   - `must_split_open == 0`
   - `must_migrate_open == 0`
   - `must_host_hold_open == 0`
   - `bad_deferrals == 0`（禁止「等拆 model」类 deferral）
2. `bun packages/theme-ui/scripts/verify-purity.mjs` → exit 0
3. `bun run check` → exit 0
4. 台账批次 00–20 有记录

## 门禁快照（闭合时）

```json
{
  "migrated": 145,
  "split_ok": 112,
  "must_split_open": 0,
  "must_migrate_open": 0,
  "must_host_hold_open": 0,
  "host_primitive_hold": 75,
  "permanent_desktop": 122,
  "non_goal": 19,
  "bad_deferrals": 0
}
```

## 边界回顾

1. Connected 容器、`useXxxModel`、atoms、IPC **永留 desktop**；拆完 = model + props view，不是把容器塞进组件库
2. 必须拆：默认 UI / 会主题化且混态；可延后：onboarding/pet/quickpanel/plugin 私有 → `non_goal`
3. 依赖 host Dialog 的 view：`host_primitive_hold`（props 化后暂留 desktop），不假迁 Dialog
4. 样式/行为零 diff 为验收重点
5. 进度不以「open eligible=0」旧定义，而以 must_split + must_migrate + must_host_hold open 全 0

## 迁入概览

见 README 批次表 00–20。theme-ui 域包括：layout / appearance / app-shell / sidebar / chat / overlays / activity / knowledge / skills / settings / shared / file-preview / batch-tasks / project / downloads / flowing / flowing-chat / file-explorer / scheduler / action-approval 等。

## deferrals 权威列表

**唯一权威**：`docs/theme/ui/deferrals.json`

| kind | 含义 |
|------|------|
| `permanent_desktop` | connected shell / host entry / model 组装 |
| `host_primitive_hold` | props view 仍依赖 host Dialog/Popover/Button 等 |
| `non_goal` | onboarding / pet / quickpanel / plugin 私有等 |

## 验收命令

```bash
bun packages/theme-ui/scripts/eligible-inventory.mjs
bun packages/theme-ui/scripts/verify-purity.mjs
bun run check
```

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
4. 台账批次 00–29 有记录（含 Goal A/B）

## 门禁快照（Batch 44 hold 清零）

```json
{
  "migrated": 265,
  "split_ok": 113,
  "must_split_open": 0,
  "must_migrate_open": 0,
  "must_host_hold_open": 0,
  "host_primitive_hold": 0,
  "permanent_desktop": 97,
  "non_goal": 19,
  "bad_deferrals": 0
}
```

- **Goal B**：`@vetta/ui` 含 Button/Dialog/Drawer/Select/Switch/Popover/**DropdownMenu**
- **Goal A 硬完成（hold=0）**：见 `44-hold-zero-closure.md`；容器/model 仍 permanent_desktop

### 反作弊（batch 21 + batch 22）

- stub `useXxxModel(){ return true }` **不计** real model
- null-only `*View.tsx` **不计** real view；`void View` import **不计** usesView
- `permanent_desktop` **不得**遮罩 substantial pure presentation（→ bad_deferral / must_migrate）
- **hasHostUi 仅 value import**（`import { Button } from .../ui/button` 等或 radix）；`import type { Button }` **不计**
- `_HostPrimitiveHold*` 假标记 → **bad_deferral**
- `host_primitive_hold` 无真实 value host UI → **bad_deferral**
- 详见 [21-skeptic-gate-fix.md](./21-skeptic-gate-fix.md)、[22-fake-host-hold-purge.md](./22-fake-host-hold-purge.md)

## 边界回顾

1. Connected 容器、`useXxxModel`、atoms、IPC **永留 desktop**；拆完 = model + props view，不是把容器塞进组件库
2. 必须拆：默认 UI / 会主题化且混态；可延后：onboarding/pet/quickpanel/plugin 私有 → `non_goal`
3. 依赖 host Dialog 的 view：`host_primitive_hold`（props 化后暂留 desktop），不假迁 Dialog
4. 样式/行为零 diff 为验收重点
5. 进度不以「open eligible=0」旧定义，而以 must_split + must_migrate + must_host_hold open 全 0

## 迁入概览

见 README 批次表 00–22。theme-ui 域包括：layout / appearance / app-shell / sidebar / chat / overlays / activity / knowledge / skills / settings / shared / file-preview / batch-tasks / project / downloads / flowing / flowing-chat / file-explorer / scheduler / action-approval 等。

## deferrals 权威列表

**唯一权威**：`docs/theme/ui/deferrals.json`

| kind | 含义 |
|------|------|
| `permanent_desktop` | connected shell / host entry / model 组装 |
| `host_primitive_hold` | props view **value import** host Dialog/Popover/Button/Select/Switch 等（type-only 无效） |
| `non_goal` | onboarding / pet / quickpanel / plugin 私有等 |

## 验收命令

```bash
bun packages/theme-ui/scripts/eligible-inventory.mjs
bun packages/theme-ui/scripts/verify-purity.mjs
bun run check
```

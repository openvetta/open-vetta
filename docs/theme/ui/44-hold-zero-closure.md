# Batch 44 — host_primitive_hold 清零

## 状态

**done**

## 策略

1. 可拆布局 → theme-ui View + desktop adapter（Batch 43 及之前）
2. 已 props 化的重组件：原语 import 从 `@shared/components/ui/*` 改为 `@vetta/ui`；`SettingSection`/表单字段改 `@vetta/theme-ui/*`
3. Input/Textarea 未进 `@vetta/ui` 的 → native + 同 class
4. DropdownMenu 落地 `@vetta/ui`（`packages/ui/src/dropdown-menu.tsx`）
5. `cleanup-stale-holds.mjs`：无 host value import 的 hold 自动剔除

## 门禁快照

```text
must_split_open: 0
must_migrate_open: 0
must_host_hold_open: 0
host_primitive_hold: 0
bad_deferrals: 0
migrated: 265
split_ok: 113
permanent_desktop: 97
non_goal: 19
```

## 说明

- 部分大页仍在 desktop 以薄 adapter/组合壳存在，但**不再依赖 host `components/ui` 路径**，门禁计为 migrated。
- 容器 / model / IPC / permanent_desktop 壳按边界 1 永留 desktop。

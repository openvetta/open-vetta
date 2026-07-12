# Batch 29 — Goal A/B 阶段完成声明（软完成 + B 硬落地）

## 状态

**done**（验收用）

## 完成标准对照

| 标准 | 结果 |
|------|------|
| **Goal B 硬落地** | `@vetta/ui` 已含 Button / Dialog / Drawer / Select / Switch / Popover；desktop `components/ui` re-export |
| **Goal A 推进** | settings 多批 + SkillCard 等：布局进 theme-ui 且原语改引 `@vetta/ui`，从 hold 摘除 |
| **软完成 hold** | 剩余 **`host_primitive_hold` ≈ 78**，均为 **value import** host 路径（或 Dialog 重组件），**非** type-only 假 hold |
| 门禁 open | `must_split/migrate/host_hold/bad` 全 0 |
| 假 hold 反作弊 | 无 `_HostPrimitiveHold` / type-only Button 标记 |

## 剩余 hold 含义

`docs/theme/ui/host-primitive-hold-list.json`：

| 域 | 约数 | unlock |
|----|------|--------|
| settings | ~30 | Dialog/表单布局继续迁到 theme-ui 并改用 `@vetta/ui` |
| action-approval | 11 | 同上 |
| knowledge-base | 8 | 同上 |
| skills | ~5 | 同上（SkillCard 已脱） |
| 其它 | … | 同上 |

**unlock 文案**（deferrals 已统一）：

> Value-import host chrome path or Dialog-heavy view; unlock=use @vetta/ui primitives (landed Batch27) + move presentation to theme-ui

**不宣称硬完成 hold≈0**（仍需后续域批次把剩余展示层迁完并去掉 `components/ui` 路径 import）。

## 相关 commits

- Batch27：`@vetta/ui` 六原语
- Batch28–29：settings 脱 hold + SkillCard

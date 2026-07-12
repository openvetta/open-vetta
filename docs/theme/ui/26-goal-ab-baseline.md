# Batch 26 — Goal A/B 基线

## 状态

**in_progress**（Goal B 原语已落地，见 Batch 27）

## 完成标准选择

本目标同时推进：

| 目标 | 策略 |
|------|------|
| **B（优先依赖）** | 将 Button / Dialog / Drawer / Select / Switch / Popover 落入 `@vetta/ui`；desktop `components/ui/*` re-export |
| **A** | hold 布局迁 theme-ui；原语改引 `@vetta/ui` 后可从 `host_primitive_hold` 摘除 |
| **硬完成倾向** | hold 计数尽量压低；剩余仅极少数无法无原语迁的条目则记 soft unlock |

## 基线（启动时）

- `host_primitive_hold` inventory ≈ 82
- export list total ≈ 90
- `@vetta/ui` 仅 Slider + cn

## 域顺序（A）

settings 剩余 → skills/kb → action-approval → chat/project/flowing…

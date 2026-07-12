# Batch 32 — SceneCard + project sidebar 脱 hold 续

## 状态

**done**

## 变更

| 组件 | theme-ui | 说明 |
|------|----------|------|
| SceneCard | SceneCardView | Button/Popover `@vetta/ui` |
| MessageCenterTrigger | MessageCenterTriggerView | 已含于 Batch31 提交 |
| SidebarFilterSelectView | theme-ui re-export | Popover `@vetta/ui` |

## 计数

`host_primitive_hold` ≈ **71**（基线 ~90 → 持续下降）

## 软完成说明

剩余 hold 主要为 Dialog/Drawer 重组件与表单（settings Account/Appearance/MCP Dialog、approval frames、kb import dialogs…）。

- **Goal B 原语已落地**（Batch27）
- **unlock** = 展示层迁 theme-ui 并改用 `@vetta/ui`（deferrals 已写）
- **不宣称 hard hold≈0**

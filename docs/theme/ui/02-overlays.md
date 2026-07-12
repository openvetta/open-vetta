# Batch 02 — root / overlays 纯 View

## 状态

**done**

## 本批迁入

| 组件 | theme-ui | desktop |
|------|----------|---------|
| `KnowledgeDropOverlayView` | `overlays/KnowledgeDropOverlayView.tsx` | re-export |
| `UpdateRestartDialogView` | `overlays/UpdateRestartDialogView.tsx` | re-export（footer 按钮用与 host Button 等价 class，避免 radix Button 依赖） |

## 暂缓（依赖 Dialog/Drawer/Popover 或业务子树）

| 组件 | 原因 |
|------|------|
| `GenericActionApprovalView` 等审批 View | `@shared/components/ui/dialog|drawer` + Button |
| `LoginDialogView` | BotAvatar + Button + 表单 |
| `FilePreviewDialogView` | atoms 类型 + 预览子组件 + IPC 链路 |
| `FlowingSendDialogView` / `WorkflowCompleteDialogView` | Dialog + Textarea + API 类型 |
| `ConfirmDialogView` | atom 驱动 / dialog 原语 |
| `RootLayoutView` | router connected |

**解锁条件**：将 Dialog/Drawer/Popover/Button 稳定迁入 `@vetta/ui` 后，再迁审批与登录浮层 view。

## 布局/样式

- KnowledgeDrop：DOM/class 原样
- UpdateRestart：布局原样；按钮 class 对齐 host `buttonVariants` ghost/primary + sm

## check / commit

本批后 `bun run check` + 子 Agent `/gitcommit`

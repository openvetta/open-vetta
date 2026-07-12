# Batch 42 — WorkflowComplete + MessageCenterDialog 脱 hold

## 状态

**done**

## 变更

| 组件 | 处理 |
|------|------|
| WorkflowCompleteDialogView | Dialog/Button → `@vetta/ui`，Textarea 改 native |
| MessageCenterDialog | 壳迁 theme-ui（radix + motion）；tabs/content slot |
| theme-ui | 依赖增加 `radix-ui`（消息中心动画 Dialog） |

## 计数

- hold: **30 → 28**
- open 桶: 0

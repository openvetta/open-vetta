# Batch 35 — approval / chat / scheduler / wechat 脱 hold

## 状态

**done**

## 迁入对照

| desktop | theme-ui |
|---------|----------|
| `chat/.../ExecutionModeSelectorView.tsx` | `chat/ExecutionModeSelectorView` |
| `action-approval/GenericActionApprovalView.tsx` | `action-approval/GenericActionApprovalView` |
| `action-approval/.../BatchTasksApprovalFrameView.tsx` | `action-approval/BatchTasksApprovalFrameView` |
| `settings/WechatBindDialogView.tsx` | `settings/WechatBindDialogView` |
| `scheduler/TaskFormDialogView.tsx` | `scheduler/TaskFormDialogView`（fields slot） |

## 计数

- `host_primitive_hold`: **57 → 52**
- `migrated`: **208 → 213**
- open / bad: 0

## 说明

- ExecutionMode `mode` 在 theme-ui 用 `string`，desktop model 收窄为 `SessionExecutionMode`
- TaskForm 字段体仍 desktop `SchedulerTaskFields`

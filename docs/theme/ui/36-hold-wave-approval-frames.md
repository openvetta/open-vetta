# Batch 36 — 审批 Frame / Navigation / SchedulerEdit / TaskApproval 脱 hold

## 状态

**done**

## 迁入对照

| desktop | theme-ui |
|---------|----------|
| `ManageActionApprovalFrameView` | re-export |
| `NavigationOpenApprovalView` | re-export |
| `SchedulerEditApprovalDrawerView` | theme shell + fields slot |
| `BatchTasksTaskApprovalView` | theme body + frame |

## 计数

- `host_primitive_hold`: **52 → 48**
- `migrated`: **213 → 217**

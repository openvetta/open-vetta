# Batch 34 — hold 中等组件迁入 theme-ui

## 状态

**done**

## 迁入对照

| desktop | theme-ui |
|---------|----------|
| `settings/ImLogDrawer.tsx` | `settings/ImLogDrawerView` |
| `shared/components/KnowledgeHowItWorksDialog.tsx` | `knowledge/KnowledgeHowItWorksDialogView` |
| `batch-tasks/.../BatchProjectFoldersField.tsx` | `batch-tasks/BatchProjectFoldersFieldView` |
| `batch-tasks/BatchProjectDialogView.tsx` | `batch-tasks/BatchProjectDialogView`（form slot） |

## 计数

- `host_primitive_hold`: **61 → 57**
- `migrated`: **204 → 208**
- open / bad_deferrals: 0

## 说明

- Dialog 表单体仍由 desktop `BatchProjectFormFields` 注入
- Textarea 用 native + 同 host class，避免依赖未进 `@vetta/ui` 的 Textarea

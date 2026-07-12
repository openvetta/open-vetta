# Batch 33 — hold 小组件迁入 theme-ui（第 1 波）

## 状态

**done**

## 背景

继续清 `host_primitive_hold`：展示布局进 `@vetta/theme-ui`，原语改用 `@vetta/ui`；desktop 仅 i18n / platform 薄 adapter。不改布局 className。

## 迁入对照

| desktop（adapter / re-export） | theme-ui |
|--------------------------------|----------|
| `batch-tasks/.../BatchTaskActionButtons.tsx` | `batch-tasks/BatchTaskActionButtonsView` |
| `action-approval/.../AppearanceApprovalDrawerView.tsx` | `action-approval/AppearanceApprovalDrawerView` |
| `settings/ShortcutRecorder.tsx` | `settings/ShortcutRecorderView`（platform fn 注入） |
| `settings/ImChannelCard.tsx` | `settings/ImChannelCardView` |
| `knowledge-base/KnowledgeSourcePicker.tsx` | `knowledge/KnowledgeSourcePickerView` |
| `knowledge-base/KnowledgeRenameDialog.tsx` | `knowledge/KnowledgeRenameDialogView` |
| `knowledge-base/KnowledgePendingFilesDialog.tsx` | `knowledge/KnowledgePendingFilesDialogView` |
| `activity-panel/PluginTabPicker.tsx` | `activity/PluginTabPickerView` |
| `shared/components/NewProjectDialog.tsx` | `project/NewProjectDialogView` |
| `project/.../FilterSelectPopover.tsx` | adapter → 已有 `sidebar/SidebarFilterSelectView` |

## deferrals

上述 10 条 `host_primitive_hold` 已删除。

## 计数（inventory）

- `host_primitive_hold`: **71 → 61**
- `migrated`: **194 → 204**
- open 桶均为 0

## 验收注意

- ShortcutRecorder：`eventToShortcut` / `formatShortcut` 仍由 desktop 注入
- NewProjectDialog：文案仍在 desktop adapter（与原硬编码一致）
- KnowledgeRename：host `Input` 改为同 class 的 native input（@vetta/ui 无 Input）

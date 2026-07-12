# Batch 19 — 清空 must_migrate 第 1 大波（action-approval + shared + 小叶子）

## 状态

**done**

## 本批目标

处理优先组 A/B/C 的 `must_migrate`：action-approval 全域、shared `ModelSelect`/`NewProjectDialog`、activity/batch/chat/flowing 小叶子。`must_split_open` 保持 0。

## 结果

| 指标 | 批前 | 批后 |
|------|------|------|
| must_migrate_open | 110 | 42 |
| must_split_open | 0 | 0 |
| must_host_hold_open | 0 | 0 |
| bad_deferrals | 0 | 0 |

本批优先路径 **全部** 离开 `must_migrate`。

## 迁入 theme-ui

### `@vetta/theme-ui/action-approval`（新 export）

| 组件 | 说明 |
|------|------|
| `ApprovalParts`（ValueRow/List/Target/Impact/Warning/FormField/Setting*/ToggleIntent/RawFallback） | pure props；RawFallback labels 注入 |
| `AppearanceActionPickerView` | themes/modes/cursors/labels 注入 |
| `WebhookDeleteApprovalView` / `WebhookTestApprovalView` | Frame slot + ApprovalParts |
| `ManageActionApprovalFrameProps` | Frame 类型 |

### 其它域

| 路径 | theme-ui |
|------|----------|
| ThinkingBlock | `chat/ThinkingBlockView` |
| InputActionBarView | `chat/InputActionBarView` |
| MessageActions | `chat/MessageActions`（CopyButton labels） |
| HtmlPreview | `activity/HtmlPreviewView`（SegmentedControl slot） |
| BatchProjectName/Notification/ArtifactField | `batch-tasks/*FieldView` |
| ChatMembersBar | `flowing-chat/ChatMembersBarView` |

## desktop 处理

- **thin re-export / i18n adapter**：ApprovalParts、AppearanceActionPicker、Webhook*View、ThinkingBlock、InputActionBarView、MessageActions、HtmlPreview、BatchProject*Field、ChatMembersBar
- **host_primitive_hold**：`NewProjectDialog`（import 改为 `@shared/components/ui/*` 以触发 hasHostUi）
- **permanent_desktop**（boundary 1 — connected presenter / assembler / host chrome）：
  - action-approval 全部 `useActionApproval` 连接器（manage/navigation/scheduler 等）
  - `SchedulerApprovalFields`（域表单包装）
  - `ModelSelect`（选项 hook + DropdownMenu chrome）
  - assemblers：`ActivityPanelView`、`ChatTabPanel`、`BatchProjectFormFieldsView`、`ChatPageView`、`DefaultChatView`、`MessageListFooter`、`MessageCards`、`NewSessionPageView`、`ChatComposer`
  - flowing graph：`transfer-edge`、`user-node`（依赖 `@xyflow/react`，未进 theme-ui peer）

## package.json

- 新增 export：`@vetta/theme-ui/action-approval`
- 根 `index` re-export `action-approval`

## 未处理（本批范围外 must_migrate=42）

- knowledge-base 列表/网格/菜单
- project sidebar（AddProjectMenu*、MessageCenter*、SettingsMenuTrigger、SidebarBottomBar 等）
- scheduler：`ExecutionHistoryView`、`HistoryDrawerView`、`TaskListView`
- settings 大量 View
- skills：`PluginCard`、`PluginDetailSheet`、`SkillTagGroup`

## 验收

- inventory：优先组 A/B/C 路径不在 must_migrate；`must_split_open == 0`
- `bun packages/theme-ui/scripts/verify-purity.mjs` OK
- `bun run check` exit 0

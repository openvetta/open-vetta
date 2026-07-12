# Batch 18 — 清空全部剩余 must_split

## 状态

**done**

## 本批目标

inventory 全部 `must_split`（31）→ `split_ok` / `host_primitive_hold` / theme-ui migrated；`must_split_open == 0`。

## 拆分 + 迁入表

| 组件 | 数据层（desktop） | UI 层（theme-ui / desktop View） | 状态 |
|------|-------------------|----------------------------------|------|
| KnowledgeBaseSwitcher | `useKnowledgeBaseSwitcherModel` | desktop `KnowledgeBaseSwitcherView`（host Popover） | split_ok + host_primitive_hold |
| ExecutionHistoryView | 既有 `useExecutionHistoryModel` | desktop View（去 store/atoms 假阳性） | must_migrate（本批 purges must_split） |
| HistoryDrawerView | 既有 `useHistoryDrawerModel` | desktop View + local task shape | must_migrate |
| TaskFormDialogView | 既有 `useTaskFormModel` + labels | desktop View（host Dialog） | host_primitive_hold |
| TaskListView | `useTaskListModel`（labels / id callbacks） | desktop pure View | must_migrate |
| AchievementSettings | `useAchievementSettingsModel` | desktop `AchievementSettingsView` | split_ok |
| AppearanceSettingsView | 既有 `useAppearanceSettingsModel` | desktop View（去 atoms 类型导入） | host_primitive_hold |
| BuiltinMcpSecretsDialog | `useBuiltinMcpSecretsDialogModel` | desktop `BuiltinMcpSecretsDialogView` | split_ok + host_primitive_hold |
| RemoteMcpSection | `useRemoteMcpSectionModel`（独立 hooks 文件） | desktop `RemoteMcpSectionView` | split_ok + host_primitive_hold |
| WechatBindDialog | `useWechatBindDialogModel` | desktop `WechatBindDialogView` | split_ok + host_primitive_hold |
| AppearanceActionPicker | — | pure props（本地 ThemeMode） | must_migrate |
| AppearancePickerApproval | `useAppearancePickerApprovalModel` + atoms | `AppearanceApprovalDrawerView` | split_ok |
| ThemeChangeApproval | `useThemeChangeApprovalModel` + atoms | `AppearanceApprovalDrawerView` | split_ok |
| BatchTasksExecution/Project/TaskApproval | model marker + sibling `*View` + Frame | `BatchTasksApprovalFrameView` | split_ok |
| DownloadsCancel / McpUpsert / ModelsUpsert / PluginsSetEnabled / Webhook*Approval | `use*Model` + `ManageActionApprovalFrame` | Frame shell | split_ok |
| WebhookDelete/TestApproval | `useWebhook*ApprovalModel` | `Webhook*ApprovalView` | split_ok |
| SchedulerUpdateApproval | `useSchedulerUpdateApprovalModel` | `SchedulerEditApprovalDrawerView` | split_ok |
| RouteErrorPage | `useRouteErrorPageModel` | theme-ui `overlays/RouteErrorPageView` + Link slot | split_ok |
| ConfirmDialog | `useConfirmDialogModel` | theme-ui `overlays/ConfirmDialogView` | split_ok |
| Toaster | `useToasterModel` | theme-ui `overlays/ToasterView` | split_ok |
| UpdateChecker | `useUpdateCheckerModel` | theme-ui `overlays/UpdateCheckerView` | split_ok |

### theme-ui 新增

- `packages/theme-ui/src/overlays/ToasterView.tsx`
- `packages/theme-ui/src/overlays/UpdateCheckerView.tsx`
- `packages/theme-ui/src/overlays/ConfirmDialogView.tsx`
- `packages/theme-ui/src/overlays/RouteErrorPageView.tsx`
- package export：`@vetta/theme-ui/overlays` 扩展

### host_primitive_hold（本批登记）

- KnowledgeBaseSwitcherView（Popover/Button）
- TaskFormDialogView（Dialog/Button）
- AppearanceSettingsView（Popover）
- BuiltinMcpSecretsDialogView（Dialog/Button）
- RemoteMcpSection / RemoteMcpSectionView（Button）
- WechatBindDialogView（Dialog/Button）

### 模式

- model：atoms / IPC / router / i18n → plain props（labels / 预解析 / callbacks）
- container：`useXxxModel()` → `*View`（thin-model-container 或 container-with-view → `split_ok`）
- view：禁止 jotai / `window.vetta` / router / 假阳性 `store/atoms` 类型导入（含注释）
- host Dialog/Popover/Button：desktop View + `host_primitive_hold`；禁止 native 假替换
- manage 审批：`useManageApprovalFrame` 暴露 `ManageActionApprovalFrame`（*(View\|Frame) 后缀供 inventory 识别）
- 样式/布局零 diff 优先

### 验收

- inventory：`must_split_open == 0`（本批硬门禁）
- `must_migrate_open`：110（未在本批范围清空）
- `must_host_hold_open == 0`
- `bun packages/theme-ui/scripts/verify-purity.mjs`
- `bun run check` exit 0

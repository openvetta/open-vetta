# Batch 21 — Skeptic 门禁修复（真拆分 + 清除 pure permanent 遮罩）

## 状态

**done**

## 背景

验收被拒：
1. stub `useXxxModel(){ return true }` + null-only `*View` + `void View` 骗过 `split_ok`
2. `permanent_desktop` 贴在 substantial pure UI 上遮 `must_migrate`
3. 门禁已收紧 anti-gaming（`eligible-inventory.mjs`）——**未回退**

批前：`must_split≈17 must_migrate≈39 bad_deferrals≈39`

## 门禁规则（保留）

| 规则 | 说明 |
|------|------|
| stub model | `return true` 的 `useXxxModel` 不计 model |
| null-only View | 仅 `return null`、无 className 的 sibling View 不计 view |
| void View | `void XxxView` 不计 usesView |
| pure permanent | substantial pure（className>3 或 大文件+className）不可 `permanent_desktop` → bad_deferral / must_migrate |
| hasHostUi | 识别 dialog/drawer/popover/button/**dropdown-menu/select/switch/textarea/input** + radix |

## 本批结果

| 指标 | 批前 | 批后 |
|------|------|------|
| must_split_open | 17 | 0 |
| must_migrate_open | 39 | 0 |
| must_host_hold_open | 0 | 0 |
| bad_deferrals | 39 | 0 |
| split_ok | 99 | 114 |
| migrated | 145 | 149 |
| host_primitive_hold | 75 | 120 |
| permanent_desktop | 79 | 79 |

## A. 真拆分（must_split → split_ok）

### action-approval

| 容器 | model | view |
|------|-------|------|
| `BatchTasksProjectApproval` | `useBatchTasksProjectApprovalModel` | `BatchTasksProjectApprovalView`（真实 body，非 null） |
| `BatchTasksExecutionApproval` | `useBatchTasksExecutionApprovalModel` | `BatchTasksExecutionApprovalView` |
| `BatchTasksTaskApproval` | `useBatchTasksTaskApprovalModel` | `BatchTasksTaskApprovalView` |
| `AppearancePickerApproval` | `useAppearancePickerApprovalModel` | `AppearancePickerApprovalView` |
| `ThemeChangeApproval` | `useThemeChangeApprovalModel` | `ThemeChangeApprovalView` |
| `SchedulerUpdateApproval` | `useSchedulerUpdateApprovalModel` | `SchedulerUpdateApprovalView` |

参考：`WebhookDeleteApproval` + `useWebhookDeleteApprovalModel` + `WebhookDeleteApprovalView`

### 已有 View、补 model 的 thin container

| 容器 | model |
|------|-------|
| `LoginDialog` | `useLoginDialogModel` |
| `FilePreviewDialog` | `useFilePreviewDialogModel` |
| `FlowingSendDialog` | `useFlowingSendDialogModel` |
| `WorkflowCompleteDialog` | `useWorkflowCompleteDialogModel` |
| `KnowledgeDropOverlay` | `useKnowledgeDropOverlayModel` |
| `TokenActivityChart` | `useTokenActivityChartModel` |
| `UpdateRestartDialog` | `useUpdateRestartDialogModel` |
| `ChatMessageList` | `useChatMessageListModel` + `ChatMessageListView` |
| `NotificationMessageList` | `useNotificationMessageListModel` + `NotificationMessageListView` |

### 其它

- `KnowledgeBaseListPageView`：fileStatuses 进 `useKnowledgeBaseListModel`，View 去 jotai → host_primitive_hold
- `AutomationPageView`：类型 import 改为 `scheduler-atoms`，去掉假 dataHeavy → host_primitive_hold

## B. 清除错误 permanent + migrate / host_hold

1. 从 `deferrals.json` **删除**全部 substantial pure 上的 `permanent_desktop`（41 条 bad）
2. 可迁 pure 叶子 → `@vetta/theme-ui`：
   - `shared/SegmentedControl`、`TimePicker`、`TabBar`、`BotAvatar`
   - `settings/TokenActivityChartView` + `token-activity` helpers
3. 仍依赖 host 原语 / 域组装的 props UI → `host_primitive_hold`（含 ChatComposer、SubscriptionCardsView、AchievementCarousel、settings *View、MessageCards、user-node 等）

## C. 验收

```bash
bun packages/theme-ui/scripts/eligible-inventory.mjs   # exit 0
bun packages/theme-ui/scripts/verify-purity.mjs       # exit 0
bun run check                                        # exit 0
```

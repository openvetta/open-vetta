# Batch 22 — 清除假 host_primitive_hold 后的 must_migrate 全清

## 状态

**done**

## 背景

1. 假标记 `_HostPrimitiveHold*` / `import type { Button }` 骗过 hasHostUi 已被门禁收紧否决
2. `eligible-inventory.mjs` anti-gaming：
   - hasHostUi **仅** value import（非 `import type`）指向 host ui 原语或 radix
   - `host_primitive_hold` 无真实 value host UI → **bad_deferral**
   - stub model / null View / pure permanent 遮罩仍禁止

批前：`must_migrate≈29 bad_deferrals≈29`

## 本批结果

| 指标 | 批前 | 批后 |
|------|------|------|
| must_migrate_open | 29 | 0 |
| must_split_open | 0 | 0 |
| must_host_hold_open | 0 | 0 |
| bad_deferrals | 29 | 0 |
| migrated | 149 | 178 |
| host_primitive_hold | 91 | 91 |
| permanent_desktop | 79 | 79 |
| split_ok | 114 | 114 |

## A. deferrals 清理

从 `deferrals.json` **删除** 29 条无 value host UI 的 `host_primitive_hold`（bad 列表路径）。  
保留真有 value import host Dialog/Drawer/Popover/Button/Select/Switch 的 hold。

## B. must_migrate → theme-ui（优先 A）

### settings

| theme-ui | desktop |
|----------|---------|
| `SettingChrome`（SettingRow/Section/Heading） | `shared.tsx` re-export |
| `SettingsSidebarView` | `SettingsSidebar` adapter |
| `SettingsPageShellView` | Mcp/Models/Webhook shell |
| `EnvironmentSettingsView` / `PermissionsSettingsView` | thin adapter + slots |
| `TeamListView` / `PetBubbleStylePreviewView` | labels/preview 注入 |
| `SubscriptionCardsView` | re-export |
| `AchievementPromotionBadge3D` | re-export |
| `AchievementCarousel`（desktop） | 直接用 theme-ui Curtains/Title + assets |

### sidebar / activity / chat / knowledge / skills

| theme-ui | desktop |
|----------|---------|
| `ChatMessageListView` / `NotificationMessageListView` | thin adapter |
| `SettingsMenuTriggerView` | i18n + UserAvatar 注入 |
| `ActivityPanelView` / `ChatTabPanelView` | slots 组装 domain panels |
| `MessageListFooterView` / `MessageCardsView` / `NewSessionPageLayoutView` | labels/slots |
| `KnowledgeContentsPanelView` | empty/content/dialog slots |
| `SkillTagGroupView` | cards slot |

### flowing / flowing-chat / action-approval

| theme-ui | desktop |
|----------|---------|
| `ChatComposerView` | re-export as ChatComposer |
| `UserNodeView` | re-export as UserNode |
| `AppearancePickerApprovalView` / `ThemeChangeApprovalView` | Drawer + picker slot |
| `BatchTasksExecutionApprovalView` | Frame + body props |
| `SchedulerUpdateApprovalView` | EditView slot |
| `GeneralSetExecutionModeApprovalView` | Frame + mode body |

## C. 门禁说明（type-only 不计 hasHostUi）

见 [99-final-audit.md](./99-final-audit.md) 反作弊表更新：

- `import type { Button } from ".../button"` **不计** hasHostUi
- `_HostPrimitiveHold*` 标记 → bad_deferral
- `host_primitive_hold` 必须伴随 **value** import host 原语

## 验收

```bash
bun packages/theme-ui/scripts/eligible-inventory.mjs   # exit 0
bun packages/theme-ui/scripts/verify-purity.mjs       # exit 0
bun run check                                        # exit 0
```

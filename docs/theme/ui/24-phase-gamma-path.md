# Batch 24 — Phase γ 原语路线 + settings hold 首批迁出

## 状态

**done**（路线已定；settings 首两批 slot 迁已提交 / 本批追加）

## 关于 Batch23 / FlowingMessageList

**不撤回** `527ba68a`。  
`FlowingMessageList` 已为真实 `useFlowingMessageListModel` + `theme-ui` `FlowingMessageListView`（host Button 经 `renderAction` slot），属于合法漏拆修复，不是错误提交。

## Phase γ 决策（边界 3）

`@vetta/ui` 当前仅导出 `Slider` + `cn`，**尚无** Dialog/Button/Select/Drawer。

| 选项 | 采用 |
|------|------|
| A. 先把 Dialog/Button… 整批落到 `@vetta/ui` | **延后**（独立大包，避免本目标膨胀） |
| B. view props 化 + slot 注入 host 原语；Dialog 重 view 继续 `host_primitive_hold` | **采用** |

**禁止**：把 desktop `components/ui/dialog|button` 实现硬拖进 `@vetta/theme-ui`。

### unlock 条件（写进 deferrals 语义）

`host_primitive_hold` 在 value import host Dialog/Button/Select… 时合法。  
当对应原语进入 `@vetta/ui` 后，按域批次去掉 hold 并改为 theme-ui 内使用 `@vetta/ui`。

## 本批迁出（settings，slot / 纯 view）

| desktop | theme-ui | 说明 |
|---------|----------|------|
| `SettingsAiAssistButton` | `SettingsAiAssistButtonView` | i18n adapter；outline+sm 类镜像 host Button |
| `ArchivedProjectsSettingsView` | 同名 View | 行操作 Button 经 `renderProjectActions` |
| `ImLegacyImportBanner` | `ImLegacyImportBannerView` | actions slot |
| `AchievementNavigationButton` | `AchievementNavigationButtonView` | `renderControl` 注入 host Button |
| `McpJsonEditor` | `McpJsonEditorView` | saveControl slot |
| `PresetProvidersSectionView` | 同名 | refreshControl + rows slots |
| `TeamSettingsView` | 同名 | headerActions / body / dialogs slots |
| `ShortcutsSettingsView` | 同名 | headerTrailing / recorder / quickPanel slots |
| `GeneralSettingsView` | 同名 | Select/Switch/UpdateChecker/export 控件 slot |
| `AppshotSettingsView` | 同名 | gesture Select + keyboard preview + 权限区 |

desktop 容器仍 value import Button 的路径 **继续 host_primitive_hold**。  
`SettingsAiAssistButton` 已无 host Button → 从 deferrals 移除，inventory 归 migrated/adapter。

## hold 剩余

以 `docs/theme/ui/host-primitive-hold-list.json` 为准（本批后重新导出）；settings 仍为最大桶。

## 后续 γ 批次建议

1. settings：General / Account / TeamList 等「布局 + 少量 Button」用 slot 迁  
2. skills/kb / approval：Dialog 壳继续 hold，body 可 props 化  
3. 独立 epic：@vetta/ui 落地 Button/Dialog/Select/Drawer 后再清 hold

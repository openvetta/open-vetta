# Batch 04 — settings 与其它域

## 状态

**done**（本批无新增迁入代码；完成 eligible 扫描与显式暂缓）

## 扫描结论

对 `settings` / `batch-tasks` / `scheduler` / `skills` / `activity-panel` / 剩余 `*View.tsx` 再扫：

| 路径 | 阻塞 |
|------|------|
| 几乎全部 `settings/*View` | `SettingSection` / `SettingRow` / `SettingsAiAssist` / 域内 Dialog 编辑器 |
| `WebhookSettingsView` | 同上 + `WebhookEditorDialog` |
| `EnvironmentSettingsView` | 同上 + model 类型绑在 desktop hook |
| `BatchProjectFormFieldsView` | 组合多个仍含业务/host 字段子组件 |
| `BatchTasksPageView` 等 | atom + i18n + app import |
| `AutomationPageView` / `TaskListView` 等 scheduler | atom + i18n + host |
| `SkillsPageView` / `PluginsPanelView` | i18n + host |
| `LoginDialogView` | BotAvatar + Button + form |
| 审批系 `*Approval*View` | Dialog/Drawer 原语 |
| `CodePreview` | 需 `shiki` peer；非主题优先面 |

**无**「仅 props + theme-sdk/ui/motion、且无 host 私有组件」的新增可迁项。

## 解锁后续迁移的前提

1. 将 `button` / `dialog` / `drawer` / `popover` / `input` / `textarea` 等稳定迁入 `@vetta/ui`（或 theme-ui 可依赖的 design system）
2. 将 `SettingSection`/`SettingRow` 等设置布局 primitive 公开为 props-driven API
3. 各域继续把 model 类型与文案解析收敛到 desktop model，view 只收 DTO

## 本批产出

- 本文件暂缓清单
- README 状态更新
- 无 theme-ui 代码变更（避免为迁而迁、拖入 host 依赖）

## check / commit

文档 + CHANGELOG 说明；`bun run check`；子 Agent `/gitcommit`

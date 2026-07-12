# Batch 04 — settings 与其它域

## 状态

**done**（扫描 + 显式暂缓；**不含** chat/new-session 纯叶子——那些在 batch 03 / 补迁）

## 范围澄清

本批只覆盖 **settings / batch-tasks / scheduler / skills 页 / activity 预览 / auth 浮层** 等。  
chat 侧 `SceneCard` / `DefaultSceneCarousel` / `InputBarToolbarButton` 等 **不属于本批暂缓对象**，应在 chat 批次迁入（已在 03 补迁）。

## 扫描结论（本批域）

| 路径 | 阻塞 |
|------|------|
| 几乎全部 `settings/*View` | `SettingSection` / `SettingRow` / `SettingsAiAssist` / 域内 Dialog |
| `WebhookSettingsView` | 同上 + `WebhookEditorDialog` |
| `EnvironmentSettingsView` | 同上 + model 绑 desktop hook |
| `BatchProjectFormFieldsView` | 组合仍含业务的 field 子组件 |
| scheduler / skills 页 View | atom / i18n / host |
| 审批 `*Approval*View` | Dialog/Drawer 原语 |
| `LoginDialogView` | BotAvatar + Button |
| `CodePreview` | 需 `shiki` peer；非主题优先面 |

## 解锁前提

1. Dialog/Drawer/Popover/Button → `@vetta/ui`  
2. SettingSection/Row 公开为 props-driven  
3. 各域 model DTO 与 i18n 继续收敛到 desktop

## check / commit

文档批；见最终审计

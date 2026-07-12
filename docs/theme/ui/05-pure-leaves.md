# Batch 05 — 多域 pure / 可拆 i18n 叶子

## 状态

**done**

## 本批迁入

| 组件 | theme-ui | desktop |
|------|----------|---------|
| `SandboxPermissionCard` | `chat/SandboxPermissionCard.tsx` | re-export |
| `SendButton` | `chat/SendButton.tsx` + `send-button.css` | i18n adapter |
| `CopyIconButton` | `chat/CopyIconButton.tsx` | i18n adapter |
| `TextPreview` | `chat/TextPreview.tsx` | i18n adapter |
| `SettingsMenuActionButton` | `sidebar/…` | re-export |
| `SettingsMenuDivider` | `sidebar/…` | re-export |
| `MessageCenterEmptyState` | `sidebar/…` | re-export |
| `MessageCenterToolbarButton` | `sidebar/…` | re-export |
| `ProjectsPanelEmptyState` | `sidebar/…` | i18n adapter |
| `ActivityPanelFrame` | `activity/ActivityPanelFrame.tsx` | re-export |

## 布局/样式

- SendButton CSS 整文件迁入 theme-ui 并 side-effect import
- 其余 class 字符串与迁移前一致

## check / commit

`bun run check` exit 0；子 Agent `/gitcommit`

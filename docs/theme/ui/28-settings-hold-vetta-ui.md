# Batch 28 — settings hold 改用 `@vetta/ui` 并脱 hold

## 状态

**done**

## 背景

Batch 27 后原语在 `@vetta/ui`。本批将若干 settings 展示层迁入 theme-ui 并直接引用 `@vetta/ui`，desktop 仅 adapter（无 `components/ui` value import）。

## 脱 hold 的路径

| desktop | theme-ui |
|---------|----------|
| GeneralSettingsView | Select/Switch/Button 在 theme-ui |
| AppshotSettingsView | Select 在 theme-ui |
| QuickPanelSettingsSection | Select 在 theme-ui |
| AchievementSettingsView | Select 在 theme-ui |
| ArchivedProjectsSettingsView | Button 在 theme-ui |
| ImLegacyImportBanner | Button 在 theme-ui |
| AchievementNavigationButton | Button 在 theme-ui |
| McpJsonEditor | Button 在 theme-ui |

## 计数

- inventory `host_primitive_hold`：~82 → **79**（另有 export 清单下降）
- settings 域 export：41 → **33**

## 剩余 settings hold

Dialog/Drawer 重组件与复合表单（Account、Agent、Appearance、MCP form、IM Dialog…）下批继续。

# Batch 09 — 机械库存门禁 + 菜单/消息中心 soft 叶子

## 状态

**done**

## 结构变更

| 产物 | 作用 |
|------|------|
| `packages/theme-ui/scripts/eligible-inventory.mjs` | 扫描 renderer 全部 `.tsx`，分类 migrated / eligible / blocked / host-ui / non-goal；**exit 1** 若仍有 open eligible 或 open host-ui |
| `docs/theme/ui/deferrals.json` | **逐路径** deferral（父容器 defer **不**覆盖子文件） |
| `package.json` `verify:eligible` | 门禁入口 |

权威证据：脚本 stdout → `{SCRATCH}/eligible-inventory.txt`（不再手写 residual 清单）。

## 本批迁入（soft:i18n 叶子）

| 组件 | theme-ui |
|------|----------|
| SettingsMenuAccountSection | sidebar |
| SettingsMenuDownloadsItem | sidebar |
| SettingsMenuSettingsItem | sidebar（从 Popover 内联抽出） |
| SettingsMenuThemeSection | sidebar |
| SettingsMenuQuotaSection | sidebar（countdown 由 host 预格式化） |
| MessageCenterTabs | sidebar（tabs labels 由 host 注入） |

## deferrals

其余 open eligible / host-ui 路径均写入 `deferrals.json` 并带 unlock 原因（Dialog 原语、数据树、shell 组装、知识库子树未拆等）。

## check / commit

`bun run check` + `verify:eligible` + 子 Agent `/gitcommit`

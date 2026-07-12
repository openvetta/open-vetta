# Batch 99 — 最终审计

## 状态

**done**（以机械门禁 exit 0 为准，非手写 residual）

## 闭合标准

1. `bun packages/theme-ui/scripts/eligible-inventory.mjs` → **exit 0**  
   - 每个 eligible / host-ui 路径要么 thin re-export/adapter 到 theme-ui，要么在 `docs/theme/ui/deferrals.json` 有**精确路径** + unlock  
2. `bun packages/theme-ui/scripts/verify-purity.mjs` → exit 0  
3. `bun run check` → exit 0  
4. 台账批次 00–09 有记录  

## 迁入概览

见 README 批次表；theme-ui 域：layout / appearance / app-shell / sidebar / chat / overlays / activity / knowledge / skills / settings / shared / file-preview。

## 暂缓

**唯一权威列表**：`docs/theme/ui/deferrals.json`（勿再维护手写 residual 平行清单）。

典型 unlock 类：

- Host Dialog/Drawer/Popover/Button → `@vetta/ui`  
- 数据树 atoms/IPC → model 拆分  
- Shell/assembler → 仅 container 留 desktop  
- Knowledge list/grid 子树未拆  
- SettingSection IA 未公开  

## 本轮额外迁入（门禁驱动）

SettingsMenu Account/Downloads/Settings/Theme/Quota 段、MessageCenterTabs（soft:i18n → props + adapter）。

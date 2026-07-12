# UI 组件迁移台账（desktop-app → `@vetta/theme-ui`）

本目录记录默认 UI 从 desktop-app 迁入 `@vetta/theme-ui` 的进度，供核查与验收。

## 范围约定

**迁入 theme-ui（eligible）**

- 已拆分或可拆分的 **props-driven view**
- 不依赖 Jotai / `window.vetta` / router / desktop-private `@shared/*` `@domains/*` 实现细节
- 依赖仅限：`react`、`motion`、`@vetta/theme-sdk`、`@vetta/ui`、theme-ui 内部

**留在 desktop-app**

- Connected container（取 model、registry、注入 slots）
- 真实 `useXxxModel` / host adapter
- 强业务数据树（如 `ProjectsPanel` 在未拆纯前）
- 依赖尚未进入 `@vetta/ui` 的宿主原语（Dialog/Drawer/Popover 等）的 view → **暂缓**，见各 batch 说明

**非目标**

- onboarding / pet / quickpanel / plugin 私有 UI
- 视觉改版、无关重构

## 批次索引

| ID | 批次 | 状态 | 记录 |
|----|------|------|------|
| 00 | 台账与已迁入盘点 | done | [00-ledger.md](./00-ledger.md) |
| 01 | sidebar 剩余 props-driven 叶子 / topBar shell | done | [01-sidebar-remainder.md](./01-sidebar-remainder.md) |
| 02 | root / overlays 纯 View | done | [02-overlays.md](./02-overlays.md) |
| 03 | chat props-driven views | done | [03-chat.md](./03-chat.md) |
| 04 | settings 与其它域已拆分 View | done（暂缓清单） | [04-settings-and-others.md](./04-settings-and-others.md) |
| 99 | 最终审计与暂缓清单 | done | [99-final-audit.md](./99-final-audit.md) |

## 每批流程（强制）

1. 纯度审计（store/IPC/router/i18n/app-import）
2. 必要时 UI/数据拆分（model 留 desktop，view 收 props）
3. 迁入 `packages/theme-ui/src/<domain>/`
4. desktop 改为 re-export 或 container + slots
5. 确认 `styles.css` 已 `@source` theme-ui（iconify 类）
6. `bun run check`
7. 更新本目录对应 batch 文档
8. **子 Agent** 执行 `/gitcommit`（只 commit 不 push），主 Agent 不代写 commit

## 验收对照

见仓库 goal plan：`docs/theme` 设计 + 本目录 status + check 通过 + 分批 commit 历史。

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
| 05 | 多域 pure / 可拆 i18n 叶子 | done | [05-pure-leaves.md](./05-pure-leaves.md) |
| 06 | DrawerCard / TodoCard | done | [06-chat-drawer-todo.md](./06-chat-drawer-todo.md) |
| 07 | skeptic pure leaves 补迁 | done | [07-skeptic-pure-leaves.md](./07-skeptic-pure-leaves.md) |
| 08 | skeptic2 pure leaves | done | [08-skeptic2-pure-leaves.md](./08-skeptic2-pure-leaves.md) |
| 09 | 机械库存门禁 + 菜单/消息中心 soft 叶子 | done | [09-inventory-gate.md](./09-inventory-gate.md) |
| 10 | 严格 must_split 门禁 + TodoTabPanel | done | [10-strict-gate-todotab.md](./10-strict-gate-todotab.md) |
| 11 | activity-panel + chat 小 must_split | done | [11-activity-chat-small-split.md](./11-activity-chat-small-split.md) |
| 12 | activity 中等面板 + chat/shared 徽章 | done | [12-activity-history-badges.md](./12-activity-history-badges.md) |
| 13 | batch-tasks 整域 must_split | done | [13-batch-tasks-split.md](./13-batch-tasks-split.md) |
| 14 | activity 剩余 + chat 中小 must_split | done | [14-activity-remain-chat.md](./14-activity-remain-chat.md) |
| 15 | chat 域剩余全部 must_split | done | [15-chat-remainder.md](./15-chat-remainder.md) |
| 16 | file-explorer / file-preview / downloads / flowing / flowing-chat / plugins | done | [16-files-flowing-plugins.md](./16-files-flowing-plugins.md) |
| 17 | project 整域 must_split | done | [17-project-split.md](./17-project-split.md) |
| 18 | 清空全部剩余 must_split（scheduler/settings/action-approval/shared） | done | [18-must-split-remainder.md](./18-must-split-remainder.md) |
| 19 | 清空 must_migrate 第 1 大波（action-approval + shared + 小叶子） | done | [19-must-migrate-wave1.md](./19-must-migrate-wave1.md) |
| 20 | 清空全部剩余 must_migrate（门禁 exit 0） | done | [20-must-migrate-closure.md](./20-must-migrate-closure.md) |
| 21 | Skeptic 门禁修复：真拆分 + 清 pure permanent 遮罩 | done | [21-skeptic-gate-fix.md](./21-skeptic-gate-fix.md) |
| 22 | 清除假 host_primitive_hold + must_migrate 全清 | done | [22-fake-host-hold-purge.md](./22-fake-host-hold-purge.md) |
| 23 | Residual map + 漏拆 FlowingMessageList + 门禁 host chrome | done | [23-residual-map.md](./23-residual-map.md) |
| 24 | Phase γ 路线 + settings hold slot 迁 | done | [24-phase-gamma-path.md](./24-phase-gamma-path.md) |
| 25 | Phase δ 验收台账 | done | [25-phase-delta-audit.md](./25-phase-delta-audit.md) |
| 26 | Goal A/B 基线 | done | [26-goal-ab-baseline.md](./26-goal-ab-baseline.md) |
| 27 | Goal B：Button/Dialog/Drawer/Select/Switch/Popover → @vetta/ui | done | [27-vetta-ui-primitives.md](./27-vetta-ui-primitives.md) |
| 28 | settings hold 改引 @vetta/ui 脱 hold | done | [28-settings-hold-vetta-ui.md](./28-settings-hold-vetta-ui.md) |
| 29 | Goal A/B 软完成声明 + SkillCard | done | [29-goal-ab-soft-complete.md](./29-goal-ab-soft-complete.md) |
| 30 | ModelsProviders + WebhookEndpointList 脱 hold | done | [30-settings-models-webhook.md](./30-settings-models-webhook.md) |
| 31 | KnowledgeBreadcrumb + ChatHeaderActions 脱 hold | done | [31-kb-chat-hold.md](./31-kb-chat-hold.md) |
| 32 | SceneCard + sidebar filter/trigger 脱 hold | done | [32-scene-sidebar-hold.md](./32-scene-sidebar-hold.md) |
| 33 | hold 小组件迁 theme-ui（10 条） | done | [33-hold-wave-small.md](./33-hold-wave-small.md) |
| 34 | hold 中等组件迁 theme-ui（4 条） | done | [34-hold-wave-medium.md](./34-hold-wave-medium.md) |
| 35 | approval/chat/scheduler/wechat 脱 hold | done | [35-hold-wave-approval-chat.md](./35-hold-wave-approval-chat.md) |
| 36 | approval frames / navigation / task 脱 hold | done | [36-hold-wave-approval-frames.md](./36-hold-wave-approval-frames.md) |
| 37 | SettingsMenuPopover + RemoteMcp 脱 hold | done | [37-hold-wave-remote-mcp-menu.md](./37-hold-wave-remote-mcp-menu.md) |
| 38 | SkillDetail/ModelsForm/ImFeishu/Achievement 脱 hold | done | [38-hold-wave-dialogs-forms.md](./38-hold-wave-dialogs-forms.md) |
| 99 | 最终审计与暂缓清单 | done | [99-final-audit.md](./99-final-audit.md) |

## 闭合门禁（验收用）

```bash
bun packages/theme-ui/scripts/eligible-inventory.mjs   # exit 0 才算闭合
bun packages/theme-ui/scripts/verify-purity.mjs
bun run check
```

**done 条件（严格）：**

- `must_split_open == 0`（渲染+业务态混在同一组件、默认/会主题化 UI 必须先拆 model+view）
- `must_migrate_open == 0`（已纯 props 的 view 须迁 theme-ui，或合法 defer）
- `must_host_hold_open == 0`（依赖宿主 Dialog 等原语的 props view 须登记 `host_primitive_hold`）
- `bad_deferrals == 0`（**禁止**「等拆 model / pending split」类 deferral）

**边界（不要误扩）：**

1. Connected 容器、`useXxxModel`、atoms、IPC **永留 desktop**；「拆完」≠ 容器进组件库
2. 必须拆 vs 可延后：默认 UI / 会主题化且混态 → 必须；onboarding/pet/quickpanel/plugin 私有、纯服务、一次性壳 → non_goal / permanent
3. 依赖 host Dialog 的 view：props 化后可 `host_primitive_hold`，**不要**假迁把 Dialog 硬拖进 theme-ui
4. 样式/行为零 diff；验收看默认路径行为
5. deferrals 仅允许：`permanent_desktop` | `host_primitive_hold` | `non_goal`

- 父组件 deferred **不**自动覆盖子文件


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

# Batch 99 — 最终审计（本目标轮次）

## 状态

**done**（eligible pure leaves 已迁完或逐项命名 deferral）

## theme-ui 域

layout / appearance / app-shell / sidebar / chat / overlays / activity / knowledge / skills / settings（含 achievements） / shared / file-preview

## 显式暂缓（逐项 unlock）

| 项 | 原因 / 解锁 |
|----|-------------|
| 审批 `*Approval*View`、`LoginDialogView`、设置内 Dialog 编辑器 | host `Dialog`/`Drawer`/`Button`（radix）未入 `@vetta/ui` |
| `SettingSection` / `SettingRow` 及整页设置 View | 设置 IA 原语未公开；View 绑 `SettingsAiAssist` / registry |
| `QueueCard` | jotai `messageQueueBySessionAtom`；需 model 拆分 |
| `ProjectsPanel` / `ProjectRow` / `SessionRow` / `DefaultSessionList` 等 | atoms + IPC + 虚拟列表数据树 |
| `InputBarView` / `MessageListView` / `DefaultChatView` | 多 host 组合壳；需继续切片 |
| `MessageCenter` / `SettingsMenu` 弹层容器 | Popover + 业务 model |
| `FilterSelectPopover` / `SidebarFilterSelect` | Popover + atom |
| `ChatPageView` / `RootLayoutView` / `DefaultSidebar` assembler | shell：组合 host Sidebar/ChatView/router/slots，非独立可主题叶子 |
| `BatchProjectFormFieldsView` 及 batch field 子树 | 业务 field 组合未拆纯 |
| flowing graph nodes/edges、settings 成就 3D 等 | 强业务/资产或非默认主题面；非本批 registry 默认叶子 |
| onboarding / pet / quickpanel / plugins | 产品线非目标 |

**已关闭（曾 residual 现已迁）**：skeptic 列表 1–2 全部、shiki `CodePreview`/`SyntaxHighlightedCode`、成就幕/标题/彩纸、AddProjectMenuItem、MultiplierTag、PreviewErrorBoundary 等。

## 证据

- `bun packages/theme-ui/scripts/verify-purity.mjs`
- `bun run check`
- `{SCRATCH}/eligible-inventory-residual.txt`（命名 deferral）
- 分批子 Agent `/gitcommit`（无 push）

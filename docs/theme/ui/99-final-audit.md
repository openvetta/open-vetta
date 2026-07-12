# Batch 99 — 最终审计（本目标轮次）

## 状态

**done**（eligible 已尽量迁完；阻塞项书面暂缓）

## theme-ui 域目录

| 域 | 代表组件 |
|----|----------|
| layout | AppFrame, ResizeHandle, SidebarDock… |
| appearance | ThemeSurface, frames |
| app / app-shell | AppBackground, PageHeader*, WindowControls* |
| sidebar | DefaultSidebar shell, Nav*, TopBar, empty/toolbar/settings leaves, ProjectsPanelSplitHandle… |
| chat | At/Slash, NewSession cards/carousel/background, capsules, SendButton, DrawerCard, TodoCard… |
| overlays | KnowledgeDrop, UpdateRestart |
| activity | ActivityPanelFrame |
| knowledge | KnowledgeFilesSkeleton |
| skills | SkillToggleSwitch |
| settings | SelectField/InputField/TextareaField/CheckboxField |
| shared | MacKeyboardPreview, CodeBlockCopyButtonView |

## 显式暂缓（unlock 条件）

| 区域 | 原因 / 解锁 |
|------|-------------|
| 审批 `*Approval*View`、Login、设置 Dialog | 依赖 host `Dialog`/`Drawer`/`Button`；需迁入 `@vetta/ui` 或等效原语 |
| `SettingSection`/`SettingRow` 设置页 | 设置 IA 原语未公开 |
| `QueueCard` | 直连 jotai queue atoms；需拆 model |
| `ProjectsPanel` / ProjectRow/SessionRow 树 | 业务 + 虚拟列表 + atoms |
| `InputBarView` / `MessageListView` 大块 | 多 host 组合；需继续切片 |
| `MessageCenter`/`SettingsMenu` 弹层 | Popover + 业务 model |
| `CodePreview` | 依赖 `shiki` peer；非主题优先；可后续迁 activity 并声明 peer |
| `ChatPageView` / `RootLayoutView` | 纯布局壳但组合 host Sidebar/ChatView/router；留 desktop shell |
| `BatchProjectFormFieldsView` | 组合仍含业务的 field 子组件 |
| onboarding / pet / quickpanel / plugins | 非目标 |

**已迁但 desktop 保留 adapter 的不算 residual pure**（如 `SlashPanelView` SkillInfo 适配）。

## 进程证据

- 每批 `bun run check`
- 子 Agent `/gitcommit` only
- `packages/theme-ui/scripts/verify-purity.mjs` 结构校验
- desktop `styles.css` `@source` theme-ui

## 验收定义

「全部 UI」= 设计文档下 **eligible props-driven 默认 view**；connected / model / host-primitive 阻塞不计入 theme-ui 强制范围。

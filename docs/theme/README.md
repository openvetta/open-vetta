# 主题与 UI 扩展架构设计

本文档记录 desktop-app 主题架构的设计方向。这里的“主题”不是简单切换颜色 token，而是逐步演进为应用级 UI 扩展系统：默认 UI 是内置主题，外部主题可以复用默认能力，也可以替换局部 UI、布局区域和装饰层。

## 当前基础

desktop-app 目前已有两类基础能力：

- 颜色 token 主题：`packages/desktop-app/src/renderer/shared/theme/` 通过 `TokenSet` 写入 CSS 变量。
- 插件 UI 机制：插件系统已经有远程 React 组件、slot host、ErrorBoundary、i18n boundary 等经验。

这两者还不足以支持“装饰型主题”。颜色 token 只能控制基础色彩；插件 slot 偏功能扩展，不适合直接接管应用结构。因此主题系统需要额外建立 UI contract、shared UI 和 region/slot/component override。

## 设计目标

主题系统需要支持：

- 图片、视频、DOM 动画、Canvas、Lottie 等装饰资源。
- 面板、聊天气泡、按钮、菜单、项目列表等组件的局部视觉替换。
- 侧边栏、聊天页、设置页等布局区域替换。
- 默认 UI 作为内置主题，与外部主题走同一套 contract。
- 主题复用默认功能，例如复用侧边栏的数据、导航、项目列表行为，只替换按钮、背景或行组件。
- 远程主题包提供 React UI 组件，但不能直接访问内部 store。

核心原则：

> 主题可以替换 UI 实现，但不能接管应用数据层和业务逻辑。

## 分层模型

目标架构分为三层。

```txt
App Data Center
  Jotai atoms、router、window.vetta IPC、业务 hooks、权限、持久化

UI Abstract Layer
  model hooks、view model、actions、region/slot/component 类型契约

UI Implementation Layer
  默认 UI、shared UI、装饰组件、远程主题组件
```

### 数据层

数据层由应用维护。主题不应直接访问：

- 内部 Jotai atom
- `window.vetta.*`
- router 原始细节
- domain 内部 hook
- 文件系统、网络、权限等底层能力

主题应该通过稳定 runtime contract 使用数据和动作。

### UI 抽象层

UI 抽象层负责把内部数据整理成适合 UI 渲染的 model。

侧边栏试点已经采用这种模式：

```txt
components/sidebar/useSidebarModel.ts
components/sidebar/projects/panel/useProjectsPanelModel.ts
components/sidebar/settings-menu/useSettingsMenuModel.ts
```

这些 hook 对外提供：

- UI 需要的数据。
- 经过封装的 actions。
- 当前激活态、展开态、运行态。
- 可传给默认 UI 或未来主题 UI 的稳定 props。

model hook 不应该返回内部 store 本身，也不应该要求 UI 层知道业务存储结构。

### UI 实现层

UI 实现层只负责渲染和组合。默认主题也是 UI 实现层。

侧边栏试点目录：

```txt
packages/desktop-app/src/renderer/domains/project/components/sidebar/
  Sidebar.tsx
  DefaultSidebar.tsx
  SidebarPanel.tsx
  SidebarTopBar.tsx
  SidebarNavigation.tsx
  SidebarNavItemButton.tsx
  SidebarProjectsSection.tsx
  SidebarBottomBar.tsx
  types.ts
  useSidebarModel.ts

  add-project/
  filters/
  projects/
  settings-menu/
  update/
```

拆分原则是按 UI 区域和可组合部件拆，而不是按业务流程堆在单文件里。

## 侧边栏试点结论

侧边栏是主题架构的第一个落地点。它验证了以下模式：

```tsx
export function Sidebar(props: SidebarProps): JSX.Element {
  const model = useSidebarModel(props);
  return <DefaultSidebar model={model} onOpenSession={props.onOpenSession} />;
}
```

后续可以演进为：

```tsx
export function Sidebar(props: SidebarProps): JSX.Element {
  const model = useSidebarModel(props);
  const SidebarRenderer = resolveRegion("sidebar", DefaultSidebar);
  return <SidebarRenderer model={model} onOpenSession={props.onOpenSession} />;
}
```

这样默认 UI 和远程主题 UI 都消费同一个 `SidebarModel`。

### 当前侧边栏分区

```txt
SidebarPanel
  侧边栏面板外壳、resize、未来图片边框装饰入口

SidebarTopBar
  顶部品牌区、更新按钮、Claw 状态、折叠按钮

SidebarNavigation
  页面导航区、选中指示器、导航按钮

SidebarProjectsSection
  项目过滤、新建项目、项目列表区域

SidebarBottomBar
  设置菜单、消息中心入口
```

### 当前子域拆分

```txt
add-project/
  useAddProjectMenuModel
  AddProjectMenu
  AddProjectMenuTrigger
  AddProjectMenuPopover
  AddProjectMenuItem

filters/
  SidebarFilterSelect
  FilterSelectPopover

update/
  useSidebarUpdateButtonModel
  SidebarUpdateButton
  SidebarUpdateIcon

projects/
  ProjectGroup
  ProjectRow
  SessionRow
  ProjectSessions
  SessionStatusIcon
  InlineSessionRenameInput

projects/panel/
  useProjectsPanelModel
  ProjectsPanel
  ProjectGroupsSection
  DefaultConversationSection
  DefaultSessionList
  DefaultSessionRow
  ProjectsPanelMenus

settings-menu/
  useSettingsMenuModel
  SettingsMenu
  SettingsMenuTrigger
  SettingsMenuPopover
  SettingsMenuThemeSection
  SettingsMenuQuotaSection
  SettingsMenuAccountSection
  SettingsMenuDownloadsItem
```

这个结构的目标不是“文件更多”，而是让主题和默认 UI 能在不同粒度复用：

- 完整复用 `DefaultSidebar`。
- 替换 `SidebarPanel` 做图片边框。
- 替换 `SidebarNavItemButton` 做导航按钮。
- 替换 `ProjectRow` / `SessionRow` 做项目列表风格。
- 复用 `useProjectsPanelModel` 自己实现项目区。

## 装饰组件

项目已有装饰型组件：

```txt
packages/desktop-app/src/renderer/shared/components/CornerImageFrame.tsx
```

当前 `SidebarPanel` 已使用 `CornerImageFrame` 作为面板外壳。默认不传 `imageUrl` 和 `decoration`，所以视觉不变；未来主题可以在这个层级提供角图、边框图或装饰资源。

后续可以继续在这些层级接入装饰：

- `SidebarPanel`
- `ProjectRow`
- `SessionRow`
- `SettingsMenuPopover`
- `FilterSelectPopover`
- `MessageBubble`
- `ChatPanel`

注意：装饰组件只负责视觉层，不应该直接执行导航、删除、登录、IPC 等动作。

## Token、Slot、Region、Component

主题能力应拆成四类。

### Token

现有 `shared/theme/tokens.ts` 适合继续承载：

- color
- typography
- radius
- shadow
- cursor
- 基础 motion 参数

Token 适合稳定值，不适合表达 DOM 动画、视频背景、远程组件。

### Slot

Slot 是组件内部的装饰扩展点，例如：

- `sidebar.panel.background`
- `sidebar.panel.frame`
- `projectRow.before`
- `projectRow.after`
- `messageBubble.overlay`
- `settingsMenu.frame`

Slot 适合做装饰层，但不应替换业务交互。

### Region

Region 是页面和布局级替换点，例如：

- `shell`
- `sidebar`
- `chatPage`
- `settingsPage`
- `composer`

侧边栏后续应作为第一个 region：

```ts
regions: {
  sidebar: CustomSidebar,
}
```

### Component Override

Component override 用于替换更小的 UI 构件，例如：

- `SidebarNavItemButton`
- `ProjectRow`
- `SessionRow`
- `AddProjectMenuTrigger`
- `SettingsMenuTrigger`

这类替换应基于稳定 props，而不是让主题 import 内部 atom。

## Shared UI Center

后续应形成一个给默认主题和外部主题共同使用的 shared UI center。

在当前项目里，第一阶段可以先从 `components/sidebar/` 内部沉淀，不急着抽成公共包。等 API 稳定后，再考虑导出为主题 SDK：

```txt
@app/theme-sdk
  useSidebarModel
  useProjectsPanelModel
  SidebarPanel
  SidebarNavigation
  ProjectRow
  SessionRow
  CornerImageFrame
```

复用层级建议：

```txt
完全复用:
  <DefaultSidebar model={model} />

替换局部 UI:
  <DefaultSidebar components={{ ProjectRow: CustomProjectRow }} />

复用 model，自写 UI:
  const model = useSidebarModel(props)

高级自定义:
  通过受控 runtime data/actions 获取更多能力
```

## 远程主题包

远程主题包可以复用现有插件系统中 Module Federation 方向的经验，但必须比普通插件更收敛。

主题包应依赖公开 SDK：

```ts
import { useSidebarModel, ProjectRow, CornerImageFrame } from "@app/theme-sdk";
```

不应依赖：

```ts
import { activeSessionAtom } from "@shared/store/atoms";
import { useProjects } from "@domains/project/hooks/useProjects";
```

远程主题加载需要：

- React / ReactDOM 单例共享。
- SDK 版本兼容声明。
- 每个远程 region/component 使用 ErrorBoundary。
- 加载失败时回退默认 UI。
- 主题权限声明，例如网络、存储、外部资源。
- i18n 资源边界，不能硬编码用户可见文案。

## 代码组织准则

### 按 UI 结构拆分

复杂 UI 先拆区域，再拆部件：

```txt
FeatureRoot
  FeaturePanel
  FeatureHeader
  FeatureNavigation
  FeatureContent
  FeatureFooter
```

不要把数据加载、状态处理、列表渲染、菜单弹层、按钮样式全部写在一个组件里。

### Model hook 承载行为

行为集中在 `useXxxModel`：

- 路由跳转
- IPC 调用
- Jotai atom 读写
- 删除/清理/导入/登录等动作
- view model 组装

UI 组件只通过 props 使用 model。

### 组件只做一件事

例如侧边栏中：

- `ProjectRow` 只渲染项目行。
- `SessionRow` 只渲染会话行。
- `SettingsMenuTrigger` 只渲染触发器。
- `SettingsMenuQuotaSection` 只渲染额度状态。
- `ProjectsPanelMenus` 只承载右键菜单 host。

### 不保留无意义兼容壳

如果旧文件只剩：

```ts
export { X } from "./new-path/X";
```

应直接修改引用位置，然后删除旧文件。除非该路径是公共 API 或外部包依赖入口。

### i18n 要随拆分推进

新增或迁移后的用户可见文案必须进入 i18n。不要在新组件中复制旧硬编码中文。

允许不抽：

- 注释
- 日志
- 协议串
- 发给 LLM 的提示

## 后续实施路线

推荐顺序：

1. 稳定侧边栏 contract。
2. 给 `DefaultSidebar` 增加可选 `components` / `slots` 参数。
3. 从 `SidebarPanel` 开始接入装饰主题资源。
4. 将 `ProjectRow`、`SessionRow` 做成可 override 组件。
5. 梳理聊天页，按同样方式拆 `ChatPage`、`MessageList`、`MessageBubble`、`InputBar`。
6. 定义主题包 manifest 和 runtime loader。
7. 复用插件远程组件加载机制接入远程主题。

## 关键边界

- 主题不能直接访问内部 store。
- 主题不能直接调用 `window.vetta.*`。
- 主题不能复制删除、清理、登录、导入等业务逻辑。
- 主题组件必须通过 model actions 执行动作。
- 默认 UI 和远程 UI 应消费同一套 contract。
- 装饰资源不能破坏布局、可访问性和交互语义。
- 主题系统不能绕过 desktop-app 的 i18n、DESIGN.md 和检查命令要求。

## 核心结论

当前方向不是把 theme JSON 做大，而是把应用 UI 拆成可组合的默认实现和稳定的 UI contract。

侧边栏试点说明这个方向可行：

- 数据和行为进入 model hook。
- 默认 UI 按区域拆分。
- 装饰外壳预留在 panel 层。
- 子组件可逐步变成 shared UI。
- 未来远程主题只需要替换 region、slot 或 component，而不是复制整套业务逻辑。

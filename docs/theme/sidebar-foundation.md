# 侧边栏主题化基座

侧边栏是当前主题系统的第一个落地点。它既是默认 UI，也是未来主题复用和替换的 shared UI。

## 当前目录

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
  message-center/
  projects/
  settings-menu/
  update/
```

## 默认组合

当前入口仍然很薄：

```tsx
export function Sidebar(props: SidebarProps): JSX.Element {
  const model = useSidebarModel(props);
  return (
    <DefaultSidebar
      classNames={props.classNames}
      model={model}
      onOpenSession={props.onOpenSession}
    />
  );
}
```

这个结构保证：

- 数据和行为在 `useSidebarModel`。
- 默认 UI 在 `DefaultSidebar` 和子组件。
- 主题可以复用默认 UI，也可以未来替换 `DefaultSidebar`。

## Surface Slot

当前已定义的侧边栏 surface slot：

```ts
type ThemeSurfaceSlot =
  | "sidebar.panel"
  | "sidebar.topBar"
  | "sidebar.navigation"
  | "sidebar.projects"
  | "sidebar.bottomBar"
  | "sidebar.settingsMenu"
  | "sidebar.messageCenter";
```

已接入默认侧边栏结构的 slot：

- `sidebar.panel`
- `sidebar.topBar`
- `sidebar.navigation`
- `sidebar.projects`
- `sidebar.bottomBar`

`sidebar.settingsMenu` 和 `sidebar.messageCenter` 已预留，适合后续给弹层接入 frame、背景或外壳装饰。

## ThemeSurface

实现位置：

```txt
packages/desktop-app/src/renderer/shared/theme/appearance/ThemeSurface.tsx
```

职责：

- 根据 `slot` 读取当前 appearance 配置。
- 没有配置时渲染普通 `div`。
- 配置 `corner-image` 时使用 `CornerImageFrame`。
- 给 DOM 保留 `data-theme-surface`，便于调试和后续装饰引擎挂载。

低定制主题只需要配置 surface，不需要写组件。

## CornerImageFrame

实现位置：

```txt
packages/desktop-app/src/renderer/shared/components/CornerImageFrame.tsx
```

当前已支持：

- `className`
- `contentClassName`
- `decoration`
- `imageUrl`
- 普通 `div` props 透传

它不应该绑定侧边栏业务，只是通用装饰容器。

## SidebarClassNames

为了让默认侧边栏组件可以被主题复用，`SidebarProps` 已支持 `classNames`：

```ts
export interface SidebarClassNames {
  bottomBar?: string;
  bottomBarSettings?: string;
  navigation?: string;
  navIndicator?: string;
  navItem?: string;
  navItemBadge?: string;
  navItemIcon?: string;
  navItemLabel?: string;
  panel?: string;
  panelContent?: string;
  projects?: string;
  projectsList?: string;
  projectsToolbar?: string;
  topBar?: string;
  topBarActions?: string;
  topBarBrand?: string;
  topBarClawButton?: string;
  topBarCollapseButton?: string;
}
```

使用示例：

```tsx
<Sidebar
  onOpenSession={openSession}
  classNames={{
    panel: "border-primary/40",
    projectsToolbar: "px-3",
    navItem: "rounded-lg"
  }}
/>
```

`classNames` 是低成本复用默认组件的能力。它不能替代组件 override，但能覆盖大量“不想重写组件，只想调整局部样式”的主题需求。

## 组件分区

当前默认侧边栏分为：

```txt
SidebarPanel
  外壳、resize、sidebar.panel surface

SidebarTopBar
  品牌区、更新按钮、Claw 状态、折叠按钮

SidebarNavigation
  导航区、选中指示器、导航按钮

SidebarProjectsSection
  过滤器、新建项目、项目列表容器

SidebarBottomBar
  设置菜单、消息中心入口
```

子目录职责：

```txt
add-project/
  新建项目菜单

filters/
  侧边栏过滤器

message-center/
  消息中心触发器、弹层、tab、列表

projects/
  项目组、项目行、会话行

projects/panel/
  项目面板 model、默认会话、右键菜单

settings-menu/
  设置菜单触发器、弹层、主题、额度、账号、下载入口

update/
  侧边栏更新按钮
```

## 设计约定

新增侧边栏通用组件时：

- 简单组件提供 `className`。
- 复合组件提供 `classNames`。
- 需要被主题装饰的区域用 `ThemeSurface`。
- 行为放进 model hook。
- UI 组件只通过 props 使用数据和 actions。
- 用户可见文案必须走 i18n。
- 不保留无意义 re-export 兼容壳。

## 当前限制

当前基座还没有：

- 从配置文件加载 appearance。
- 从远程主题包加载组件。
- component override registry。
- 对项目行、会话行、消息气泡等细粒度组件的统一 override contract。

这些能力应在当前 slot 和 classNames 基础上继续演进。

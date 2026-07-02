# 主题示例

当前有一个本地侧边栏 demo 主题文件：

```txt
packages/desktop-app/src/renderer/shared/theme/dev-themes/sidebarDemoThemes.tsx
```

它提供三个 ThemeModule，用于验证三档主题能力。

## 只测试装饰

入口当前默认使用这个示例：

```ts
import { sidebarAppearanceDemoTheme } from "./shared/theme/dev-themes/sidebarDemoThemes";

const activeThemeModule = sidebarAppearanceDemoTheme;
```

效果：

- 默认侧边栏结构不变。
- `sidebar.panel` 使用图片边框。
- 验证 `appearance.surfaces` 和 `ThemeSurface` 是否正常。

## 测试局部组件覆盖

把 `packages/desktop-app/src/renderer/main.tsx` 改为：

```ts
import { sidebarComponentDemoTheme } from "./shared/theme/dev-themes/sidebarDemoThemes";

const activeThemeModule = sidebarComponentDemoTheme;
```

效果：

- 默认侧边栏布局仍然复用。
- 导航项按钮由 `components["sidebar.navItem"]` 覆盖。
- 设置菜单触发按钮由 `components["sidebar.settingsTrigger"]` 覆盖。
- `sidebar.panel` 图片边框仍然生效。

这个示例验证“不重写整个侧边栏，只换某个组件”的路径。

## 测试完整侧边栏接管

把 `packages/desktop-app/src/renderer/main.tsx` 改为：

```ts
import { sidebarRegionDemoTheme } from "./shared/theme/dev-themes/sidebarDemoThemes";

const activeThemeModule = sidebarRegionDemoTheme;
```

效果：

- `regions.sidebar` 接管完整侧边栏。
- 主题新增了一个额外的图标区域。
- 项目列表、导航、底部设置和消息中心仍复用默认组件。
- 导航区域被移动到项目区域下方，验证布局可以由主题重新组合。
- `sidebar.panel` 图片边框仍然生效。

这个示例验证“主题写完整侧边栏，但仍能复用默认组件和 model/actions”的路径。

## 依赖边界

本地 demo 主题目前仍位于 desktop-app 内部，因此可以临时复用桌面端公开 UI 出口。

面向未来远程主题时，依赖应逐步调整为：

- 主题协议、registry、model hook：从 `@vetta/theme-sdk` 导入。
- 装饰组件：从 `@vetta/theme-ui` 导入。
- 官方默认 view：从后续独立的官方 UI 包导入。

远程主题不应 import `@shared/*`、`@domains/*` 或 desktop-app 内部 hook。需要数据时调用 SDK facade hook；需要复用 UI 时，把 hook 返回的 model 作为 props 传给官方 view。

## 当前约束

- demo 主题是开发期示例，还不是设置页可选择主题。
- 切换示例需要临时修改 `activeThemeModule`。
- 远程主题包加载、版本校验和 ErrorBoundary 还未接入。
- 新增可见文案时仍必须走 i18n；示例里避免添加新的文字内容。

# 主题组件设计要求

主题组件分两类：

- Public primitive：应用提供给主题复用的默认组件。
- Override component：主题提供给 registry 的替换组件。

两者必须使用同一份稳定 props contract。默认组件不是内部实现细节，一旦进入 SDK，就需要按公开 API 管理。

## 组件开放标准

一个组件进入 Theme SDK 前，需要满足这些条件：

- 行为边界清楚：组件只负责渲染和局部交互，不直接拥有跨领域业务流程。
- props 稳定：主题能通过 props 获取渲染所需数据和动作。
- 不依赖内部 store：不能要求主题 import Jotai atom、router、IPC 或 domain 私有 hook。
- 样式可组合：支持 `className`，复合组件支持 `classNames`。
- ref 可透传：需要作为 trigger、button、row、focus target 的组件必须 `forwardRef`。
- 文案可控：用户可见文案必须走 i18n，不能在主题组件中硬编码中文。
- 装饰分层清楚：需要主题装饰的区域必须提供 root / decoration / content 三层。
- 默认行为可回退：主题未提供 override 时，默认组件行为不变。

不适合立即开放的组件：

- props 依赖大量内部临时状态。
- 组件内部直接调用 IPC 或 router。
- 组件承担多个不相关职责。
- 组件的 DOM 结构仍频繁变化，无法承诺兼容。

## Props Contract

主题组件 props 应该表达 UI contract，而不是内部实现细节。

推荐：

```ts
export interface SidebarNavItemButtonProps
  extends Omit<ComponentPropsWithoutRef<"button">, "children"> {
  item: SidebarNavItem;
  classNames?: {
    badge?: string;
    icon?: string;
    label?: string;
  };
}
```

要求：

- 继承合适的 DOM props，保留 `onClick`、`disabled`、`title`、aria 等能力。
- 不暴露 `setState`、atom setter、router navigate 等内部对象。
- action 用语义函数表达，例如 `onOpenSession`、`onItemClick`。
- 数据对象用 view model 类型表达，例如 `SidebarNavItem`、`SettingsMenuModel`。
- 回调返回值要明确；异步 action 使用 `Promise<void>`。
- 可选 props 必须有清晰默认行为。

避免：

```ts
interface BadProps {
  atom: PrimitiveAtom<State>;
  navigate: NavigateFn;
  ipc: typeof window.vetta;
  rawProject: InternalProjectRecord;
}
```

## Region Props

Region 是完整区域接管点。它的 props 应该提供组合所需的 model、actions 和 classNames。

当前侧边栏：

```ts
export interface SidebarRegionProps {
  classNames?: SidebarClassNames;
  model: SidebarModel;
  onOpenSession: SidebarProps["onOpenSession"];
}
```

Region 组件可以：

- 自由新增主题自己的 UI。
- 重排默认组件。
- 复用 Theme SDK 中的 public primitives。
- 使用 `ThemeSurface` 接入装饰层。

Region 组件不应该：

- 重新实现业务数据加载。
- 直接访问内部 store、IPC、router。
- 复制默认组件中的业务流程。

## Override Component

Override component 用于替换默认 UI 中的局部组件。

当前已接入：

```ts
components: {
  "sidebar.navItem"?: typeof SidebarNavItemButton;
  "sidebar.settingsTrigger"?: typeof SettingsMenuTrigger;
}
```

设计要求：

- props 必须与 fallback 组件兼容。
- 需要 trigger 行为时必须转发 ref 和透传 props。
- 不要吞掉默认组件传入的 `onClick`、`aria-*`、`data-*`。
- 不要假设父组件 DOM 结构，除非 contract 明确说明。
- 不要引入会改变列表测量的不可控布局副作用。

示例：

```tsx
const CustomNavItem = forwardRef<HTMLButtonElement, SidebarNavItemButtonProps>(
  function CustomNavItem({ className, ...props }, ref) {
    return (
      <SidebarNavItemButton
        ref={ref}
        className={cn("rounded-lg border border-border/50", className)}
        {...props}
      />
    );
  },
);
```

## Class API

`className` / `classNames` 是默认组件复用的最低成本扩展点。

规则：

- 简单组件使用 `className`。
- 复合组件使用 `classNames` 标记内部稳定区域。
- `classNames` key 需要语义化，例如 `icon`、`label`、`toolbar`、`list`。
- 不为临时 DOM 细节开放 class key。
- class 应该合并到合适层级，不能破坏布局基础约束。

class API 适合：

- 调整间距。
- 调整边框、圆角、背景透明度。
- 调整图标和文本局部样式。

class API 不适合：

- 改变组件行为。
- 插入新 DOM。
- 重排区域。
- 替换复杂交互。

这些场景应该使用 component override 或 region override。

## 装饰分层

可主题化组件需要遵守三层结构：

```txt
root
  decoration: ThemeSurface
  content
```

要求：

- root 承载尺寸、定位、圆角、基础背景、基础边框。
- decoration 默认 `absolute inset-0 z-0 pointer-events-none overflow-visible`。
- content 默认 `relative z-10`，背景透明，只负责真实 UI、布局和必要裁剪。
- content 不要设置不透明背景，否则会遮挡 decoration。
- 图片边框和外扩装饰不应参与布局。

## SDK 边界

Theme SDK 是主题唯一应依赖的应用侧 API。

可以导出：

- public primitives。
- public model hooks。
- public props/types。
- `ThemeSurface`。
- 通用装饰组件。
- 通用工具函数，例如 `cn`。

暂时不导出：

- Jotai atom。
- router 实例。
- `window.vetta.*`。
- domain 私有 hook。
- 仍在重构中的内部组件。

SDK 导出组件时，要同步导出 props 类型。主题作者不应该通过 `ComponentProps<typeof X>` 猜 props。

## 命名约定

Region id：

```txt
sidebar
chatPage
settingsPage
```

Component id：

```txt
sidebar.navItem
sidebar.settingsTrigger
sidebar.projectRow
sidebar.sessionRow
chat.messageBubble
chat.inputAction
```

Surface slot：

```txt
sidebar.panel
sidebar.projects
chat.messageList
chat.inputBar
```

命名原则：

- region 使用大区域名。
- component 使用领域 + 组件语义。
- surface 使用领域 + 可装饰区域。
- 不把实现细节写进 id，例如 `leftButtonV2`。

## 验收清单

开放一个新主题组件前，至少确认：

- 默认 UI 在未配置主题时行为不变。
- override 组件可以只替换该组件，不需要重写父级。
- 完整 region 可以复用该组件。
- props 不暴露内部 store、IPC、router。
- ref 和 DOM props 透传正确。
- `className` / `classNames` 生效。
- 用户可见文案走 i18n。
- `bun run check` 通过。
- desktop-app 修改后 `bunx tsc --noEmit` 通过。

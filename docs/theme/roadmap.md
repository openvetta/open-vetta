# 主题系统实施路线

主题系统需要按低风险路径推进。先让默认 UI 可复用，再接入配置化装饰，最后再做远程组件替换。

## 阶段 1：默认 UI 可复用

状态：进行中，侧边栏已完成第一轮。

目标：

- 默认 UI 拆成稳定区域。
- 行为进入 model hook。
- 组件支持 `className` / `classNames`。
- 关键区域接入 `ThemeSurface`。
- 默认视觉保持不变。

已落地点：

- `Sidebar`
- `DefaultSidebar`
- `SidebarPanel`
- `SidebarTopBar`
- `SidebarNavigation`
- `SidebarProjectsSection`
- `SidebarBottomBar`
- `settings-menu`
- `message-center`

下一步可继续细化：

- `ProjectRow`
- `SessionRow`
- `AddProjectMenuTrigger`
- `SettingsMenuPopover`
- `MessageCenterDialog`

## 阶段 2：本地 appearance 配置

目标：

- 定义本地 `ThemeAppearance` 注册入口。
- 支持开发期注入 surface 配置。
- 支持 `corner-image` frame 的真实素材验证。
- 支持按主题 ID 选择 appearance。

建议先做静态配置：

```txt
packages/desktop-app/src/renderer/shared/theme/appearance/themes/
  default.ts
  demo-corner-frame.ts
```

然后让 `ThemeAppearanceProvider` 根据当前主题或调试开关选择 appearance。

暂时不做：

- 远程加载。
- manifest 校验。
- 权限系统。

## 阶段 3：更多装饰 frame

当前只支持：

```ts
{ kind: "corner-image" }
```

后续可以增加：

```ts
{ kind: "background-image" }
{ kind: "video-background" }
{ kind: "dom-effect" }
```

注意边界：

- frame 只负责视觉。
- 不执行业务动作。
- 不能破坏布局和可访问性。
- 不能吞掉交互事件。

## 阶段 4：Component Override Registry

目标：

- 默认组件通过 registry 解析可替换实现。
- 主题可以只替换一个组件。
- 未配置或加载失败时回退默认组件。

示意：

```tsx
const NavItemButton = resolveThemeComponent(
  "sidebar.navItemButton",
  SidebarNavItemButton,
);
```

第一批适合开放的组件：

- `SidebarNavItemButton`
- `ProjectRow`
- `SessionRow`
- `SettingsMenuTrigger`
- `MessageCenterTrigger`

不要一开始开放所有组件。先开放 props 稳定、行为边界清楚的组件。

## 阶段 5：Region Override

目标：

- 支持替换完整区域。
- 主题可以替换 `DefaultSidebar`，但继续复用 `SidebarModel`。

示意：

```tsx
const SidebarRenderer = resolveThemeRegion("sidebar", DefaultSidebar);
return <SidebarRenderer model={model} onOpenSession={props.onOpenSession} />;
```

第一批 region：

- `sidebar`
- `chatPage`
- `settingsPage`

## 阶段 6：远程主题包

远程主题包应在本地 API 稳定后再接入。

主题包需要 manifest：

```ts
interface ThemePackageManifest {
  id: string;
  name: string;
  version: string;
  sdkVersion: string;
  appearance?: string;
  components?: Record<string, string>;
  regions?: Record<string, string>;
}
```

运行时要求：

- React 单例共享。
- SDK 版本检查。
- ErrorBoundary。
- 加载失败回退默认 UI。
- i18n 资源边界。
- 权限声明。

## 阶段 7：聊天页主题化

侧边栏稳定后，再把同样模式应用到聊天页。

建议拆分：

```txt
ChatPage
  ChatLayout
  MessageList
  MessageBubble
  ToolCallBlock
  InputBar
  ComposerActions
```

优先 surface：

- `chat.page`
- `chat.messageList`
- `chat.messageBubble`
- `chat.inputBar`

优先 override：

- `MessageBubble`
- `ToolCallBlock`
- `InputBarButton`

## 验收标准

每一阶段都要满足：

- 默认 UI 行为不变。
- `bun run check` 通过。
- desktop-app 修改后 `bunx tsc --noEmit` 通过。
- 新增用户可见文案走 i18n。
- 不让主题直接访问内部 store / IPC。
- 加载失败能回退默认 UI。

## 当前优先级

近期建议顺序：

1. 给 appearance 增加本地静态配置入口。
2. 用一个 demo 主题验证 `sidebar.panel` 或 `sidebar.projects` 的 `corner-image`。
3. 把 `settingsMenu`、`messageCenter` 弹层接入 `ThemeSurface`。
4. 给 `ProjectRow`、`SessionRow` 补齐 `className` / `classNames`。
5. 再设计 component override registry。

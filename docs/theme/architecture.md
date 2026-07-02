# 主题架构设计

## 目标

主题系统需要支持两类需求。

低定制主题：

- 只替换某个面板的图片边框。
- 只给某个区域加背景、纹理、装饰层。
- 不需要编写 React 组件。

高定制主题：

- 替换侧边栏、聊天页、设置页等区域。
- 替换按钮、列表项、消息气泡等组件。
- 提供自定义 React UI、DOM 动画、Canvas、视频背景等能力。
- 在完整 region 中新增主题自己的组件，同时复用应用公开的默认组件。

这两类需求不应混在同一个 API 中。低定制走配置，高定制走组件替换。

实际落地时分三档能力：

```txt
Appearance config
  不写组件，只配置 surface 装饰。

Component override
  不重写父级，只替换默认 UI 中的某个局部组件。

Region override
  接管完整区域，自由新增组件、重排布局，并复用 Theme SDK。
```

## 三层模型

```txt
App Data Center
  Jotai atoms、router、window.vetta IPC、业务 hooks、权限、持久化

UI Abstract Layer
  model hooks、view model、actions、region/slot/component contract

UI Implementation Layer
  默认 UI、shared UI、装饰组件、远程主题组件
```

### 数据层

数据层由应用维护。主题不应直接访问：

- 内部 Jotai atom。
- `window.vetta.*`。
- router 原始细节。
- domain 内部 hook。
- 文件系统、网络、权限等底层能力。

主题应该通过稳定 model 和 actions 使用数据。

### UI 抽象层

UI 抽象层负责把内部状态整理成适合渲染的 model。

当前侧边栏已有这些 model hook：

```txt
packages/desktop-app/src/renderer/domains/project/components/sidebar/useSidebarModel.ts
packages/desktop-app/src/renderer/domains/project/components/sidebar/projects/panel/useProjectsPanelModel.ts
packages/desktop-app/src/renderer/domains/project/components/sidebar/settings-menu/useSettingsMenuModel.ts
packages/desktop-app/src/renderer/domains/project/components/sidebar/message-center/useMessageCenterModel.ts
```

model hook 对外提供：

- UI 需要的数据。
- 封装后的 actions。
- 激活态、展开态、运行态。
- 可传给默认 UI 或主题 UI 的稳定 props。

model hook 不应提供 UI-only 信息。语义文案、aria/title、业务状态和动作属于 model；图标、图片、CSS class、动画和装饰素材属于 UI 实现层。

### UI 实现层

UI 实现层只负责渲染和组合。默认主题也是 UI 实现层。

侧边栏默认 UI 当前位于：

```txt
packages/desktop-app/src/renderer/domains/project/components/sidebar/
```

拆分原则是按 UI 区域和可组合部件拆，而不是按业务流程堆在单文件里。

## 核心概念

### Token

现有 `shared/theme/tokens.ts` 继续承载颜色、字体、圆角、阴影等稳定值。

Token 适合基础视觉，不适合表达图片边框、视频背景、DOM 动画或远程组件。

### Surface

Surface 是低定制主题的基础能力。它表示“某个 UI 区域可以被装饰”。

当前实现：

```txt
packages/theme-ui/src/appearance/ThemeSurface.tsx
```

示意：

```tsx
<div className="relative" data-theme-surface-root="sidebar.projects">
  <ThemeSurface slot="sidebar.projects" />
  <div className="relative z-10 overflow-hidden">
    <SidebarProjectsSection />
  </div>
</div>
```

主题可以给这个 slot 配置 frame：

```ts
{
  surfaces: {
    "sidebar.projects": {
      frame: {
        kind: "corner-image",
        imageUrl: "theme-assets/projects-frame.png",
        decoration: {
          backgroundSize: "...",
          cornerWidth: "...",
          cornerHeight: "...",
          corners: []
        }
      }
    }
  }
}
```

如果没有配置，`ThemeSurface` 只渲染空的装饰层，默认视觉不变。

`ThemeSurface` 不负责业务内容布局，也不包裹 children。可主题化组件必须自己提供 root / decoration / content 三层：

```txt
Root layer
  尺寸、定位、圆角、基础背景、基础边框

Decoration layer
  ThemeSurface，默认 absolute inset-0 z-0 pointer-events-none

Content layer
  真实 UI，默认 relative z-10，透明背景，只负责布局和必要的 overflow 裁剪
```

背景和边框不能随意放到 content layer。content layer 的背景会遮挡 decoration layer，导致图片边框、纹理或背景特效不可见。

装饰层默认不遮挡内容。如主题需要 overlay 类效果，必须显式声明更高层级，并确认不会影响交互。

### Region

Region 是页面或大布局级替换点，例如：

- `app.pageHeader`
- `sidebar`
- `chatPage`
- `settingsPage`
- `composer`

Region 替换适合高定制主题。它应消费应用提供的 model，而不是自己访问内部 store。

当前已落地的 region：

```ts
regions: {
  "app.pageHeader"?: ComponentType<PageHeaderRegionProps>
  sidebar?: ComponentType<SidebarRegionProps>
}
```

`regions["app.pageHeader"]` 是页面头部入口。主题可以替换标题栏区域，但继续使用应用提供的路由标题、侧边栏触发动作和窗口控制边界。

`regions.sidebar` 是完整侧边栏入口。主题提供它时，应用直接渲染主题侧边栏；主题可以在里面自由添加新组件、重排布局，也可以复用默认 `SidebarPanel`、`SidebarNavigation`、`ProjectsPanel`、`SettingsMenu`、`MessageCenter` 等公开组件。

Region 替换不是唯一方式。主题如果只是替换一个按钮，不应该被迫重写整个侧边栏。

Region props 应该只包含稳定 model、公开 actions 和必要样式扩展，不暴露内部 store、router 或 IPC。Region 负责组合，不负责重新实现数据层。

### Component Override

Component override 用于替换更小的 UI 构件，例如：

- `SidebarNavItemButton`
- `ProjectRow`
- `SessionRow`
- `SettingsMenuTrigger`
- `MessageBubble`

这类替换必须基于稳定 props。

当前已落地的 component override：

```ts
components: {
  "app.pageHeaderSidebarTrigger"?: typeof PageHeaderSidebarTrigger
  "app.pageHeaderTitle"?: typeof PageHeaderTitle
  "app.pageHeaderWindowActions"?: typeof PageHeaderWindowActions
  "app.windowControls"?: typeof WindowControls
  "app.windowControlButton"?: typeof WindowControlButton
  "sidebar.navItem"?: typeof SidebarNavItemButton
  "sidebar.settingsTrigger"?: typeof SettingsMenuTrigger
}
```

默认 UI 在渲染这些组件时先查询 registry；未配置时回退默认组件。

Component override 的 props 必须与默认 fallback 组件兼容。需要作为 trigger 或 focus target 的组件必须转发 ref，并透传 DOM props，避免破坏 Popover、Tooltip、虚拟列表测量或键盘交互。

### Theme Module

ThemeModule 是 UI 主题的注册单元：

```ts
interface ThemeModule {
  meta: {
    id: string;
    name: string;
    version: string;
    sdkVersion: string;
  };
  appearance?: ThemeAppearance;
  regions?: ThemeRegionRegistry;
  components?: ThemeComponentRegistry;
}
```

`ThemeRegionRegistry` 和 `ThemeComponentRegistry` 是显式 key map，不是任意 `string` map。新增 region/component 时必须先把 id 和组件类型登记到 registry，否则主题包里拼错 key 或传错组件 props 时，TypeScript 无法提前发现。

渲染优先级：

```txt
Region override > Component override > Appearance config > Default UI
```

三者可以组合。自定义 region 可以继续使用 `ThemeSurface`；默认 region 可以继续读取 component override；component override 内部也可以读取 appearance。

### Class API

很多主题不需要替换组件，只需要调整默认组件的局部样式。因此默认 UI 组件需要支持：

- `className`：组件外层样式。
- `classNames`：复合组件内部区域样式。

这不是最终主题系统的全部能力，但它是默认组件可复用的基础。

class API 只适合局部视觉调整。插入新 DOM、改变布局顺序、替换复杂交互时，应使用 component override 或 region override。

### Theme SDK

Theme SDK 是主题和应用之间的唯一公开契约。

当前包：

```txt
packages/theme-sdk/
```

SDK 可以导出：

- `ThemeModule`、`ThemeMeta`、registry 类型。
- `ThemeProvider`、`useThemeRegion`、`useThemeComponent`。
- `ThemeAppearance`、surface/frame 配置协议。
- public model hook 的 facade 类型和 host bridge。
- region/component props contract。

SDK 不应导出：

- 默认 UI 组件。
- 具体主题组件。
- 视觉组件库。
- Jotai atom。
- router 实例。
- `window.vetta.*`。
- domain 私有 hook。
- 尚未稳定的内部组件。

UI 组件应进入独立 UI 包或主题包，而不是进入 SDK。当前公共 UI building blocks 位于：

```txt
packages/theme-ui/
```

`@vetta/theme-ui` 是可选依赖，主题可以复用它，也可以完全自定义 UI。新增可复用组件的具体标准见 [组件设计要求](./component-guidelines.md)。

## 边界

主题不能：

- 直接 import 内部 atom。
- 直接调用 `window.vetta.*`。
- 复制删除、登录、导入、导航等业务逻辑。
- 绕过 i18n。
- 绕过 desktop-app 的 `DESIGN.md` 约束。

主题可以：

- 使用公开 model 数据。
- 调用公开 actions。
- 配置 surface 装饰。
- 传入 class/classNames。
- 通过 registry 替换稳定组件。
- 通过 region 完整接管某个 UI 区域。

## 选择方式

优先选择最小能力：

- 只改边框、背景、纹理：用 appearance。
- 只换一个按钮、列表项、trigger：用 component override。
- 要新增区域、移动布局、改变整体结构：用 region override。

不要为了改一个按钮重写完整 region。也不要为了新增主题自己的区域，把默认布局硬塞进固定 slot。

## 远程主题包方向

远程主题包应基于公开 SDK 编写：

```ts
import type { ThemeModule } from "@vetta/theme-sdk";
import { ThemeSurface } from "@vetta/theme-ui/appearance";
```

不应依赖：

```ts
import { activeSessionAtom } from "@shared/store/atoms";
import { useProjects } from "@domains/project/hooks/useProjects";
```

远程加载需要：

- React / ReactDOM 单例共享。
- `@vetta/theme-sdk` 单例共享。
- 可选 `@vetta/theme-ui` 单例共享。
- SDK 版本声明和能力声明。
- ErrorBoundary。
- 加载失败回退默认 UI。
- 权限声明。
- i18n 资源边界。

主题包未来不是通过 npm 安装到应用内，而是在运行时由应用根据 manifest 动态加载。npm 包名在这里表示开发期和构建期的公共契约；运行时应由主题加载器把这些依赖映射到应用内置的 shared singleton，避免每个主题携带自己的 React、SDK 或 UI 库副本。

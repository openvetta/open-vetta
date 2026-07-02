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

这两类需求不应混在同一个 API 中。低定制走配置，高定制走组件替换。

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
packages/desktop-app/src/renderer/shared/theme/appearance/ThemeSurface.tsx
```

示意：

```tsx
<ThemeSurface slot="sidebar.projects">
  <SidebarProjectsSection />
</ThemeSurface>
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

如果没有配置，`ThemeSurface` 只渲染普通 DOM，默认视觉不变。

### Region

Region 是页面或大布局级替换点，例如：

- `sidebar`
- `chatPage`
- `settingsPage`
- `composer`

Region 替换适合高定制主题。它应消费应用提供的 model，而不是自己访问内部 store。

### Component Override

Component override 用于替换更小的 UI 构件，例如：

- `SidebarNavItemButton`
- `ProjectRow`
- `SessionRow`
- `SettingsMenuTrigger`
- `MessageBubble`

这类替换必须基于稳定 props。

### Class API

很多主题不需要替换组件，只需要调整默认组件的局部样式。因此默认 UI 组件需要支持：

- `className`：组件外层样式。
- `classNames`：复合组件内部区域样式。

这不是最终主题系统的全部能力，但它是默认组件可复用的基础。

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
- 在未来通过 registry 替换稳定组件。

## 远程主题包方向

远程主题包应依赖公开 SDK：

```ts
import { useSidebarModel, CornerImageFrame } from "@app/theme-sdk";
```

不应依赖：

```ts
import { activeSessionAtom } from "@shared/store/atoms";
import { useProjects } from "@domains/project/hooks/useProjects";
```

远程加载需要：

- React / ReactDOM 单例共享。
- SDK 版本声明。
- ErrorBoundary。
- 加载失败回退默认 UI。
- 权限声明。
- i18n 资源边界。

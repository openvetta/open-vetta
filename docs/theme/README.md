# 主题系统设计文档

本目录记录 desktop-app 主题系统的设计与实施约定。这里的主题不是单纯的颜色 token，而是面向应用 UI 的装饰、复用和替换机制。

当前主题系统分两条线演进：

- 颜色主题：已有 `packages/desktop-app/src/renderer/shared/theme/`，负责 CSS token。
- UI 主题：新增 `packages/desktop-app/src/renderer/shared/theme/appearance/`，负责区域装饰、slot 和未来组件替换。

## 文档索引

- [架构设计](./architecture.md)：主题系统的分层、边界和核心概念。
- [侧边栏主题化基座](./sidebar-foundation.md)：当前已经落地的侧边栏 slot、`ThemeSurface`、`classNames` API。
- [实施路线](./roadmap.md)：后续从本地配置、组件替换到远程主题包的推进顺序。

## 当前落地状态

已完成的基座：

- 侧边栏默认 UI 已按区域拆分。
- `MessageCenter`、`SettingsMenu` 等侧边栏子组件已迁入侧边栏结构。
- 新增 `ThemeAppearanceProvider` 和 `ThemeSurface`。
- `CornerImageFrame` 可作为 `ThemeSurface` 的 `corner-image` frame。
- 侧边栏区域已接入稳定 surface slot。
- 侧边栏组件支持 `className` / `classNames`，便于主题复用默认组件时做局部视觉调整。

当前仍未实现：

- 主题配置加载来源。
- 设置页里的 UI 主题选择。
- 远程主题包加载。
- 组件 override registry。

## 核心原则

主题可以替换 UI 实现，但不能接管应用数据层和业务逻辑。

默认 UI 也被视为一个内置主题实现。外部主题应优先复用默认 model、actions 和 shared UI，只在必要时替换局部组件或区域。

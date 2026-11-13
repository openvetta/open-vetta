# Changelog

All notable changes to `@vetta-org/ui` are documented in this file.

## [Unreleased]

### Added

- 新增 `SessionTopItem` / `SessionTopGroup`（`./session-top-item` 入口，根入口同时导出）：会话页顶栏的一项，在 `ButtonGroupItem` 之上加三种点击行为——`menuItems` 下拉菜单、`popoverContent` 向下弹出的气泡（内容自定义，传函数可拿到 `close`）、或普通 `onClick`；单独使用时自带胶囊，放进 `ButtonGroup` 则是组内一格。`ButtonGroup` 同时导出 `useInButtonGroup`。
- 新增 `ButtonGroup` / `ButtonGroupItem`（`./button-group` 入口，根入口同时导出）：半透明胶囊按钮组，支持图标、文字、数字 / 红点角标、选中态，`shape` 可选 `pill`（默认）或 `square`。

## [0.1.0] — 2026-09-14

首次发布到 npm。此前它只作为 workspace 包在仓库内被引用，但官方能力市场里的 feishu 与 shimo
两个插件真的 import 了它的组件，没有它们在任何干净环境都装不上。

### Changed

- 包名由 `@vetta/ui` 改为 `@vetta-org/ui`：`@vetta` scope 不属于本账号，公开包统一发在
  `@vetta-org` 下（与 plugin-sdk / plugin-vite / plugin-cli 一致）。

### Added

- 共享 React 组件库，随包发布 TypeScript 源码（`files: ["src"]`），由消费方自行编译。

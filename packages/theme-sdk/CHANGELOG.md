# Changelog

All notable changes to `@vetta-org/theme-sdk` are documented in this file.

## [Unreleased]

## [0.2.0] — 2026-11-27

### Added

- `PageHeaderModel.leftActions`：与「展开侧边栏」按钮合成同一个按钮组的动作（如会话页的新会话），只在侧边栏触发器可见时渲染；不传时触发器仍是独立按钮。
- `SidebarModel.actions.prefetchNavItem`：可选，在用户表现出导航意图（悬停、聚焦）时预取页面代码，不激活路由。

### Removed

- 场景页已下线：`PageHeaderTitleKey` 去掉 `"appShell.routeTitles.scenes"`，`SidebarLabelKey` 去掉 `"sidebar.nav.scenes"`，`SidebarNavItem.path` 去掉 `"/scenes"`。主题里引用了这几个值的，删掉对应的导航项即可。这是类型层面的不兼容，因此升到 0.2.0。

## [0.1.0] — 2026-09-14

首次发布到 npm。此前只作为 workspace 包在仓库内引用，但官方能力市场里的 shimo 插件依赖它，
没有它该插件在任何干净环境都装不上。

主题合同层：主题包声明、槽位契约与类型。

### Changed

- 包名由 `@vetta/theme-sdk` 改为 `@vetta-org/theme-sdk`：`@vetta` scope 不属于本账号，公开包统一
  发在 `@vetta-org` 下（与 plugin-sdk / plugin-vite / plugin-cli / ui 一致）。

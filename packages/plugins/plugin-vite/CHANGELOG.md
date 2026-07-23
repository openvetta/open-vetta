# Changelog

All notable changes to `@vetta-org/plugin-vite` are documented in this file.

## [Unreleased]

### Added

- 插件 CSS 构建产物自动通过原生 `@scope` 限定到当前插件根节点，`:root` / `:host` 自动映射为 `:scope`，插件作者无需手写选择器前缀或 cascade layer。

## [0.0.2] — 2026-07-15

### Added

- **`VETTA_PLUGIN_DEV_WATCH=1` 跳过打包**：宿主 dev 热更新的 `vite build --watch` 只需要 dist，watch 模式下不再每轮增量构建都重打 zip。
- **打包始终纳入 `scripts/` 与 `agent/docs/`**（若存在），便于工作台脚本与内嵌手册随 zip 分发；MCP 声明时仍额外纳入 `mcp/`。
- **插件打包包含 MCP 资源**：声明 `agent.mcpServers` 时将配置文件（路径形式）及约定目录 `mcp/`、`scripts/` 打入 zip。

## [0.0.1] — 2026-07-14

### Changed

- **npm 包名**：由 `@vetta/plugin-vite` 更名为 `@vetta-org/plugin-vite`（发布 scope 与 org `vetta-org` 对齐）；构建时 external 的 SDK 名为 `@vetta-org/plugin-sdk`。

### Added

- Added Vite helpers for building Vetta Module Federation plugins with host-provided React shared dependencies.
- Added a plugin package helper that creates runtime-only install archives without Module Federation type and build metadata.
- Added automatic runtime-only zip packaging after Vite production builds.
- Added shared Rollup defaults for plugin entry points, host-provided SDK imports, and collision-safe asset names.

### Fixed

- Disabled unused Module Federation DTS output to avoid Windows output-directory cleanup races, and skip packaging failed builds.

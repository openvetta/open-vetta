# Changelog

All notable changes to `@vetta/plugin-vite` are documented in this file.

## [Unreleased]

### Added

- Added Vite helpers for building Vetta Module Federation plugins with host-provided React shared dependencies.
- Added a plugin package helper that creates runtime-only install archives without Module Federation type and build metadata.
- Added automatic runtime-only zip packaging after Vite production builds.
- Added shared Rollup defaults for plugin entry points, host-provided SDK imports, and collision-safe asset names.

### Fixed

- Disabled unused Module Federation DTS output to avoid Windows output-directory cleanup races, and skip packaging failed builds.

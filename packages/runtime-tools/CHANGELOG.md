# Changelog

All notable changes to `@vetta/runtime-tools` are documented in this file.

## [Unreleased]

### Added

- **Greenfield Coding Tools Feature**：新增 `@vetta/runtime-tools/coding`、`createCodingToolsFeature` 和 TypeBox 驱动的 `current_time` Runtime Tool；包根旧工具兼容导出保持不变。

### Fixed

- **`current_time` 兼容性**：恢复旧工具的完整模型描述、Schema 宽容度和直接执行语义，并增加旧新差分测试。

# Changelog

All notable changes to `@vetta/runtime-tools` are documented in this file.

## [Unreleased]

### Added

- **Greenfield Coding Tools Feature**：新增 `@vetta/runtime-tools/coding`、`createCodingToolsFeature` 和 TypeBox 驱动的 `current_time` Runtime Tool；包根旧工具兼容导出保持不变。
- **Coding Tool 注册层**：分离 Runtime Tool 执行定义与 `scope_use`、`category` 暴露元数据，并新增可复用旧新工具差分合同。
- **Read 行为合同**：新增参数化旧新行为合同，覆盖路径、编码、图片、二进制提示、锚点、截断、自定义 Operations 和取消。
- **Greenfield Read Tool**：新增独立 Runtime read、Coding 注册和可注入文件/图片 Port，并在旧新差分验证通过后接入 Greenfield Coding Tools Feature；包根旧工具兼容导出和生产入口保持不变。

### Fixed

- **`current_time` 兼容性**：恢复旧工具的完整模型描述、Schema 宽容度和直接执行语义，并增加旧新差分测试。

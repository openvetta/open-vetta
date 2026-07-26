# Changelog

All notable changes to `@vetta/runtime-tools` are documented in this file.

## [Unreleased]

### Breaking Changes

- **CodingToolCatalog 实时查询合同**：只读 Catalog 新增 `resolve(toolName)`；Coding Tools 不再写入编译期 `RuntimeSnapshot.tools`，改为通过 Model Call Contribution 在每次模型调用前物化。

### Added

- **Greenfield Coding Tools Feature**：新增 `@vetta/runtime-tools/coding`、`createCodingToolsFeature` 和 TypeBox 驱动的 `current_time` Runtime Tool；包根旧工具兼容导出保持不变。
- **Coding Tool 注册层**：分离 Runtime Tool 执行定义与 `scope_use`、`category` 暴露元数据，并新增可复用旧新工具差分合同。
- **Read 行为合同**：新增参数化旧新行为合同，覆盖路径、编码、图片、二进制提示、锚点、截断、自定义 Operations 和取消。
- **Greenfield Read Tool**：新增独立 Runtime read、Coding 注册和可注入文件/图片 Port，并在旧新差分验证通过后接入 Greenfield Coding Tools Feature；包根旧工具兼容导出和生产入口保持不变。
- **Greenfield Ls Tool**：新增独立 Runtime ls、参数化旧新行为合同和可注入目录 Operations；保留旧工具空 `scope_use` 的默认不激活语义，并通过真实 Agent Core Tool Loop 验证显式执行。
- **动态 Coding Tool Catalog**：新增版本化 `CodingToolCatalog`、可变 `CodingToolRegistry`、注册/注销、重名冲突和 scope/显式激活选择；每次模型调用读取不可变成员视图。

### Changed

- **Coding Tool 调用级动态解析**：Coding Tools Feature 不再在 prepare 时固定 Catalog 成员；每次模型调用读取最新注册集合，执行前再次校验工具仍存在且定义未替换，普通注册变化无需全量重编译 Runtime Snapshot。
- **Coding Tools Feature 装配边界**：`CodingToolsFeatureOptions` 不再逐项暴露 current_time/read/ls Options，改为接收只读 Catalog 与激活策略；工具依赖和 Options 由组合根创建注册对象时注入。

### Fixed

- **`current_time` 兼容性**：恢复旧工具的完整模型描述、Schema 宽容度和直接执行语义，并增加旧新差分测试。

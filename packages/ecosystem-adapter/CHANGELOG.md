# Changelog

All notable changes to `@vetta/ecosystem-adapter` are documented in this file.

## [Unreleased]

### Added

- **Hook 关键路径 info 日志（测试可观测）**：Codex adapter 加载时记 profile、handler 按事件计数与配置源；dispatch 对 SessionStart/Stop/Compact 及 block/fail 打精简 info（不含 command/stdin）。
- 新增通用 Hook 调度内核，负责配置、匹配、并发、命令执行和归一化 effect 聚合。
- 新增可组合的 `EcosystemHookRuntime` / `EcosystemHookAdapter` 抽象，将会话状态、多适配器聚合和 Stop 安全策略从 Coding Agent 下沉到生态适配包。
- 新增 `codex-hooks/fca51f6` profile，支持最新版 10 个事件、事件级严格 wire contract、Codex matcher、`commandWindows`、handler 环境变量、完成顺序聚合、通用工具身份、PreToolUse 输入改写及 PermissionRequest 决策。

### Changed

- Codex adapter 不再发现或读取 `CODEX_HOME`、`~/.codex`、项目 `.codex`，只解析宿主显式传入的配置层；Vetta 宿主仅从自己的全局和项目应用目录提供 `hooks.json`。
- Coding Agent 宿主通过生态无关运行时接入工具前后、压缩前后、会话开始和停止边界；具体 Codex 字段、名称与输出语义只存在于 Codex profile。
- Codex adapter 只维护最新版 `codex-hooks/fca51f6`，不保留旧版协议选择分支。
- Codex `hooks.json` 和 Hook stdout 的外部数据校验改用 Zod schemas，其中 stdout 按事件使用 strict object；移除重复的 record、字段白名单和可选字段类型判断，内部领域事件仍使用 TypeScript 判别联合。

# Changelog

All notable changes to `@vetta/ecosystem-adapter` are documented in this file.

## [Unreleased]

### Added

- **官方 Hook 配置路径发现 `buildDefaultHookConfigLayers()`**：仅按 Codex / Claude Code 官方布局累加读取——Codex：`$CODEX_HOME|~/.codex/hooks.json` 与 `<cwd>/.codex/hooks.json`；Claude：`~/.claude/settings.json`、`<cwd>/.claude/settings.json`、`settings.local.json`（`"hooks"` 键）。source 带 `profileId` 隔离；**不读** Vetta `agentDir` / `.vetta` 下的 hook 文件。
- **Claude Code Hook profile `claude-code-hooks/2.1.211`**：独立 wire contract（不污染 Codex profile），支持 Vetta 宿主已触发的 10 个事件子集、`command` sync handler、matcher、`${CLAUDE_PLUGIN_ROOT}` / `${CLAUDE_PROJECT_DIR}` 展开、Windows 上禁止将 `.sh` 交给 cmd.exe；配置源为官方 settings 或显式 `hooks/hooks.json` + `CLAUDE_PLUGIN_ROOT`。
- **Hook 关键路径 info 日志（测试可观测）**：Codex adapter 加载时记 profile、handler 按事件计数与配置源；dispatch 对 SessionStart/Stop/Compact 及 block/fail 打精简 info（不含 command/stdin）。
- 新增通用 Hook 调度内核，负责配置、匹配、并发、命令执行和归一化 effect 聚合。
- 新增可组合的 `EcosystemHookRuntime` / `EcosystemHookAdapter` 抽象，将会话状态、多适配器聚合和 Stop 安全策略从 Coding Agent 下沉到生态适配包。
- 新增 `codex-hooks/fca51f6` profile，支持最新版 10 个事件、事件级严格 wire contract、Codex matcher、`commandWindows`、handler 环境变量、完成顺序聚合、通用工具身份、PreToolUse 输入改写及 PermissionRequest 决策。

### Changed

- Codex / Claude adapter 仍只解析宿主传入的配置层；默认层由 `buildDefaultHookConfigLayers` 仅提供官方 `.codex` / `.claude` 路径。`isCodexOwnedSource` 仅认 `/.codex/hooks.json`（或 `profileId`）；`isClaudeOwnedSource` 仅认 `.claude/settings*.json`、插件 `hooks/hooks.json` 或 `profileId`。
- Coding Agent 宿主通过生态无关运行时接入工具前后、压缩前后、会话开始和停止边界；具体 Codex 字段、名称与输出语义只存在于 Codex profile。
- Codex adapter 只维护最新版 `codex-hooks/fca51f6`，不保留旧版协议选择分支。
- Codex `hooks.json` 和 Hook stdout 的外部数据校验改用 Zod schemas，其中 stdout 按事件使用 strict object；移除重复的 record、字段白名单和可选字段类型判断，内部领域事件仍使用 TypeScript 判别联合。

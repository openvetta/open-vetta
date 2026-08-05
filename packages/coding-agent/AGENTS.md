# Team: Coding Agent

> 本包是独立 team，核心业务逻辑所在，上游依赖 AI Core team，下游被 Runtime team 和 Apps team 消费。

## 职责范围

交互式 Coding Agent CLI，包含会话编排、工具组合、MCP 产品适配与扩展系统。

## 关键模块

- `src/core/agent-session.ts` — 核心会话管理（最大文件，~98KB），修改需极度谨慎
- `src/core/model-resolver.ts` — 模型解析器
- `src/core/model-registry.ts` — 模型注册表
- `src/core/tools/` — 内置工具（bash、read、edit、grep 等）
- `src/adapters/runtime-core/coding-agent-mcp-supervisor.ts` — MCP 产品路径与凭证组合
- `src/core/extensions/` — 扩展系统
- `src/core/compaction/` — 会话压缩
- `src/core/keybindings.ts` — 快捷键管理
- `src/modes/interactive/` — 交互式 TUI 模式
- `src/modes/rpc/` — RPC 模式
- `src/cli/` — CLI 参数解析和入口

## 导出接口

通过 `package.json` exports 暴露给 runtime 层：
- `.` — 主模块
- `./hooks` — 钩子系统
- `./core/settings-manager.js` — 设置管理器
- `./runtime-host/greenfield` — Greenfield Runtime 产品适配

## 注意事项

- `agent-session.ts` 是系统核心，变更需充分测试
- MCP 协议、传输与 OAuth 通用能力属于 `runtime-mcp`，不得在本包复制实现
- 添加新工具需同步更新 `runtime-tools` 的导出
- 修改 exports 字段需确认 runtime-* 和 desktop-app 的兼容性
- 测试在 `test/` 目录，覆盖会话并发、压缩、树导航等场景

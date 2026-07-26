# Team: Runtime

> 本包属于 **Runtime Team**，同组包：`runtime-core`、`runtime-mcp`、`runtime-storage`、`runtime-telemetry`、`cli-app`

## 职责范围

通用 Agent 工具实现与 Coding Tools Feature。

包根当前暂时保留 `@vetta/coding-agent` 工具兼容导出；新实现位于 `src/coding/`，
通过 `@vetta/runtime-tools/coding` 使用，不得依赖 `coding-agent`。

## 注意事项

- `src/index.ts` 仅用于迁移期旧兼容导出
- `src/coding/` 真正拥有新 Runtime Tool 和 Feature
- 新工具参数使用 TypeBox，并实现 `RuntimeToolDefinition`
- 工具不得持有 Session 或绕过 Runtime Tool Policy
- 新代码禁止导入 `@vetta/coding-agent`

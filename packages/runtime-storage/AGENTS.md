# Team: Runtime

> 本包属于 **Runtime Team**，同组包：`runtime-core`、`runtime-mcp`、`runtime-telemetry`、`runtime-tools`、`cli-app`

## 职责范围

存储实现包，拥有独立的 Conversation Repository 和旧会话格式只读迁移边界。

## 注意事项

- `src/conversation/` 必须真正拥有新 Kernel 的会话持久化实现，不得导入 `@vetta/coding-agent`
- 包根只转发原生 Conversation 能力，不得恢复认证、设置或旧 Session Manager 兼容导出
- 新代码可通过包根或 `@vetta/runtime-storage/conversation` 使用相同的 Conversation API
- 旧 `coding-agent` 只允许作为测试差分 Oracle 出现在开发依赖中

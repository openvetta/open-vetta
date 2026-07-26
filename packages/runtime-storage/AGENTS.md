# Team: Runtime

> 本包属于 **Runtime Team**，同组包：`runtime-core`、`runtime-mcp`、`runtime-telemetry`、`runtime-tools`、`cli-app`

## 职责范围

存储实现包，包括新 Conversation Repository，以及迁移期间保留的认证、旧会话和设置兼容导出。

## 注意事项

- `src/conversation/` 必须真正拥有新 Kernel 的会话持久化实现，不得导入 `@vetta/coding-agent`
- 包根暂时导出 `AuthStorage`、`SessionManager`、`SettingsManager` 等旧兼容 API
- 新代码应通过 `@vetta/runtime-storage/conversation` 使用 `FileConversationRepository`

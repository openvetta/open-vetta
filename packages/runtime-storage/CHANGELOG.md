# Changelog

All notable changes to `@vetta/runtime-storage` are documented in this file.

## [Unreleased]

### Added

- **Turn 外手动压缩持久化**：Conversation V2 Schema 允许 `reason: "manual"` 的 `context.compacted` 不携带 `turnId`，并在关闭、重开后继续投影为相同的摘要与保留尾部；活动 Turn 内的压缩协议仍由 Runtime Core 严格校验。
- **原生 Context Compaction 持久化**：Conversation V2 TypeBox Schema 支持摘要消息、保留边界、token 用量和触发原因，并将压缩记录投影为分支节点；旧计数型 `context.compacted` 记录继续可读且不改变历史分支。
- **分支级 Custom Document Entry 持久化**：V2 Repository 支持 TypeBox 校验的 `custom.append` operation、事件 parent 对 custom entry 的完整性校验及 fork 重放，为 Todo 等产品状态提供不泄漏业务类型的会话内持久化边界。
- **Conversation Context Record 持久化**：V2 TypeBox 事件 Schema 新增 `context.appended`，将模型可见隐藏上下文与模型不可见业务 marker 保存为原生分支节点；Repository 恢复模型上下文时保留顺序，聊天消息投影不暴露隐藏记录。
- **Conversation V2 历史写入与并发控制**：新增 TypeBox 校验的 Document Operation、乐观 document revision、跨 Repository 文件读写锁和可恢复 fork；原生 V1 保持可读/可追加但历史命令只读失败，活动分支决定 Repository 返回的模型消息。
- **Conversation V2 与 Legacy History Importer**：原生 JSONL V2 event envelope 保存稳定 document entry identity，并继续严格读取和原格式追加 V1；`FileConversationRepository` 新增 Conversation Document 读取，另提供不依赖 coding-agent 的 Legacy v1-v3 只读 importer，覆盖旧新历史差异和损坏 parent 校验。
- **Greenfield Session Projection 集成**：`FileConversationRepository` 新增稳定绝对会话文件路径解析，并通过真实文件 create、prompt、dispose、resume 验证 Runtime Core 同步状态和消息投影可重建。
- **Conversation TypeBox Schema**：为 Message、Session Event、JSONL Record 和 Snapshot 增加完整运行时 Schema；Repository 在写入边界拒绝非法领域对象，并在读取时将结构正确但语义非法的记录判定为损坏。
- **版本化文件会话仓储**：新增 `@vetta/runtime-storage/conversation` 和 `FileConversationRepository`，支持事件顺序、乐观版本、原子 Snapshot 写入及损坏记录检测；包根旧兼容导出保持不变。

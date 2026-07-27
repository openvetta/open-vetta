# Changelog

All notable changes to `@vetta/runtime-storage` are documented in this file.

## [Unreleased]

### Added

- **Greenfield Session Projection 集成**：`FileConversationRepository` 新增稳定绝对会话文件路径解析，并通过真实文件 create、prompt、dispose、resume 验证 Runtime Core 同步状态和消息投影可重建。
- **Conversation TypeBox Schema**：为 Message、Session Event、JSONL Record 和 Snapshot 增加完整运行时 Schema；Repository 在写入边界拒绝非法领域对象，并在读取时将结构正确但语义非法的记录判定为损坏。
- **版本化文件会话仓储**：新增 `@vetta/runtime-storage/conversation` 和 `FileConversationRepository`，支持事件顺序、乐观版本、原子 Snapshot 写入及损坏记录检测；包根旧兼容导出保持不变。

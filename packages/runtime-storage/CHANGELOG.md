# Changelog

All notable changes to `@vetta/runtime-storage` are documented in this file.

## [Unreleased]

### Added

- **版本化文件会话仓储**：新增 `@vetta/runtime-storage/conversation` 和 `FileConversationRepository`，支持事件顺序、乐观版本、原子 Snapshot 写入及损坏记录检测；包根旧兼容导出保持不变。

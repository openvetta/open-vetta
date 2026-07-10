# Changelog

All notable changes to `@vetta/runtime-core` are documented in this file.

## [Unreleased]

### Changed

- **周边任务自动选模 + 失败轮转**：`autoTitleSession` / `nextPromptSuggestions` 不再依赖用户配置的「全局/周边模型」。改为优先使用当前会话模型，再从 `ModelRegistry.getAvailable()` 补足候选（最多 3 个）；调用失败或无可用结果时进程内冷却该模型并轮转下一个。无可用凭证时静默跳过。
- **`autoTitleSession` 日志增加 `durationMs`**：单次候选模型调用的 LLM 耗时写入成功/失败日志，便于对照 thinking 体量排查慢标题。

### Added

- `SessionHistoryInfo` 新增可选字段 `lastMessagePreview?: string`：`RuntimeHost.listSessions()` 把 coding-agent `SessionInfo.lastMessagePreview`（最后一条用户/助手消息的截断预览）透传给宿主，供桌面快捷面板「最近会话」列表展示会话末条预览。字段可选，既有调用方无需改动。

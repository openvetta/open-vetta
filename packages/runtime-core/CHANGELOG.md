# Changelog

All notable changes to `@vetta/runtime-core` are documented in this file.

## [Unreleased]

### Fixed

- **`RuntimeHost.prompt` 在开跑前确保 session cwd 存在**：desktop per-session 目录被删后 handle 仍存活时，mkdir 自愈，避免 bash/read 等工具报 Working directory does not exist。

### Changed

- **`RuntimeHost` 按职责拆分到 `src/runtime-host/`**：原 ~1.7k 行单文件拆为 `runtime-host`（会话编排）、`session-events`（事件映射）、`history`（历史/分支）、`peripheral-tasks`（自动标题/输入预测）、`plugin-debug`、`types`；包根 `index.ts` 从目录入口导出，对外 API 不变。
- **周边任务自动选模 + 失败轮转**：`autoTitleSession` / `nextPromptSuggestions` 不再依赖用户配置的「全局/周边模型」。改为优先使用当前会话模型，再从 `ModelRegistry.getAvailable()` 补足候选（最多 3 个）；调用失败或无可用结果时进程内冷却该模型并轮转下一个。无可用凭证时静默跳过。
- **`autoTitleSession` 日志增加 `durationMs`**：单次候选模型调用的 LLM 耗时写入成功/失败日志，便于对照 thinking 体量排查慢标题。

### Added

- **消息编辑 / 分支切换 API**：`HistoryEntry` 消息项携带 `entryId`/`parentId`/`branch`（user sibling）；`navigateForEdit` / `switchBranch` / `forkSession` 贯通 SessionFacade 与 RuntimeHost，供桌面端历史重编辑与同 session 分叉。`branch` 聚合跳过 skill 等透明节点，使编辑后的多版本能显示 `‹ i/n ›`。
- **HistoryEntry `settings_assist_marker`**：`entriesToHistory` 将 coding-agent 的 `custom_message`（`customType: settings_assist_instruction`）映射为 UI 标记（含可选 `tabId`），供 desktop 历史回放时显示「MCP配置协助」等页面对应徽章；不进入 LLM 上下文。
- `SessionHistoryInfo` 新增可选字段 `lastMessagePreview?: string`：`RuntimeHost.listSessions()` 把 coding-agent `SessionInfo.lastMessagePreview`（最后一条用户/助手消息的截断预览）透传给宿主，供桌面快捷面板「最近会话」列表展示会话末条预览。字段可选，既有调用方无需改动。

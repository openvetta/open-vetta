## [Unreleased]

### Added

- Added `html_to_pdf` tool as a thin wrapper around Vetta Desktop's PDF command-line mode.

### Changed

- Scene 触发时按 `tasks.json` 1:1 工程化加载 todo 列表：先重置已有 todos，再批量创建，并锁定列表禁止 LLM 通过 `todo(action="create")` 追加。同 session 内重复触发同一 scene 会被无视；新 session 自动解锁。锁定状态会随 `todo_snapshot` 持久化以支持会话恢复。

### Removed

- 移除 `invoke_scene` 工具及其在 system prompt 中的指引。Scene 完全由服务端 `_expandSkillCommand` 在 `/scene:` 前缀进入时直接处理（注入隐藏 scene 内容 + 预填 todo 列表），不再依赖大模型自行调用工具。

## Vetta CLI v0.0.1

初始化成功

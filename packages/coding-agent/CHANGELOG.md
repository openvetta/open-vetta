## [Unreleased]

### Added

- Added `html_to_pdf` tool as a thin wrapper around Vetta Desktop's PDF command-line mode.

### Fixed

- **未登录时本地模型也被拦截，报 "No model selected"**：`packages/coding-agent/src/core/model-registry.ts` 三处合修。(1) `validateConfig` 原本对所有定义了 `models` 的 custom provider 强制要求 `apiKey`，但 ollama / lm-studio / vLLM 等本地推理服务通常不需要 key——把这条 throw 移除（`baseUrl` 仍必填）。(2) `loadCustomModels` 原本 `validateConfig` 抛错就 catch 后整段返回 `emptyCustomModelsResult`——一个 provider 配错会株连 `models.json` 里所有其它 provider 全部失效；改成 per-provider 收集错误，坏 provider 跳过、好 provider 照常加载，错误聚合到 `loadError` 供 UI 展示。(3) 新增 `customProviderNames: Set<string>` 跟踪所有用户自定义 provider；`getAvailable()` 把它们也算可用（原先只看 `isRemote || hasAuth`，本地无 key provider 既不是 remote 也没有任何 auth 形态，会被过滤掉，导致 `findInitialModel` 返回 undefined → agent-session 入口报 "No model selected"）。`getApiKey` / `getApiKeyForProvider` 对自定义 provider 在没有真实 key 且未配置 OAuth 时返回常量占位符 `no-auth-needed-for-local-provider`，让请求走到上游——本地服务忽略 Authorization、远端真要 key 时返回精准 401，远比"在挑选阶段就拒绝"对用户友好。

### Changed

- Scene 触发时按 `tasks.json` 1:1 工程化加载 todo 列表：先重置已有 todos，再批量创建，并锁定列表禁止 LLM 通过 `todo(action="create")` 追加。同 session 内重复触发同一 scene 会被无视；新 session 自动解锁。锁定状态会随 `todo_snapshot` 持久化以支持会话恢复。

### Removed

- 移除 `invoke_scene` 工具及其在 system prompt 中的指引。Scene 完全由服务端 `_expandSkillCommand` 在 `/scene:` 前缀进入时直接处理（注入隐藏 scene 内容 + 预填 todo 列表），不再依赖大模型自行调用工具。

## Vetta CLI v0.0.1

初始化成功

## [Unreleased]

### Added

- **`CreateAgentSessionOptions.serverUrl`：允许调用方注入权威 Vetta server URL**：原先 `createAgentSession` 在 `settings.json` 没有 `serverUrl` 时强制 fallback 到 `packages/coding-agent/src/config.ts` 里硬编码的 `http://REDACTED-HOST:8080/api/v1` 并**把它静默写回 settings.json**。这在 desktop-app prod 构建里直接踩坑：desktop-app 自己的 main 进程模块（`vetta:settings:get-server-url` / `fetchRemoteProviders` / `fetchCreditsBalance`）走编译期注入的 `VETTA_SERVER_URL`（prod = `REDACTED-HOST:8080`），而同一进程内的 coding-agent SDK 却用 `REDACTED-HOST:8080`——renderer 看到的 remote 模型来自 prod server，但 `ModelRegistry.loadRemoteModels` / LLM 流式请求全部打到 LAN dev，prod 用户网络下静默超时，`findInitialModel` 返回 undefined，`session.prompt` 抛 `No model selected` 被链路上的没 try/catch 处吞掉，表现为「发消息无任何反应」。修复：`createAgentSession` 接收 `options.serverUrl`，存在时优先使用且**不**回写 settings.json（调用方是权威源，跨环境切换不应被持久化污染）；不传时维持旧行为兼容 CLI。runtime-core `RuntimeHost` 同步暴露 `serverUrl` option 透传过来。

- **Session-level 图片预算（默认保留最近 2 张）**：新增 `packages/coding-agent/src/core/image-budget.ts` 中的 `applyImageBudget(messages, budget)`，并在 `sdk.ts` 的 `transformContext` 里挂在 `extensionRunner.emitContext` + `session.preCallCompaction` 之后调用。每次发起 LLM 调用前从最新消息往前扫描，最多保留 `budget` 张 `ImageContent`，更早的图片就地替换为占位文本 `[earlier image omitted to conserve memory]`。配套在 `SettingsManager` 暴露 `getMaxRecentImages()` / `setMaxRecentImages()`，对应 `settings.json` 的 `images.maxRecentImages`（默认 `2`，`<=0` 关闭预算/保留全部）。**解决的具体问题**：单张图被 resize 到合规上限不等于 N 张并存也合规——VL 后端是按"当前请求里所有图的视觉 token 总和"占显存的，旧会话每多保留一张大图就多 5000+ patch tokens，到第 2~3 张时本地推理服务就 CUDA OOM 直接返 500。通过把超出预算的旧图替换为短文本，既保住最近上下文的视觉能力，又把累积视觉 token 钉死在常数级。
- **LLM 调用失败时 session 不再立即终止，默认尝试自我恢复（最多 3 次）**：批量任务跑本地视觉模型时，单张大图触发后端 CUDA OOM 会让 provider 返回 `stopReason === "error"`，原 agent loop 看到就立刻 `agent_end`，整个 session 直接结束、被 batch executor 标 `task.failed`。新增 `Settings.errorRecovery: { mode?: "halt" | "inject-and-retry"; maxConsecutiveErrors?: number }`（`SettingsManager#getErrorRecoverySettings()`），sdk.ts 在 `new Agent({...})` 时透传到 `AgentOptions.errorRecovery`。**默认 `mode === "inject-and-retry"`、`maxConsecutiveErrors === 3`**：失败时把 error assistant 从 LLM 上下文 pop 掉，注入一条带引导文案的 user 消息（"上次调用失败：…，不要重复刚才操作；用 bash 看元数据；跳过失败步骤；拆分任务"），让模型自行换路径继续；连续失败到上限才真正 halt。要恢复旧行为在 settings.json 加 `{ "errorRecovery": { "mode": "halt" } }` 即可。
- Added `html_to_pdf` tool as a thin wrapper around Vetta Desktop's PDF command-line mode.

### Fixed

- **未登录时本地模型也被拦截，报 "No model selected"**：`packages/coding-agent/src/core/model-registry.ts` 三处合修。(1) `validateConfig` 原本对所有定义了 `models` 的 custom provider 强制要求 `apiKey`，但 ollama / lm-studio / vLLM 等本地推理服务通常不需要 key——把这条 throw 移除（`baseUrl` 仍必填）。(2) `loadCustomModels` 原本 `validateConfig` 抛错就 catch 后整段返回 `emptyCustomModelsResult`——一个 provider 配错会株连 `models.json` 里所有其它 provider 全部失效；改成 per-provider 收集错误，坏 provider 跳过、好 provider 照常加载，错误聚合到 `loadError` 供 UI 展示。(3) 新增 `customProviderNames: Set<string>` 跟踪所有用户自定义 provider；`getAvailable()` 把它们也算可用（原先只看 `isRemote || hasAuth`，本地无 key provider 既不是 remote 也没有任何 auth 形态，会被过滤掉，导致 `findInitialModel` 返回 undefined → agent-session 入口报 "No model selected"）。`getApiKey` / `getApiKeyForProvider` 对自定义 provider 在没有真实 key 且未配置 OAuth 时返回常量占位符 `no-auth-needed-for-local-provider`，让请求走到上游——本地服务忽略 Authorization、远端真要 key 时返回精准 401，远比"在挑选阶段就拒绝"对用户友好。

### Changed

- **用户粘贴/拖入/桌面端上传的图片也走 resize 管线**：`packages/coding-agent/src/core/agent-session.ts` 新增 `_normalizeUserImages(images)`，在 `prompt()` 内取到 `currentImages`、且 extension input transform 跑完之后调用，对每张 `ImageContent` 跑 `resizeImage()`（默认 1280×1280 / 2MB），再分发给 `_queueSteer` / `_queueFollowUp` / userContent。原先 resize 只接在 `read` 工具里——但 desktop-app `InputBar.tsx` / web-ui 上传图片走的是 RPC `PromptRequest.images`，**完全跳过 resize**，到达本地 VL 后端时仍是原始分辨率（实测 qwen3.6-35b 单张 4032×3024 图 = 17,057 input tokens），叠加 2 张就足以 CUDA OOM。新增 `images.autoResize` 设置项（已存在）现在同时管 read 工具与用户上传两路；关掉后保持原行为。Photon WASM 加载失败时按原图透传。
- **图片预处理默认值面向本地 VL 模型调低**：`packages/coding-agent/src/utils/image-resize.ts` 中 `DEFAULT_OPTIONS` 的 `maxWidth/maxHeight` 由 `2000` → `1280`，`jpegQuality` 由 `80` → `70`，`DEFAULT_MAX_BYTES` 由 `4.5MB` → `2MB`。原值是按 Anthropic 5MB 字节限制设计的；但本地/开源视觉模型（Qwen-VL、InternVL 等）的瓶颈不是字节数而是 vision encoder 中的视觉 token 数（patch tokens），2000×2000 单张图就有 5000+ tokens，连续读两张就足以撑爆 GPU 显存返回 `500 (no body)` / CUDA OOM。新默认 1280×1280 把单图视觉 token 量降到约 1/2.4，给多图场景留出预算。如果只用 Claude，可通过 `ReadToolOptions.imageResize` 自定义拉回 2000（待后续暴露）。
- Scene 触发时按 `tasks.json` 1:1 工程化加载 todo 列表：先重置已有 todos，再批量创建，并锁定列表禁止 LLM 通过 `todo(action="create")` 追加。同 session 内重复触发同一 scene 会被无视；新 session 自动解锁。锁定状态会随 `todo_snapshot` 持久化以支持会话恢复。

### Removed

- 移除 `invoke_scene` 工具及其在 system prompt 中的指引。Scene 完全由服务端 `_expandSkillCommand` 在 `/scene:` 前缀进入时直接处理（注入隐藏 scene 内容 + 预填 todo 列表），不再依赖大模型自行调用工具。

## Vetta CLI v0.0.1

初始化成功

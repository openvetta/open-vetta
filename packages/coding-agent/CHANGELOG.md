## [Unreleased]

### Added

- **MCP HTTP transport 支持**：`McpServerConfig` 改为 stdio/http 联合类型。`type: "http"` 配置走 `@modelcontextprotocol/sdk` 的 `StreamableHTTPClientTransport`，支持 `url` 和可选 `headers`（含 `${VAR}` 替换）。原 stdio 配置（带 `command`）行为不变，`type` 字段缺省即视为 stdio。配置示例：`{ "exa": { "type": "http", "url": "https://mcp.exa.ai/mcp" } }`。
- Added `glob` tool for default file name glob searches using ripgrep-backed matching.
- Added `grep` to the default coding tool set for content searches.

- **工具调用 timing 元数据持久化（含工具自报阶段）**：新增 `ToolTimingEntry` SessionEntry 类型（`type: "tool_timing"`，含 `toolCallId / toolName / startedAt / durationMs / phases`），与 `SessionMessageEntry` 平行落盘。**关键架构选择**：放在 message 之外的独立 entry，让 `buildSessionContext` 在拼 LLM payload 时压根看不见——timing 数据不被发回大模型当作上下文，是硬性架构边界而非过滤约定。详见 `docs/adr/0001-tool-timing-as-separate-session-entry.md`。`SessionManager` 新增 `appendToolTiming(toolCallId, toolName, startedAt, durationMs, phases)`，agent-session 在 `tool_execution_end` 事件处自动调用。同时扩展 `@mariozechner/pi-agent-core` 的 `AgentTool.execute` 签名加入第五个可选参数 `ctx: { phase(label) }`：工具内部调用 `ctx.phase("ocr")` 即可上报阶段边界，agent-loop 累积成 `phases: [{label, atMs}]` 数组（区间语义——下一次调用隐含上一段结束）。`AgentEvent` 联合新增 `tool_execution_phase` 事件 + `tool_execution_start` 加 `startedAt` + `tool_execution_end` 加 `startedAt/durationMs/phases`，对应的 `ToolExecutionStartEvent / ToolExecutionPhaseEvent / ToolExecutionEndEvent` 全部同步扩展。tools 侧已接入：`extract_text_from_pdf`（locate → ocr → read）、`extract_text_from_img`（locate → ocr → read）、`html_to_pdf`（locate → render）、`doc_to_pdf`（locate → detect → convert）。

- **`CreateAgentSessionOptions.serverUrl`：允许调用方注入权威 Vetta server URL**：原先 `createAgentSession` 在 `settings.json` 没有 `serverUrl` 时强制 fallback 到 `packages/coding-agent/src/config.ts` 里硬编码的 `http://REDACTED-HOST:8080/api/v1` 并**把它静默写回 settings.json**。这在 desktop-app prod 构建里直接踩坑：desktop-app 自己的 main 进程模块（`vetta:settings:get-server-url` / `fetchRemoteProviders` / `fetchCreditsBalance`）走编译期注入的 `VETTA_SERVER_URL`（prod = `REDACTED-HOST:8080`），而同一进程内的 coding-agent SDK 却用 `REDACTED-HOST:8080`——renderer 看到的 remote 模型来自 prod server，但 `ModelRegistry.loadRemoteModels` / LLM 流式请求全部打到 LAN dev，prod 用户网络下静默超时，`findInitialModel` 返回 undefined，`session.prompt` 抛 `No model selected` 被链路上的没 try/catch 处吞掉，表现为「发消息无任何反应」。修复：`createAgentSession` 接收 `options.serverUrl`，存在时优先使用且**不**回写 settings.json（调用方是权威源，跨环境切换不应被持久化污染）；不传时维持旧行为兼容 CLI。runtime-core `RuntimeHost` 同步暴露 `serverUrl` option 透传过来。

- **Session-level 图片预算（默认保留最近 2 张）**：新增 `packages/coding-agent/src/core/image-budget.ts` 中的 `applyImageBudget(messages, budget)`，并在 `sdk.ts` 的 `transformContext` 里挂在 `extensionRunner.emitContext` + `session.preCallCompaction` 之后调用。每次发起 LLM 调用前从最新消息往前扫描，最多保留 `budget` 张 `ImageContent`，更早的图片就地替换为占位文本 `[earlier image omitted to conserve memory]`。配套在 `SettingsManager` 暴露 `getMaxRecentImages()` / `setMaxRecentImages()`，对应 `settings.json` 的 `images.maxRecentImages`（默认 `2`，`<=0` 关闭预算/保留全部）。**解决的具体问题**：单张图被 resize 到合规上限不等于 N 张并存也合规——VL 后端是按"当前请求里所有图的视觉 token 总和"占显存的，旧会话每多保留一张大图就多 5000+ patch tokens，到第 2~3 张时本地推理服务就 CUDA OOM 直接返 500。通过把超出预算的旧图替换为短文本，既保住最近上下文的视觉能力，又把累积视觉 token 钉死在常数级。
- Added `html_to_pdf` tool as a thin wrapper around Vetta Desktop's PDF command-line mode.

### Fixed

- **图片 resize 失败时不再把原图透传给模型**：`resizeImage()` 现在在 Photon 不可用或 WASM 处理失败（例如超大 PNG 触发 `unreachable`）时返回显式失败结果，并把详细错误写入日志；`read` 工具、用户上传图片与 CLI `@file` 图片入口会改为给模型返回可读文本说明并省略图片附件，避免 20MB+ 原图 fallback 后继续撑爆本地 VL 后端。

- **未登录时本地模型也被拦截，报 "No model selected"**：`packages/coding-agent/src/core/model-registry.ts` 三处合修。(1) `validateConfig` 原本对所有定义了 `models` 的 custom provider 强制要求 `apiKey`，但 ollama / lm-studio / vLLM 等本地推理服务通常不需要 key——把这条 throw 移除（`baseUrl` 仍必填）。(2) `loadCustomModels` 原本 `validateConfig` 抛错就 catch 后整段返回 `emptyCustomModelsResult`——一个 provider 配错会株连 `models.json` 里所有其它 provider 全部失效；改成 per-provider 收集错误，坏 provider 跳过、好 provider 照常加载，错误聚合到 `loadError` 供 UI 展示。(3) 新增 `customProviderNames: Set<string>` 跟踪所有用户自定义 provider；`getAvailable()` 把它们也算可用（原先只看 `isRemote || hasAuth`，本地无 key provider 既不是 remote 也没有任何 auth 形态，会被过滤掉，导致 `findInitialModel` 返回 undefined → agent-session 入口报 "No model selected"）。`getApiKey` / `getApiKeyForProvider` 对自定义 provider 在没有真实 key 且未配置 OAuth 时返回常量占位符 `no-auth-needed-for-local-provider`，让请求走到上游——本地服务忽略 Authorization、远端真要 key 时返回精准 401，远比"在挑选阶段就拒绝"对用户友好。

### Changed

- `extract_text_from_pdf` OCR fallback DPI 默认值从 200 调整为 150；未显式传入 DPI 时，会根据 `pdfinfo -box` 读取到的 PDF 页面尺寸自动下调 DPI，避免超大页面经 `pdftoppm` 渲染出过大图片导致 OOM。
- **用户粘贴/拖入/桌面端上传的图片也走 resize 管线**：`packages/coding-agent/src/core/agent-session.ts` 新增 `_normalizeUserImages(images)`，在 `prompt()` 内取到 `currentImages`、且 extension input transform 跑完之后调用，对每张 `ImageContent` 跑 `resizeImage()`（默认 1280×1280 / 2MB），再分发给 `_queueSteer` / `_queueFollowUp` / userContent。原先 resize 只接在 `read` 工具里——但 desktop-app `InputBar.tsx` / web-ui 上传图片走的是 RPC `PromptRequest.images`，**完全跳过 resize**，到达本地 VL 后端时仍是原始分辨率（实测 qwen3.6-35b 单张 4032×3024 图 = 17,057 input tokens），叠加 2 张就足以 CUDA OOM。新增 `images.autoResize` 设置项（已存在）现在同时管 read 工具与用户上传两路；关掉后保持原行为。Photon WASM 加载或处理失败时省略图片附件并给模型返回文本说明，不再按原图透传。
- **图片预处理默认值面向本地 VL 模型调低**：`packages/coding-agent/src/utils/image-resize.ts` 中 `DEFAULT_OPTIONS` 的 `maxWidth/maxHeight` 由 `2000` → `1280`，`jpegQuality` 由 `80` → `70`，`DEFAULT_MAX_BYTES` 由 `4.5MB` → `2MB`。原值是按 Anthropic 5MB 字节限制设计的；但本地/开源视觉模型（Qwen-VL、InternVL 等）的瓶颈不是字节数而是 vision encoder 中的视觉 token 数（patch tokens），2000×2000 单张图就有 5000+ tokens，连续读两张就足以撑爆 GPU 显存返回 `500 (no body)` / CUDA OOM。新默认 1280×1280 把单图视觉 token 量降到约 1/2.4，给多图场景留出预算。如果只用 Claude，可通过 `ReadToolOptions.imageResize` 自定义拉回 2000（待后续暴露）。
- Scene 触发时按 `tasks.json` 1:1 工程化加载 todo 列表：先重置已有 todos，再批量创建，并锁定列表禁止 LLM 通过 `todo(action="create")` 追加。同 session 内重复触发同一 scene 会被无视；新 session 自动解锁。锁定状态会随 `todo_snapshot` 持久化以支持会话恢复。

### Removed

- 移除 `invoke_scene` 工具及其在 system prompt 中的指引。Scene 完全由服务端 `_expandSkillCommand` 在 `/scene:` 前缀进入时直接处理（注入隐藏 scene 内容 + 预填 todo 列表），不再依赖大模型自行调用工具。
- **移除 LLM 调用 500 错误时的"鞭策机制"（inject-and-retry）**：之前 provider 返回 `stopReason === "error"` 时会注入一条 user 消息（"这通常由以下原因导致：1. 输入图片过大触发后端 CUDA OOM / 2. 上下文过长超出后端预分配显存 / 3. 后端服务临时不可用 / 5xx ……"）让模型自行换路径继续，连续失败 3 次才 halt。实测该机制对本地 VL 模型的恢复价值有限，反而把失败原因揉进上下文干扰后续 turn，且 `Session-level 图片预算` 已从源头解决主要诱因（多图累计 OOM）。删除 `Settings.errorRecovery`、`SettingsManager#getErrorRecoverySettings()`、`ErrorRecoverySettings` 类型，以及 `sdk.ts` 中向 `AgentOptions.errorRecovery` 的透传；同时删除 `@mariozechner/pi-agent-core` 的 `AgentLoopConfig.errorRecovery`、`AgentOptions.errorRecovery`、`Agent#errorRecovery` 与 `ErrorRecoveryConfig` 类型。恢复旧的 halt 语义：LLM 返 error 即 `agent_end`，由上层（如 batch executor）决定如何重试。

## Vetta CLI v0.0.1

初始化成功

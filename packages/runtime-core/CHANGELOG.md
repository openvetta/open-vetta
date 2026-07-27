# Changelog

All notable changes to `@vetta/runtime-core` are documented in this file.

## [Unreleased]

### Added

- **Runtime Session Configuration Port**：新增统一的 `RuntimeSessionConfigurationController` 与旧 Session 适配器，由 Backend Assembly 显式交付 steering/follow-up 输入模式、插件运行时配置和 agent mode 命令；RuntimeHost 不再直接调用旧 AgentSession，并保留 turn 边界延迟应用、busy 跳过、插件失败恢复 pending 后重试及 settings 非空更新语义。
- **Runtime Session Work Management Port**：新增 `RuntimeSessionBackgroundWorkController`、`RuntimeSessionTodoController` 及保留完整 usage 的 runtime-owned subagent snapshot，由 Backend Assembly 显式交付；RuntimeHost 的后台 bash/subagent 列举、终止、联合清理和 todo 回放/受锁清空不再直接依赖旧 AgentSession/TodoStore，原返回值、复制和用户终止语义保持不变。
- **Runtime Session Execution / Workspace Port**：新增 `RuntimeSessionWorkspaceView` 与不暴露旧 custom tools 类型的 `RuntimeSessionExecutionController`，由 Backend Assembly 显式交付；RuntimeHost 的工作目录读取、执行忙碌态判断和在线模式重配置不再直接依赖旧 AgentSession/SessionManager，并保留目录自愈、全局切换预检、沙箱工具重建及不支持动态重配置时的错误行为。
- **Runtime Session Host Interaction**：新增不依赖 coding-agent UI 类型的 `RuntimeSessionHostInteractionContext` / `RuntimeSessionHostInteraction`，由 Backend Assembly 显式交付；RuntimeHost 的首次创建与同路径复用统一通过该 Port 绑定确认和沙箱授权能力，旧完整 `ExtensionUIContext` 仅由 Legacy Adapter 组装，原空实现和失败传播行为保持不变。
- **Runtime Session Model View**：新增不暴露可写 Registry 的 `RuntimeSessionModelView` 及旧 Session 适配器，由 Backend Assembly 显式交付；RuntimeHost 的图片能力判断、自动标题和输入预测不再直接读取旧 AgentSession model/modelRegistry，并保留当前模型优先、去重、三候选上限、凭证过滤、冷却和失败轮转行为。
- **Runtime Session Model Controller**：新增 `RuntimeSessionModelController` 及旧 Session 适配器，由 Backend Assembly 显式交付；RuntimeHost 的模型解析/切换、thinking level 和非共享 Registry 凭证刷新不再直接依赖旧 AgentSession，并保留 prompt `if-changed`、settings `always`、available-first/find-fallback 与切模后设置 reasoning 的原行为。
- **Runtime Session History Controller**：新增 `RuntimeSessionHistoryController` 及旧 Session 行为适配器，由 Backend Assembly 显式交付；RuntimeHost 的消息编辑、分支切换/删除、替换、fork 和在线会话命名不再直接编排旧 AgentSession/SessionManager，忙碌态、错误和上下文同步语义保持不变。
- **Runtime Session 身份、生命周期与历史读取 Port**：新增 `RuntimeSessionIdentityLifecycle`、`RuntimeSessionHistoryReader` 及旧 Session 适配器，并由 Backend Assembly 显式交付；RuntimeHost 的 sessionId/path/dispose 与完整历史读取不再直接依赖旧 AgentSession，行为保持不变。
- **Runtime Session Backend Assembly**：新增显式交付旧外围句柄与 Core Ports 的 `RuntimeHostSessionAssembly` / Backend 合同；RuntimeHost 不再自行创建 Legacy Ports，原 create-only Backend 通过独立兼容适配器继续工作。
- **Runtime Session 基础能力 Port**：新增独立 Turn Control、Event Stream 与 State Reader 合同及旧 Session 适配器；RuntimeHost 的 prompt/continue/abort、事件订阅和状态读取不再直接依赖旧 AgentSession，外围能力和生产行为保持不变。
- **显式 Session Resume 与未完成 Turn 恢复**：新增 `resumeAgentSession`、`ConversationRecoveryPolicy` 和 Greenfield Backend resume 路径；唯一未闭合 Turn 通过乐观版本追加稳定的 `turn_interrupted` 终态，非法事件序列 fail closed，且不重放模型、工具或进程内输入队列。
- **Greenfield Session Backend 与 Continue Turn**：新增显式并行的 Greenfield 后端、必需 Prompt Adapter、Kernel Runtime Factory、SessionEvent 订阅和 Repository 状态查询；Kernel 支持不追加伪用户消息的 continue Turn。默认 RuntimeHost 仍使用旧后端。
- **Greenfield Session 活动 Turn 输入队列**：新增独立 steer/follow-up 队列、逐条/全量消费模式和窄化 `TurnInputQueue` 合同；Agent Core 在既有模型循环边界消费输入，取消或错误保留未消费队列，关闭 Session 时释放队列。
- **独立 Session 观察事件与 Greenfield 宿主适配**：新增不依赖旧 `AgentSessionEvent` 的 `RuntimeSessionObservationEvent`；Agent Core Turn Engine 输出生命周期、文本/思考增量和工具生命周期，Turn Pipeline 以非持久化 envelope 发布，旧事件与 Greenfield Kernel Event 最终统一适配到现有 `SessionEvent`。
- **RuntimeHost 会话后端创建边界**：新增可注入的 `RuntimeSessionBackend` 与默认 `LegacyCodingAgentSessionBackend`；生产默认行为保持不变，为后续 Greenfield Session Backend 并行接入建立组合根切换点。
- **Capability Binding 与结构化 Tool Error**：新增按 `sourceId + capabilityId + revision` 标识模型所见能力的稳定绑定，以及从 Runtime Tool 到 Agent Tool Result 的结构化错误桥接。
- **Model Call Frame**：新增动态贡献合同与调用级 Frame 解析；Feature 实例保持长生命周期，而提示词和工具在每次模型调用前重新物化。
- **Agent Core Turn Engine Adapter**：新增 `AgentCoreTurnEngine`，将不可变 Runtime Snapshot、标准消息、模型流、Tool Loop、Tool Policy 和取消信号映射到 `@vetta/agent-core`；Runtime Tool 合同补充可取消执行、进度和阶段回报。
- **引用计数 Runtime Snapshot Provider**：新增 `AtomicRuntimeSnapshotProvider` 和 acquire/release lease；Snapshot 热更新只影响后续 Turn，retired Feature 资源在所有活动 Turn 释放后再 dispose。
- **隔离的 Greenfield Kernel 入口**：新增 `@vetta/runtime-core/kernel`，提供 Session 状态机、固定阶段 Typed Turn Pipeline、确定性 Feature Compiler、不可变 Runtime Snapshot 及存储、上下文和 Turn Engine Port；旧 `RuntimeHost` 生产入口保持不变。
- **`SubagentInfo` 增加 `queued` 状态、`todoProgress` 与 `title`**：透传 coding-agent 工作流子代理（ADR-0044）的排队状态、todo 进度与人类可读标题给宿主 UI。
- **顶层 `PromptRequest.promptRef` 与历史标记**：RuntimeHost 将结构化 Skill / Scene 引用透传给 coding-agent；历史转换从隐藏 expansion message 恢复 `prompt_ref_marker`，供宿主重载和编辑时重建选择状态，不把协议拼进用户正文。
- **Subagent 协议与宿主开关**：`SessionEvent` 增加 `subagents_update` / `SubagentInfo`；`RuntimeHost` 在 `conversation`/`project`/`cli` 场景启用 `enableSubagents`；`listSubagents` / `interruptSubagent` 供 UI 重放与中断。
- **`clearFinishedBackgroundTasks` 同时清理终端态子代理**：活动面板「清除已结束」一条 IPC 清 bash 已结束任务 + completed/failed/interrupted 子代理。
- **`RuntimeHost.killBackgroundTask`**：宿主可按 session/taskId 终止后台 bash 任务（`endedBy: user`），进程结束后 agent 收到用户手动终止的 task-notification。
- **RuntimeHost 固定 Skill 路径**：新增 `additionalSkillPaths`，创建会话和插件热重载时持续合并宿主提供的内置 Skill。
- **`AgentPluginRuntimeConfig.mcpServerContributions`**：插件作用域 MCP 贡献（`McpServerContribution` / `AgentPluginMcpServerConfig`），由 desktop 物化后交给 coding-agent `McpManager`（ADR-0040）。
- **Fork 血缘透出**：`SessionHistoryInfo` / `SessionStateSnapshot` 增加可选 `parentSessionPath` / `parentEntryId`；`listSessions` 与 `getState` 从 session header 透传，供桌面侧栏与来源跳转。

### Fixed

- **`RuntimeHost.prompt` 在开跑前确保 session cwd 存在**：desktop per-session 目录被删后 handle 仍存活时，mkdir 自愈，避免 bash/read 等工具报 Working directory does not exist。

### Changed

- **Runtime Tool 输入类型泛型化**：`RuntimeToolDefinition<TInput>` 与 `RuntimeToolExecutionRequest<TInput>` 可从 TypeBox Schema 保留具体工具参数类型；异构 Runtime Snapshot 边界仍统一擦除为只读对象合同。
- **Tool Schema 完整冻结**：Feature Compiler 发布 Snapshot 前深拷贝并递归冻结 Tool JSON Schema，避免嵌套 Schema 在 Turn 执行期间被外部修改。
- **图像工具生命周期归插件（ADR-0048）**：移除 `RuntimeHostOptions.imageBackend` 与 RuntimeHost 的内置 `generate_image` / `edit_image` 注入；图像插件改用动态插件工具注册，禁用插件即可完整移除能力。
- **`RuntimeHost` 按职责拆分到 `src/runtime-host/`**：原 ~1.7k 行单文件拆为 `runtime-host`（会话编排）、`session-events`（事件映射）、`history`（历史/分支）、`peripheral-tasks`（自动标题/输入预测）、`plugin-debug`、`types`；包根 `index.ts` 从目录入口导出，对外 API 不变。
- **周边任务自动选模 + 失败轮转**：`autoTitleSession` / `nextPromptSuggestions` 不再依赖用户配置的「全局/周边模型」。改为优先使用当前会话模型，再从 `ModelRegistry.getAvailable()` 补足候选（最多 3 个）；调用失败或无可用结果时进程内冷却该模型并轮转下一个。无可用凭证时静默跳过。
- **`autoTitleSession` 日志增加 `durationMs`**：单次候选模型调用的 LLM 耗时写入成功/失败日志，便于对照 thinking 体量排查慢标题。

### Added

- **消息编辑 / 分支切换 API**：`HistoryEntry` 消息项携带 `entryId`/`parentId`/`branch`（user sibling）；`navigateForEdit` / `switchBranch` / `forkSession` 贯通 SessionFacade 与 RuntimeHost，供桌面端历史重编辑与同 session 分叉。`branch` 聚合跳过 skill 等透明节点，使编辑后的多版本能显示 `‹ i/n ›`。
- **HistoryEntry `settings_assist_marker`**：`entriesToHistory` 将 coding-agent 的 `custom_message`（`customType: settings_assist_instruction`）映射为 UI 标记（含可选 `tabId`），供 desktop 历史回放时显示「MCP配置协助」等页面对应徽章；不进入 LLM 上下文。
- `SessionHistoryInfo` 新增可选字段 `lastMessagePreview?: string`：`RuntimeHost.listSessions()` 把 coding-agent `SessionInfo.lastMessagePreview`（最后一条用户/助手消息的截断预览）透传给宿主，供桌面快捷面板「最近会话」列表展示会话末条预览。字段可选，既有调用方无需改动。

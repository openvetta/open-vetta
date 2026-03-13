# Electron 客户端与 CLI 统一赋能架构规范（方案一）

## 1. 文档目的

本文档定义在现有 monorepo 中新增自研 Electron 客户端的生产级架构规范，目标是让基础设施能力一次建设，同时赋能 CLI 与 Desktop 两个入口。

该方案不依赖 `pi-web-ui`，采用共享 Runtime + 双适配层架构。

## 2. 目标与非目标

### 2.1 目标

1. 统一核心能力：Agent Loop、Tool Registry、MCP Host、Session、配置、权限策略、模型与鉴权。
2. CLI 与 Desktop 共享同一套 Runtime 能力和行为语义。
3. 保持可扩展性：后续新增工具、MCP 协议能力、会话能力时，无需分别改两端。
4. 满足生产运行要求：稳定性、安全性、可观测性、可回滚。

### 2.2 非目标

1. 本阶段不进行 UI 视觉规范设计。
2. 本阶段不引入远程多租户服务端架构（仅本地应用形态）。
3. 本阶段不改变模型供应商集成策略（沿用现有 provider 基座）。

## 3. 总体架构

## 3.1 架构原则

1. Core-first：Runtime 为唯一核心业务域。
2. Adapter-only UI：CLI/Electron 仅做交互与平台适配，不承载业务规则。
3. Typed contracts：跨层通信必须有稳定类型契约与错误码。
4. Fail-safe：任何外设能力（工具、MCP、文件系统）失败，不应导致主会话状态不可恢复。

## 3.2 逻辑分层

1. `packages/runtime-core`
职责：Agent 编排、状态机、会话生命周期、策略调度、通用事件模型。

2. `packages/runtime-tools`
职责：内置工具注册、参数校验、执行生命周期、超时/取消、结果规范化。

3. `packages/runtime-mcp`
职责：MCP server 连接管理、能力发现、调用路由、健康检查、重连与降级。

4. `packages/runtime-storage`
职责：会话、设置、缓存、凭据引用（不含明文）等存储抽象。

5. `packages/runtime-telemetry`
职责：日志、指标、追踪事件定义与上报接口。

6. `packages/cli-app`
职责：命令行参数解析、TUI 渲染、键位与交互适配。

7. `packages/desktop-app`
职责：Electron Main/Preload/Renderer、窗口管理、IPC 桥接、桌面能力封装。

## 3.3 数据与事件流

1. 用户输入从 CLI 或 Renderer 进入 Adapter。
2. Adapter 调用 Runtime `SessionFacade` 发起 prompt/continue/abort。
3. Runtime 发出标准流式事件（message/tool/mcp/usage/error/state）。
4. Adapter 仅负责渲染与交互反馈，不直接操作底层工具执行逻辑。

## 4. 目录与包边界

建议新增与调整如下：

1. `packages/runtime-core`
2. `packages/runtime-tools`
3. `packages/runtime-mcp`
4. `packages/runtime-storage`
5. `packages/runtime-telemetry`
6. `packages/desktop-app`
7. `packages/cli-app`（或在 `packages/coding-agent` 内先落地 `src/adapters/cli`）

边界规则：

1. `desktop-app` 与 `cli-app` 不得直接依赖彼此。
2. `runtime-*` 之间仅允许自上而下依赖，禁止环依赖。
3. Tool/MCP 实现不直接访问 UI 层对象。
4. 所有跨包公共类型统一从 `runtime-core/contracts` 导出。

## 5. 核心契约规范

## 5.1 Session Facade

统一暴露接口（示意）：

1. `createSession(config)`
2. `prompt(sessionId, message)`
3. `continue(sessionId)`
4. `abort(sessionId)`
5. `subscribe(sessionId, handler)`
6. `updateSettings(sessionId, partialSettings)`

语义要求：

1. `abort` 必须幂等。
2. `prompt` 在 session busy 时按统一队列策略处理。
3. 所有错误返回标准错误结构（含 code、retryable、origin）。

## 5.2 事件模型

统一事件大类：

1. `session.lifecycle`
2. `message.delta`
3. `message.final`
4. `tool.start`
5. `tool.update`
6. `tool.end`
7. `mcp.status`
8. `usage.update`
9. `error`

事件要求：

1. 具备 `sessionId`、`eventId`、`timestamp`、`source`。
2. 支持回放（至少关键状态事件可重建 UI）。
3. 版本化：事件结构改动需要 schema version。

## 5.3 工具执行契约

1. 入参强校验（TypeBox/Zod 二选一，建议与现有体系一致）。
2. 执行支持 `AbortSignal`。
3. 必须声明 `timeoutMs` 与 `concurrencyPolicy`。
4. 错误必须结构化，禁止仅返回字符串。

## 6. Electron 进程模型

1. Main 进程：持有 Runtime 实例（唯一可信执行域）。
2. Preload：最小暴露 IPC API（白名单方法）。
3. Renderer：纯 UI + 状态渲染，不直接访问 Node API。

安全规则：

1. `contextIsolation: true`
2. `nodeIntegration: false`
3. 禁止 Renderer 直接调用危险系统能力。
4. 所有 IPC 请求需参数校验和来源校验。

## 7. 配置与凭据策略

1. 配置分层：默认配置 < 全局配置 < 项目配置 < 会话覆盖。
2. 凭据存储：优先系统 Keychain；降级时本地加密存储。
3. Runtime 仅接收凭据引用或 provider 回调，不在日志中输出敏感信息。

## 8. 可靠性设计

1. 超时控制：LLM 调用、工具调用、MCP 调用均独立超时。
2. 重试策略：仅对可判定临时错误重试，指数退避。
3. 熔断机制：单工具或单 MCP server 连续失败触发熔断并通告 UI。
4. 崩溃恢复：会话与关键状态可恢复，未完成执行标记为 aborted/unknown。
5. 资源保护：最大并发、最大 token、最大输出字节数、防止 UI 卡死。

## 9. 可观测性与运维

1. 结构化日志：包含 requestId/sessionId/toolCallId。
2. 指标：成功率、失败率、P95 时延、MCP 连接稳定性、工具超时率。
3. 追踪：关键链路（prompt -> tool -> mcp -> response）可串联。
4. 诊断包：支持导出脱敏诊断信息用于问题排查。

## 10. 测试策略

1. 单元测试：核心状态机、事件序列、工具执行器、MCP 管理器。
2. 合约测试：CLI Adapter 与 Desktop Adapter 共享同一契约测试集。
3. 集成测试：真实文件工具、MCP mock server、中断恢复。
4. E2E：CLI 与 Desktop 关键用户路径一致性验证。

## 11. 兼容与迁移策略

1. 以增量迁移替代一次性重写。
2. 先建立 Runtime 抽象层，再逐步替换 CLI 现有内部调用路径。
3. 迁移期间保留兼容入口，避免阻塞现有用户。
4. 每个阶段提供 feature flag，支持灰度与回滚。

## 12. 发布与回滚要求

1. 任何 Runtime 核心变更必须先通过 CLI 回归。
2. Desktop 采用 Beta 通道灰度。
3. 出现 P0 稳定性问题时，优先回滚 Runtime 版本，不做热修补丁叠加。

## 13. 验收标准（DoD）

1. 同一条工具链路在 CLI 与 Desktop 的行为一致（输入、事件、错误）。
2. MCP server 生命周期管理一致，异常可恢复。
3. 关键链路可观测（日志+指标）完整。
4. 故障演练通过：超时、取消、崩溃恢复、配置错误、凭据失效。
5. 文档、测试、迁移说明齐全，可由新成员独立接手。

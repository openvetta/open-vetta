# 全面重写实施日志

本文件只记录已经实施并验证的事实。尚未实现的设计仍以本目录其他方案文档为准。

## 2026-07-26：Greenfield Kernel 第一纵向切片

### 目标

在不切换旧生产入口的前提下，建立不依赖 `coding-agent` 的新 Kernel 基础：

- Session 状态机。
- 固定阶段 Typed Turn Pipeline。
- Runtime Snapshot。
- Feature Compiler。
- 存储、上下文、Engine 和事件 Port。

### 修改范围

- 新增 `@vetta/runtime-core/kernel` 独立导出入口。
- 新增 `packages/runtime-core/src/kernel/`：
  - `contracts.ts`
  - `errors.ts`
  - `defaults.ts`
  - `agent-session.ts`
  - `turn-pipeline.ts`
  - `feature-compiler.ts`
  - `index.ts`
- 新增 `packages/runtime-core/test/kernel/`：
  - `turn-pipeline.test.ts`
  - `feature-compiler.test.ts`
- 扩展包边界守卫，禁止 `runtime-core/src/kernel` 导入 `@vetta/coding-agent`。
- 更新 `runtime-core` 包入口、README 和 CHANGELOG。

### 明确未修改

- 未修改旧 `RuntimeHost`、旧 `contracts.ts` 及现有生产调用链。
- 未切换 Desktop、CLI、RPC 或 IM。
- 未删除 `coding-agent` 旧代码。
- 未实现 `@vetta/agent-core` 的生产 Turn Engine Adapter。
- 未实现文件会话仓储、上下文摘要器、输入队列、steering 或事件 AsyncIterable。
- 未迁移 Tool、MCP、Skill、知识库和 Subagent。

### 新增或修改的合同

- `AgentSession`
  - 显式状态：idle、running、cancelling、closing、closed。
  - 同一 Session 只允许一个活动 Turn。
  - 支持 cancel 和活动 Turn 期间 close。
- `TurnPipeline`
  - 固定阶段：Admission、Snapshot Binding、Conversation Loading、Context Assembly、Context Preparation、Execution、Finalization。
  - Engine 必须产生唯一终止事件；缺失或终止后继续输出均视为协议错误。
  - Turn 开始、消息、压缩和终止状态通过 `ConversationRepository` 按版本追加。
- `ConversationRepository`
  - 使用会话领域合同和乐观版本，不暴露文件路径或数据库连接。
- `ContextStrategy` / `ContextProvider`
  - 通过 `AbortSignal` 接收取消。
  - 不直接访问 Session 或具体 Repository 实现。
- `FeatureCompiler`
  - 按依赖拓扑和稳定字符串顺序编译。
  - 检测 Feature、Tool、Instruction、Context Provider 和 Observer 冲突。
  - prepare / contribute 失败时逆序释放资源。
  - 编译结果使用冻结数组和无 mutation API 的只读 Map。
  - Snapshot lease dispose 幂等，并汇总释放失败。

### 数据兼容影响

- 无生产数据格式变化。
- 新 Repository 目前只有合同和测试内存实现。
- 旧 `RuntimeHost` 仍使用原会话存储。

### 测试

- `packages/runtime-core`
  - `bunx vitest --run test/kernel/turn-pipeline.test.ts test/kernel/feature-compiler.test.ts`
  - 2 个测试文件、12 个测试通过。
- 质量守卫
  - `bunx vitest --run scripts/quality/quality-gates.test.mjs`
  - 20 个测试通过。
- 包级类型检查
  - `bunx tsgo --noEmit -p tsconfig.build.json`
  - 通过。
- `bun run check:quick`
  - 本次变更的 Biome、私钥、冲突标记和包边界检查通过。
  - 整体命令因既有 Capability Catalog 文档过期而失败。
- `bun run check`
  - 全量 TypeScript 检查通过。
  - 整体命令因两个非本次变更问题失败：
    - Capability Catalog 文档过期。
    - `packages/admin/src/routeTree.gen.ts` 不符合当前 Biome 格式。

### 结果

- 新 Kernel 已能独立执行 Fake Engine 驱动的完整 Turn。
- Session 并发、取消、关闭、Pipeline 顺序、持久化终止和 Engine 协议错误已有自动测试。
- Feature Compiler 的确定性、冲突、失败回滚、只读 Snapshot 和 dispose 已有自动测试。
- 新 Kernel 源码没有导入 `@vetta/coding-agent`，并由质量守卫持续约束。
- 旧生产入口未受影响。

### 未解决问题

- `runtime-core` 包级依赖中仍存在旧 `@vetta/coding-agent`，因为旧 `RuntimeHost` 尚未迁移。
- 新 Kernel 还没有真实 `@vetta/agent-core` Adapter。
- `ConversationRepository` 还没有位于 `runtime-storage` 的生产实现。
- 当前 `AgentSession.send()` 对并发输入采用拒绝策略，输入队列和 steering 需在后续合同中实现。
- Snapshot 尚未支持后台编译后在 Turn 边界原子交换。
- 标准事件还没有转换成宿主使用的 AsyncIterable Session Event Stream。

### 下一步

1. 在 `runtime-storage` 实现版本化 Conversation Repository 和恢复测试。
2. 实现 `@vetta/agent-core` Turn Engine Adapter。
3. 增加 Runtime Snapshot 原子 Provider，验证当前 Turn 不受热更新影响。
4. 再迁移 Coding Tools Feature，不提前接入 MCP、Skill 和知识库。

## 2026-07-26：Snapshot Lease 与文件会话仓储

### 目标

补齐第一轮实现中的两个生命周期缺口：

- Runtime Snapshot 热更新不能提前释放当前 Turn 仍在使用的 Feature 资源。
- `ConversationRepository` 不能只停留在接口和测试 Fake，需要由 `runtime-storage` 提供生产文件实现。

### 修改范围

- 将 `RuntimeSnapshotProvider` 从 `getCurrent()` 改为 `acquire()`：
  - 返回 `RuntimeSnapshotLease`。
  - Turn Pipeline 在 Finalization 或异常退出后统一 release。
- 新增 `AtomicRuntimeSnapshotProvider`：
  - 原子发布新 Snapshot。
  - 使用引用计数延迟释放 retired Snapshot。
  - close 等待活动 Turn 释放 lease。
- 新增 `@vetta/runtime-storage/conversation`：
  - `FileConversationRepository`。
  - 稳定存储错误码。
  - 版本化 JSONL 会话事件。
  - 原子 Snapshot 文件写入。
- 更新 root TypeScript path map，显式解析 `@vetta/runtime-core/kernel`。
- 扩展包边界守卫，禁止 `runtime-storage/src/conversation` 导入 `@vetta/coding-agent`。

### 明确未修改

- 未切换旧 `RuntimeHost` 使用新 Repository。
- 未迁移旧 JSONL 会话格式。
- 未实现跨进程文件锁。
- 未实现 Snapshot 读取、选择和自动恢复。
- 未实现真实 `@vetta/agent-core` Adapter。
- 未迁移 Coding Tools、MCP、Skill、知识库或 Subagent。

### 新增或修改的合同

- `RuntimeSnapshotProvider.acquire()`
  - 每个 Turn 获得独立且幂等 release 的 lease。
  - 当前 Turn 始终持有开始时绑定的 Snapshot。
- `AtomicRuntimeSnapshotProvider.swap()`
  - 新 Turn 立即获得新 Snapshot。
  - 旧 Snapshot 只有在所有活动 lease 释放后才 dispose。
  - Provider close 后拒绝 acquire，并释放被拒绝的 swap 输入。
- `FileConversationRepository`
  - Session ID 使用 base64url 文件名，不能形成目录穿越。
  - Header 和 Event Record 均带显式 schema version。
  - Event sequence 必须连续。
  - append 使用 expected version 做乐观并发控制。
  - 同一 Repository 实例内，同 Session 写入串行化。
  - Snapshot 只允许保存当前 conversation version。
  - 临时文件写完后 rename 发布 Snapshot，失败时删除临时文件。
  - 不完整 JSONL 尾记录、错误 sequence 和未知事件均视为损坏，不静默忽略。

### 数据兼容影响

- 新格式与旧 `coding-agent` SessionManager 格式隔离，尚未用于生产数据。
- Conversation 文件格式版本为 1。
- 当前只实现新格式读写；旧格式 importer 仍待实现。
- 包根旧 Auth、SessionManager 和 Settings 导出保持不变。

### 测试

- `packages/runtime-core`
  - `bun run test`
  - 3 个测试文件、17 个测试通过。
- `packages/runtime-storage`
  - `bun run test`
  - 1 个测试文件、7 个测试通过。
- 质量守卫
  - `bunx vitest --run scripts/quality/quality-gates.test.mjs`
  - 20 个测试通过。
- Root TypeScript
  - `bunx tsgo --noEmit -p tsconfig.json`
  - 通过。
- `bun run check:quick`
  - 通过。
- `bun run check`
  - Biome、monorepo tsgo、Desktop tsc 和全部 guards 通过。

### 结果

- Snapshot 热更新不会再提前 dispose 当前 Turn 的 Feature 资源。
- Turn Pipeline 在完成、失败和取消路径都会尝试 release Snapshot lease。
- `runtime-storage` 已开始真正拥有新 Kernel 的会话持久化实现，而不是只 re-export `coding-agent`。
- 文件仓储的持久化重开、并发版本冲突、错误 Session、Snapshot 版本和损坏尾记录已有自动测试。
- 新增 Kernel 与 Conversation 源码均没有导入 `@vetta/coding-agent`。

### 未解决问题

- `FileConversationRepository` 当前只保证单 Repository 实例内串行写入，跨进程写入需要独立锁协议。
- Snapshot 目前写入但没有读取和恢复策略。
- 旧会话格式还没有只读 importer。
- 旧 `runtime-storage` 包根仍依赖 `@vetta/coding-agent` 以维持兼容导出。
- 没有真实 Turn Engine 时，新 Kernel 仍只通过 Fake Engine 执行。

### 下一步

1. 实现 `@vetta/agent-core` Turn Engine Adapter，并用录制模型流验证标准消息映射。
2. 为新会话格式实现 Snapshot 加载和旧格式只读 importer。
3. 设计跨进程会话 owner/lock 合同，不在 Repository 内静默覆盖冲突。
4. 在真实 Engine 闭环通过后迁移 Coding Tools Feature。

## 2026-07-26：Agent Core Turn Engine Adapter

### 目标

让新 Kernel 的 Execution 阶段使用现有 `@vetta/agent-core` 模型与 Tool Loop，同时保持依赖方向和运行快照边界：

- `runtime-core -> agent-core -> ai`。
- `agent-core` 不知道 Session、Repository、Feature 或 Coding 产品。
- 模型和 Stream 实现由组合根注入。
- 工具权限、执行和取消仍属于 Runtime 合同。

### 分析结论

原 `RuntimeToolDefinition` 只有名称、描述和 Schema，无法执行真实 Tool，也没有统一位置执行 `ToolPolicy`。直接把 `AgentTool` 放进 Snapshot 会让 Kernel 合同绑定 `agent-core` 的工具类型。

本轮采用的边界是：

```text
RuntimeToolDefinition（中立合同）
-> AgentCoreTurnEngine（唯一适配点）
-> AgentTool（agent-core 内部合同）
```

Runtime Tool 自身提供执行函数，但不依赖具体 Tool 实现、MCP SDK 或 Coding Session。适配器在调用执行函数前统一执行 Snapshot 的 `ToolPolicy`。

### 修改范围

- 新增 `AgentCoreTurnEngine`：
  - 使用 `agentLoopContinue()`，因为 Turn Pipeline 已经完成输入消息组装。
  - 将 Snapshot Instruction 按确定顺序组合成 System Prompt。
  - 将准备后的标准消息复制到 agent-core Context。
  - 将 Runtime Tool 转换为 Agent Tool。
  - 只把完成的 Assistant 和 Tool Result 映射为 `TurnEngineEvent.message`。
  - 从最后一条 Assistant 消息映射唯一 `completed` 终止事件。
  - 透传 Session ID、模型 Stream 参数、动态 API Key 和取消信号。
- 扩展 Runtime Tool 合同：
  - `label`。
  - `execute()`。
  - Session、Turn 和 Tool Call 标识。
  - `AbortSignal`。
  - 进度与阶段回报。
- Feature Compiler 对 Tool JSON Schema 改为深拷贝并递归冻结。
- 新增架构守卫：
  - `agent-core` 禁止导入 `runtime-core`。
  - `agent-core` 禁止导入 `coding-agent`。

### Tool 执行语义

```text
模型产生 Tool Call
-> agent-core 校验参数
-> AgentCoreTurnEngine 调用 ToolPolicy.authorize
-> 允许：调用 RuntimeToolDefinition.execute
-> 拒绝或执行抛错：agent-core 生成 isError Tool Result
-> Tool Result 进入下一次模型调用
```

Policy 拒绝不会调用工具实现，也不会直接中断整个 Tool Loop；模型能看到标准错误 Tool Result 并决定如何继续。

### 明确未修改

- 未切换旧 `RuntimeHost`、Desktop、CLI、RPC 或 IM。
- 未迁移旧 Coding Tools。
- 未启用 steering、follow-up 或输入队列。
- 未把流式 text/thinking delta 加入 Kernel 事实事件。
- 未改变旧 `@vetta/agent-core` 的 API 或 Tool Loop。
- 未把 Model Registry 或具体 Provider 放进 Runtime Snapshot。

### 测试

- `packages/runtime-core`
  - `bun run test`
  - 4 个测试文件、21 个测试通过。
- `AgentCoreTurnEngine`
  - Runtime Instruction、消息和 Stream 参数映射。
  - 两次录制模型流驱动的真实 Tool Loop。
  - Tool Policy 请求和 Runtime Tool 执行。
  - Policy 拒绝不调用工具实现，并产生错误 Tool Result。
  - AbortSignal 透传及 aborted 终止映射。
- 质量守卫
  - `bunx vitest --run scripts/quality/quality-gates.test.mjs`
  - 21 个测试通过。
- 包级类型检查
  - `bunx tsgo --noEmit -p tsconfig.build.json`
  - 通过。
- `bun run check:quick`
  - Biome、私钥、冲突标记和包边界检查通过。
- `bun run check`
  - Biome、monorepo tsgo、Desktop tsc 和全部 guards 通过。

### 结果

- 新 Kernel 已不再只依赖 Fake Engine，可以使用现有 agent-core 执行录制模型流和真实 Tool Loop。
- Tool Policy 只有一个执行入口，不需要 Coding Tool、MCP Tool 分别实现权限检查。
- Runtime Tool 不依赖 `agent-core` 类型，后续 Coding、MCP 和 Plugin Tool 可以实现同一合同。
- Tool Schema 的嵌套对象和数组不能在 Snapshot 发布后被外部修改。
- `agent-core` 与 Runtime/Product 的反向依赖由自动守卫阻止。

### 未解决问题

- Kernel 事件目前只承载完成消息，尚未定义流式 UI Observation Event。
- 当前 Engine 实例绑定一个模型；多模型选择应由组合根创建对应 Engine，不能重新引入全局 Model Registry。
- Tool progress 和 phase 已能进入 agent-core，但 Kernel 尚未向 Host 暴露对应观察事件。
- 旧生产 RuntimeHost 仍未使用新 Pipeline。

### 下一步

1. 在 `runtime-tools` 建立第一个不依赖 `coding-agent` 的 Coding Tools Feature，并通过真实 Engine 合同测试。
2. 为 Conversation Repository 增加 Snapshot 加载与恢复。
3. 实现旧会话格式只读 importer。
4. 再设计跨进程会话 owner/lock 合同。

## 2026-07-26：运行时 Schema 边界

### 目标

明确 TypeScript 静态类型与运行时数据校验的边界，并修复 Conversation JSONL 只做浅层手写判断的问题。

### 分析结论

- Tool 参数需要向模型暴露 JSON Schema，现有 `ai` 和 `agent-core` 已使用 TypeBox/AJV，因此继续使用 TypeBox。
- Conversation 文件来自磁盘，属于不可信输入；仅检查 `message.role` 是字符串、`stopReason` 是字符串不足以构造可靠领域对象。
- Zod 在仓库的 UI、CLI 和部分生态适配器中已有使用，但新 Kernel 没有 preprocess、transform 或 Zod 生态互操作需求。
- 在底层同时维护 TypeBox 与 Zod 会制造重复 Schema 和错误映射，因此本轮不向 Kernel/Storage 引入 Zod。

最终规则：

```text
模型 Tool / MCP / 持久化协议 -> TypeBox / JSON Schema
Host 表单和复杂配置转换      -> 确有转换需求时可使用 Zod
通过边界后的 Kernel 内部对象 -> TypeScript 合同
```

### 修改范围

- `runtime-storage` 增加 TypeBox 直接依赖。
- 新增 `record-schema.ts`，定义：
  - User、Assistant、Tool Result Message。
  - Text、Image、Thinking 和 Tool Call Content。
  - Usage、Cost 和 StopReason。
  - 六类 Stored Session Event。
  - Conversation Header、Event Record 和 Snapshot。
- `FileConversationRepository`：
  - append 前校验完整 Event 结构。
  - saveSnapshot 前校验完整 Snapshot 结构。
  - load 时使用完整 Record Schema 替换浅层手写 type guard。
  - 保留 Session ID、sequence 和 optimistic version 的显式领域校验。

### 错误语义

- 调用方提交非法 Event 或 Snapshot：`conversation_invalid_event`。
- 文件包含合法 JSON、但不符合版本化领域 Schema：`conversation_corrupt`。
- Schema 校验不替代 Session ID、事件顺序和版本冲突检查。

### 数据兼容影响

- Conversation schema version 仍为 1，写入格式没有改变。
- 过去能够被浅层校验错误接受的非法记录现在会明确报损坏。
- Schema 使用 `additionalProperties: false`；格式新增字段时必须显式更新 Schema，并按兼容性决定是否提升 schema version。
- 旧生产会话格式仍未接入新 Repository。

### 测试

- `packages/runtime-storage`
  - `bun run test`
  - 1 个测试文件、9 个测试通过。
- 新增验证：
  - Repository 写入边界拒绝非法 Message role，且不改变 conversation version。
  - JSONL 中 StopReason 非法时，即使 JSON 与基础 Record 字段完整，仍判定为 corrupt。
- `bun run check:quick`
  - Biome、私钥、冲突标记和包边界检查通过。
- `bun run check`
  - Biome、monorepo tsgo、Desktop tsc 和全部 guards 通过。

### 结果

- 新会话存储不再把浅层结构检查当作领域校验。
- Tool 和持久化边界统一使用 JSON Schema 语义，避免为 Kernel 引入第二套等价 Schema。
- Zod 的适用范围被限制在确实需要解析转换的宿主边界，而不是作为默认依赖扩散。

### 下一步

1. Snapshot 加载与旧格式 importer 必须复用相同的 Schema-first 边界。
2. 新 Coding Tools 使用 TypeBox 定义参数，并由 AgentCoreTurnEngine/agent-core 统一校验。
3. RPC Adapter 重写时为 wire payload 建立独立版本化 Schema，不能直接信任 TypeScript DTO。

## 2026-07-26：第一个独立 Coding Tools Feature

### 目标

让 `runtime-tools` 开始真正拥有工具实现，而不是继续永久转发 `coding-agent`，并用一个完整纵向切片验证：

```text
TypeBox Schema
-> CodingToolsFeature
-> FeatureCompiler
-> RuntimeSnapshot
-> AgentCoreTurnEngine
-> agent-core 参数校验与 Tool Loop
-> 标准 Tool Result
```

### 迁移选择

首个工具选择 `current_time`，原因是：

- 没有文件写入、进程启动或权限副作用。
- 可以注入确定性时间源，验证 Feature 和 Tool 隔离。
- 可以直接对比旧新 Tool Schema、模型描述和执行结果。
- 不需要提前复制旧 `read` 的图片处理、锚点、截断和模糊路径规则。
- 不需要在 Workspace Path Policy 尚未冻结时迁移 `write`。

这只是架构纵向切片，不代表 `current_time` 比 read、edit 或 process 更重要。

### 修改范围

- 新增 `@vetta/runtime-tools/coding` 子入口：
  - `tools/current-time/current-time-tool.ts`
  - `tools/current-time/description.ts`
  - `tools/current-time/index.ts`
  - `coding-tools-feature.ts`
  - `index.ts`
- 新增 `createCurrentTimeTool()`：
  - TypeBox 输入 Schema。
  - `Static<typeof Schema>` 静态输入类型。
  - 可注入 `now()`，默认使用系统时间。
  - 保持旧工具在直接调用时的执行语义。
- 新增 `createCodingToolsFeature()`：
  - Feature ID 为 `coding-tools`。
  - prepare 和 contribute 均传播取消。
  - 当前只贡献 `current_time`。
- `RuntimeToolDefinition<TInput>` 和 `RuntimeToolExecutionRequest<TInput>` 增加输入泛型。
- 新增包边界守卫，禁止 `runtime-tools/src/coding` 导入 `coding-agent`。
- 包根旧工具转发保持不变，避免提前切换生产调用方。

### 类型与校验

- 工具工厂返回 `RuntimeToolDefinition<CurrentTimeToolInput>`。
- 工具实现直接获得 TypeBox 推导的输入类型，不使用 `any` 或手写断言。
- Feature Compiler 在异构 Snapshot 边界将具体输入类型统一为 Runtime Tool 合同。
- AgentCoreTurnEngine 将 JSON Schema 交给 agent-core/AJV，且不额外收紧旧 Tool Schema。

### 明确未修改

- 未迁移 read、write、edit、search、bash 或 process。
- 未删除 `runtime-tools` 包根对 `coding-agent` 的兼容依赖。
- 未切换 Coding Profile、RuntimeHost、Desktop、CLI、RPC 或 IM。
- 未定义 Workspace Path Policy 或文件系统 Capability。
- 未复制旧工具的场景 scope、知识库和 Skill 目录规则。

### 测试

- `packages/runtime-tools`
  - `bun run test`
  - 2 个测试文件、5 个测试通过。
- 覆盖：
  - 注入时间源后的确定性结果。
  - 已取消 Signal 下直接调用仍保持旧执行结果。
  - Feature Compiler 到真实 agent-core Tool Loop 的完整执行。
  - 旧新 name、label、完整描述、Schema、content 和 details 差分一致。
  - 额外模型参数保持旧 Schema 的宽容度。
- `packages/runtime-core`
  - `bun run test`
  - 4 个测试文件、21 个测试通过。
- 质量守卫
  - `bunx vitest --run scripts/quality/quality-gates.test.mjs`
  - 21 个测试通过。
- Root TypeScript
  - `bunx tsgo --noEmit -p tsconfig.json`
  - 通过。
- `bun run check:quick`
  - 本次变更的 Biome、私钥、冲突标记和包边界检查通过。
- `bun run check`
  - Biome、monorepo tsgo、Desktop tsc 和全部 guards 通过。

### 结果

- `runtime-tools` 已拥有第一份完全不依赖 `coding-agent` 的工具源码。
- Runtime Tool 的 TypeBox Schema、静态输入类型和运行时参数校验形成单一来源。
- Feature 只贡献工具，不持有 Session、不决定 Policy、不访问模型。
- 新旧工具可以在迁移期并行存在，生产入口未受影响。

### 下一步

1. 先为 read 建立覆盖完整旧行为的差分合同。
2. 在保留路径、编码、图片、锚点和截断语义的前提下拆分 Read Operations。
3. read 完整差分通过后，再迁移 ls / grep 和 write / edit。
4. 每个工具同时运行旧实现、新 Feature 和 AgentCoreTurnEngine 合同测试。

## 2026-07-26：行为兼容性纠偏

### 问题

准备迁移 read 时，最初实现把旧 read 缩减成“工作区内纯文本读取”，并改变了路径、编码、
图片、二进制、锚点、Schema 和输出 details。该方向把功能重构夹带进架构重写，不符合
“保留外部行为，只替换内部结构”的迁移目标。

同时复查第一个 `current_time` Runtime Tool，发现首次实现也改变了：

- 完整模型可见描述。
- JSON Schema 对额外字段的宽容度。
- 已取消 Signal 下直接执行工具的行为。

### 处理

- 撤下不兼容的 read Runtime Tool、Workspace-only Path Policy 和相关导出。
- read 重新标记为“未迁移”，旧生产工具保持不变。
- 恢复 `current_time` 的旧描述、旧 Schema 和旧直接执行语义。
- 新增旧新差分测试，直接比较 current_time 的定义与固定时间执行结果。
- 将工具调整为独立 `tools/current-time/` 目录，模型描述放在 `description.ts`。
- 旧实现使用 `description.txt` 再在构建期生成 TS；新实现直接使用 TS 常量，避免重复生成链路，
  差分测试保证最终描述文本不变。
- 新增行为兼容性审计文档，逐项记录已实施模块的切换阻断差距。
- 测试策略增加强制差分 Gate：同名能力必须同时运行旧新合同测试。
- runtime-tools 开发规则增加“架构调整不能缩减功能”的约束。

### 审计结果

- `current_time`：工具定义和执行结果已兼容；Profile scope/category 尚未迁移。
- read：未迁移，必须保留绝对路径、`~`、模糊路径、GB18030、图片、二进制提示、锚点、
  截断 details 和完整模型描述。
- AgentSession：活动 Turn 输入仍采用拒绝策略，尚未兼容旧 queue/follow-up/steering。
- AgentCoreTurnEngine：尚未向 Kernel/Host 输出完整流式观察事件。
- Conversation Repository：旧格式 importer、Snapshot 加载、分支和恢复尚未完成。
- Context Strategy：旧 compaction 行为尚未迁移。
- MCP、Skill、Knowledge、Subagent 和各宿主 Adapter 尚未迁移。

这些差距没有影响当前生产入口，因为生产仍使用旧实现；但全部属于切换阻断项。

### 测试

- `packages/runtime-tools`
  - `bun run test`
  - 2 个测试文件、5 个测试通过。
- current_time 差分覆盖：
  - name、label、完整 description 和 TypeBox Schema。
  - 固定系统时间下的 content 与 details。
  - 额外模型参数的旧 Schema 宽容度。
  - 已取消 Signal 下直接调用的旧执行语义。
- `bun run check:quick`
  - Biome、私钥、冲突标记和包边界检查通过。
- `bun run check`
  - Biome、monorepo tsgo、Desktop tsc 和全部 guards 通过。

### 下一步

1. 把旧 read 行为用例整理成可复用的差分合同。
2. 同一组 fixture 同时运行旧 read 和新 read。
3. 只有文本、GB18030、图片、二进制、路径、锚点、截断、取消和自定义 Operations 全部
   等价后，才重新公开新 read。
4. 对 Session、事件和存储采用同样的旧新差分 Gate，不以“已有新实现”代替兼容验收。

## 2026-07-26：Coding Tool 注册边界与差分合同

### 目标

补齐 `current_time` 首个纵向切片尚未覆盖的注册语义，并把单工具手写对比改为后续工具可以
复用的差分合同：

- Tool 执行定义不绑定 Coding 场景。
- `scope_use` 和 `category` 由 Coding 能力注册层持有。
- 会话场景不与 Agent Profile ID 混用。
- 旧新定义、注册和执行通过同一观察合同对比。

### 修改范围

- 新增 `tool-registration.ts`：
  - `CodingToolScope` 和旧场景全集。
  - `CodingToolCategory`。
  - `CodingToolRegistration`。
  - 默认 `cli` 场景。
  - 按场景选择 Runtime Tool Definition 的纯函数。
- 在 `tools/current-time/` 新增 `registration.ts`：
  - 保留旧 `scope_use` 的七个场景。
  - 保留 `category: "core"`。
  - 注册对象与 `RuntimeToolDefinition` 分离。
- `createCodingToolsFeature()`：
  - 由组合根通过 options 传入会话场景。
  - 未传场景时保持旧系统的 `cli` fallback。
  - Agent Profile ID 不参与场景判断。
- 新增测试专用 Tool Compatibility Contract：
  - 比较模型可见定义和注册元数据。
  - 比较 fulfilled/rejected 结果。
  - 记录 update、phase 和已取消直接调用。
- `current_time` 差分测试改用统一合同。
- 对七个旧会话场景逐一比较旧 `resolveActiveToolNames` 和新选择器的最终工具集合。

### 明确未修改

- 未向通用 `RuntimeToolDefinition` 增加 `scope_use` 或 `category`。
- 未让 Kernel 认识 `im-claw`、`project`、`cli` 等 Coding 场景。
- 未迁移 read 或其他工具。
- 未切换生产 Profile、RuntimeHost、Desktop、CLI、RPC 或 IM。
- 未删除包根对旧 `coding-agent` 工具的兼容转发。

### 测试

- `packages/runtime-tools`
  - `bun run test`
  - 2 个测试文件、9 个测试通过。
- 新增覆盖：
  - `current_time` 的 scope 和 category 旧新一致。
  - 七个场景的最终激活集合旧新一致。
  - 注册元数据不会污染 Runtime Tool Definition。
  - 场景筛选可以排除不属于当前场景的注册。
  - 兼容合同同时比较正常执行和已取消直接执行。
- `bun run check:quick`
  - Biome、私钥、冲突标记和包边界检查通过。
- `bun run check`
  - Biome、monorepo tsgo、Desktop tsc 和全部 guards 通过。

### 结果

- `current_time` 的定义、执行和注册行为均已完成差分验证。
- Coding 场景属于能力编排层，不进入 Kernel，也不借用 Agent Profile ID。
- 新工具迁移可以复用相同差分观察合同，不再为每个工具重新手写定义和执行对比框架。
- 生产入口保持旧实现，不受本轮架构调整影响。

### 下一步

1. 从旧 read 测试提取共享 fixture，先让旧实现单独通过完整合同。
2. 扩展合同对文件环境和自定义 Read Operations 的观察，不在 Adapter 中归一化行为。
3. 在 `tools/read/` 实现新 read，生产源码不得导入旧 `coding-agent`。
4. 旧新 read 对文本、编码、图片、路径、锚点、截断、取消和错误全部一致后再加入 Feature。

## 2026-07-26：Read 参数化行为基线

### 目标

在实现新 read 之前，把旧工具的真实可观察行为提取为参数化合同，防止新架构只保留纯文本
happy path：

- 合同不绑定旧 AgentTool 调用签名。
- 旧实现先作为 Oracle 运行。
- 新实现完成后必须运行同一合同。
- 合同通过不等于新 read 已迁移。

### 修改范围

- 新增 `read-behavior-contract.ts`：
  - 定义中立的 Read Subject、Input、Options 和 Operations 测试接口。
  - 使用独立临时目录，不读取或修改生产会话数据。
  - 显式断言 read 的输出、错误、details、路径和 Operations 调用顺序。
- 新增 `read-legacy-contract.test.ts`：
  - 只在测试代码中适配旧 `createReadTool()`。
  - Adapter 只转换执行签名，不修改结果、错误或路径。
- 未新增 `src/coding/tools/read/`，避免在图片/WASM 语义尚未迁移时公开缩水实现。

### 合同覆盖

- 定义、Schema 关键字段、scope 和 category。
- UTF-8、GB18030、空文件和不存在文件。
- 相对、绝对、`~`、Unicode 空格及 CJK 空格模糊路径。
- macOS 窄空格、NFD、弯引号和 NFD + 弯引号组合。
- offset、limit、锚点行号、越界错误。
- 2000 行截断、50KB 首行截断、details 和 continuation notice。
- 图片魔数、默认 Photon 处理、关闭自动缩放、伪图片扩展。
- 已知扩展和无扩展二进制提示。
- 自定义 Read Operations 的路径与调用顺序。
- 已取消直接调用和执行中取消。

### 实施发现

- Windows 下旧 `~` 展开通过字符串拼接保留 `/`，会得到混合路径分隔符。合同记录真实结果，
  不在架构迁移中静默标准化。
- 一份旧 1×1 PNG fixture 可以通过魔数识别，但 Photon 无法解码。默认图片成功合同改用仓库
  中可被 Photon 解码的有效 PNG；“识别成功但处理失败”仍属于独立行为，不与成功路径混淆。
- read 的默认图片路径依赖 Photon/WASM。新实现不能只复制文件读取逻辑后宣称图片兼容。

### 明确未修改

- 未修改旧 read 源码或生产工具注册。
- 未实现或导出新 Runtime read。
- 未改变 TypeBox Schema、描述、路径、图片或取消行为。
- 未增加 runtime-tools 的 Photon/file-type 生产依赖。
- 未切换 RuntimeHost、Desktop、CLI、RPC 或 IM。

### 测试

- `packages/runtime-tools`
  - `bunx vitest --run test/coding/read/read-legacy-contract.test.ts`
  - 1 个测试文件、18 个测试通过。
  - `bun run test`
  - 3 个测试文件、27 个测试通过。
- `bun run check:quick`
  - Biome、私钥、冲突标记和包边界检查通过。
- `bun run check`
  - Biome、monorepo tsgo、Desktop tsc 和全部 guards 通过。

### 结果

- read 迁移从“凭实现理解重写”改成“由旧行为合同驱动实现”。
- 新 read 可以通过新增 Runtime Adapter 直接复用同一套 fixture。
- 旧生产功能保持不变，read 仍明确标记为未迁移。

### 下一步

1. 在 `tools/read/` 内实现新 Runtime read，生产代码不导入旧 `coding-agent`。
2. 将路径、锚点、截断和文本解码放在可被后续 read/edit/grep 复用的包内模块。
3. 为图片处理建立默认 Adapter，并验证 Photon/WASM 的包发布与宿主打包路径。
4. 新旧实现同时通过 Read Behavior Contract 和 Tool Compatibility Contract 后再注册到 Feature。

## 2026-07-26：独立 Runtime Read 与 Feature 接入

### 目标

在不修改旧生产工具和用户可观察功能的前提下，完成 read 的独立 Runtime 实现：

- 新实现不导入 `coding-agent`。
- 保留旧描述、Schema、路径、编码、图片、二进制提示、锚点、截断和取消行为。
- 环境依赖通过 Port 注入，纯行为算法与具体工具装配分离。
- 只有旧新合同通过后才加入 Greenfield Coding Tools Feature。

### 修改范围

- 新增包内纯行为模块：
  - `shared/anchors.ts`
  - `shared/path-resolution.ts`
  - `shared/text-decoding.ts`
  - `shared/truncation.ts`
- 新增独立 read 目录：
  - `read-tool.ts`
  - `description.ts`
  - `registration.ts`
  - `image-mime.ts`
  - `image-resize.ts`
  - `photon.ts`
  - `index.ts`
- 新增 `ReadImageProcessor` Port；默认 Adapter 保留 Photon/WASM 图片处理。
- `ReadOperations` 继续隔离 stat、readFile 和 MIME 检测。
- `runtime-tools` 增加 `file-type` 与 `@silvia-odwyer/photon-node` 直接生产依赖。
- `createCodingToolsFeature()` 新增 cwd/read options，并注册 `current_time` 与 `read`。
- 新增新实现行为合同、旧新差分和真实 Engine Tool Loop 测试。

### 架构边界

```text
CodingToolsFeature
  -> CodingToolRegistration
    -> Runtime Read Tool
      -> shared pure behavior
      -> ReadOperations
      -> ReadImageProcessor
```

- Kernel 只看到 `RuntimeToolDefinition`，不认识 read 的文件系统或 Photon。
- Coding 注册层持有 scope/category，不污染 Tool 执行定义。
- 默认 Adapter 决定如何访问文件和处理图片，但不能修改模型可见合同。
- shared 目录只保存已经被行为合同固定的无状态算法，不形成跨工具状态或服务定位器。

### 兼容性验证

- 同一组 18 项 Read Behavior Contract 同时运行旧实现和新实现：
  - UTF-8、GB18030、空文件和不存在文件。
  - 相对、绝对、`~`、Unicode/CJK 空格、NFD 和弯引号路径。
  - offset、limit、锚点、行截断和字节截断。
  - 图片魔数、Photon 默认处理、关闭自动缩放和伪扩展。
  - 已知/未知二进制提示、自定义 Operations 和取消。
- 旧新定义与注册逐字段比较。
- 锚点、截断文本和二进制提示执行结果逐字节比较。
- 注入 `ReadImageProcessor` 时验证处理器输入和返回结果不被 Adapter 改写。
- 真实 `AgentCoreTurnEngine` Tool Loop 成功读取 cwd 下的相对路径文件。

### 明确未修改

- 未修改包根旧 `createReadTool` 兼容导出。
- 未修改旧 `coding-agent` read 源码、描述文件或注册表。
- 未切换 RuntimeHost、Desktop、CLI、RPC 或 IM。
- 未修改旧路径的混合分隔符、模糊匹配或错误消息。
- 未删除旧独立可执行产物的 Photon WASM 复制逻辑。
- 未迁移 edit、write、grep、ls、bash 或其他工具。

### 测试

- `packages/runtime-tools`
  - `bunx vitest --run test/coding/read/read-runtime-contract.test.ts`
  - 1 个测试文件、21 个测试通过。
  - `bun run test`
  - 4 个测试文件、49 个测试通过。
- `bun run check:quick`
  - Biome、私钥、冲突标记和包边界检查通过。
- `bun run check`
  - Biome、monorepo tsgo、Desktop tsc 和全部 guards 通过。

### 结果

- read 的工具模块行为完成独立迁移，新源码不再通过兼容转发依赖旧工具。
- Coding Tools Feature 已从单一 `current_time` 扩展为 `current_time + read`。
- 文件系统、图片处理和纯文本算法边界显式化，同时保持旧功能。
- 生产入口仍使用旧实现，因此本轮没有造成用户可观察功能变化。

### 未解决问题

- Photon/WASM 已通过模块运行时测试，但尚未验证 Greenfield Host 独立可执行产物的资源复制和
  定位；生产切换前必须增加 Packaging Gate。
- Feature 仍缺少 edit、write、search、process 等旧工具，不能整体替代生产工具集合。
- shared 算法是否被其他工具复用，必须由其旧行为合同决定，不能预先抽象。

### 下一步

1. 为 `ls` 提取旧行为矩阵和参数化合同。
2. 在合同约束下实现独立 Runtime ls，按需要复用路径/截断纯模块。
3. 再迁移 `grep`，形成完整只读工具组。
4. 在宿主组合阶段补充 Photon WASM 独立产物测试，不把打包逻辑放回 read 工具。

## 2026-07-26：独立 Runtime Ls 与默认暴露兼容

### 目标

在不修改旧生产工具和默认工具集合的前提下迁移 ls：

- 新实现不导入 `coding-agent`。
- 保留完整描述、Schema、路径、排序、目录标记、限制、截断、错误和取消行为。
- 复用已经由 read 合同验证的路径与截断纯模块。
- 保留旧 `scope_use: []` 的默认不激活语义。

### 审计结论

旧 `ls` 的空 `scope_use` 不是遗漏。旧选择器采用 fail-closed：

```text
scope_use = []
-> 工具存在于可用/只读工具集合
-> 任何场景都不默认激活
-> 只能由宿主显式选择或按需激活
```

因此新实现不能像 read 一样声明七个场景。Coding Tools Feature 可以创建 ls 注册对象，但默认
Runtime Snapshot 必须继续只有 `current_time + read`。

旧执行中取消也不是完全协作式：Promise 会立即以 `Operation aborted` 拒绝，但已经开始的
Operations 会继续完成。合同记录这一事实，本轮不改变。

### 修改范围

- 新增 `tools/ls/`：
  - `ls-tool.ts`
  - `description.ts`
  - `registration.ts`
  - `index.ts`
- 新增 TypeBox `LsToolInputSchema` 和独立 Runtime `createLsTool()`。
- 新增可注入 `LsOperations`：
  - `exists`
  - `stat`
  - `readdir`
- 将共享路径函数改名为中立的 `resolveExistingPath`，同时保留 `resolveReadPath` 别名，
  read 行为不变。
- 新增 `LS_TOOL_SCOPES = []` 与 `LS_TOOL_CATEGORY = "core"`。
- Coding Tools Feature 注册 ls，但场景选择后默认不贡献该工具。
- 新增 Ls Behavior Contract、Legacy/Runtime Adapter、旧新差分和显式 Engine Tool Loop。

### 合同覆盖

- 完整 name、label、description、TypeBox Schema、scope 和 category。
- dotfile、目录 `/` 后缀和大小写不敏感排序。
- path 缺省/空字符串、相对、绝对、`~`、Unicode/CJK 空格模糊路径。
- macOS AM/PM 窄空格、NFD、弯引号和组合 fallback。
- 路径不存在、非目录、空目录和 readdir 错误。
- 默认 500 项、恰好命中 limit、零值和小数 limit。
- 单项 stat 失败跳过。
- 50KB 字节截断以及 entry/byte 组合提示和 details。
- 自定义 Operations 的路径与调用顺序。
- 提前取消和执行中取消后 Operations 继续运行的旧语义。

### 明确未修改

- 未修改旧 `coding-agent` ls 源码、description.txt 或注册。
- 未修改包根旧 `createLsTool` 兼容导出。
- 未把 ls 改成任何场景默认激活。
- 未增加 Workspace Root 限制或收紧 Number limit Schema。
- 未修复旧执行中取消后 Operations 继续运行的行为。
- 未切换 RuntimeHost、Desktop、CLI、RPC 或 IM。
- 未迁移 grep、find、glob、tree 或其他工具。

### 测试

- 旧实现基线：
  - `bunx vitest --run test/coding/ls/ls-legacy-contract.test.ts`
  - 1 个测试文件、15 个测试通过。
- 旧新合同及 Feature：
  - 3 个测试文件、39 个测试通过。
- `packages/runtime-tools`
  - `bun run test`
  - 6 个测试文件、82 个测试通过。
- `bun run check:quick`
  - Biome、私钥、冲突标记和包边界检查通过。
- `bun run check`
  - Biome、monorepo tsgo、Desktop tsc 和全部 guards 通过。

### 结果

- ls 工具模块完成独立迁移，生产源码不依赖旧工具。
- 旧新定义、执行、注册和所有场景默认激活集合一致。
- 显式选择的 Runtime ls 可以通过真实 Agent Core Tool Loop 执行。
- Greenfield 默认 Snapshot 没有扩大模型工具权限。
- 旧生产入口保持不变。

### 未解决问题

- Greenfield Feature 尚未定义生产级显式工具选择/按需激活合同；当前只证明 Runtime ls 可被
  显式组合。
- 执行中取消无法停止已经启动的旧式 Operations。改变它需要单独的行为迁移决策。
- 完整只读工具组仍缺少 grep、glob、find 和 dir_tree。

### 下一步

1. 设计并测试显式工具选择/按需激活合同，保持 scope fail-closed。
2. 为 grep 提取参数化旧行为矩阵。
3. 在合同约束下实现独立 Runtime grep。
4. 继续保留包根兼容导出和旧生产入口，直到完整 Profile 与 Host 差分通过。

## 2026-07-26：动态 Coding Tool Catalog 与 Feature 解耦

### 目标

修正 `CodingToolsFeatureOptions` 逐个暴露工具 Options 的扩展性问题：

- Feature 不认识 current_time、read、ls 或未来具体工具。
- 工具 Options 和环境依赖在组合根创建注册对象时注入。
- 工具可以动态注册和注销。
- 默认场景激活、显式追加和显式替代是独立编排合同。
- 动态变化不能修改已经编译或正在执行的 Runtime Snapshot。

### 修改范围

- 新增 `coding-tool-catalog.ts`：
  - `CodingToolCatalogSnapshot`
  - `CodingToolCatalog`
  - `CodingToolRegistry`
  - `InMemoryCodingToolRegistry`
- Registry：
  - 支持初始注册、动态 register 和 unregister。
  - 工具名重名时 fail-fast。
  - 每次有效修改增加版本。
  - 按工具名稳定排序并冻结成员快照。
  - 在注册边界复制 scope 元数据并冻结工具顶层定义。
- 新增 `CodingToolActivation`：
  - `mode: "scope"`。
  - `mode: "explicit"`。
- 新增 `selectCodingTools()`，保留 `selectCodingToolsForScope()` 兼容纯函数。
- `CodingToolsFeatureOptions` 收缩为：

```ts
interface CodingToolsFeatureOptions {
	readonly catalog: CodingToolCatalog;
	readonly activation?: CodingToolActivation;
}
```

- 删除 Feature 对 cwd、CurrentTimeToolOptions、ReadToolOptions 和 LsToolOptions 的认识。
- 测试组合根显式创建三个 Tool Registration 并注册到 Registry。

### 生命周期语义

```text
registry.register / unregister
  -> catalog.version + 1
  -> composition root 重新 compile
  -> AtomicRuntimeSnapshotProvider.swap(newSnapshot)
```

- Feature prepare 同步绑定当时的 Catalog Snapshot。
- prepare 之后的 Registry 变化不影响该 Feature 实例。
- 已编译 Runtime Snapshot 不读取可变 Registry。
- 当前 Turn 继续使用开始时获取的 Runtime Snapshot Lease。
- 自动监听和重编译由未来 Host Composition Root 负责，不由 Feature 控制 Runtime 生命周期。

### 激活语义

- scope 模式：`scopeUse` 包含当前场景的工具默认激活。
- scope 模式可通过 `additionallyEnabledToolNames` 激活 ls 等空 scope 工具。
- explicit 模式只激活显式名称，替代 scope 默认集合。
- 重复名称由 Set 去重。
- 未注册名称被忽略，保持 fail-closed。

### 明确未修改

- 未修改任何 Tool 的 Schema、描述、执行结果、错误、副作用或取消行为。
- 未修改旧生产工具注册和包根兼容导出。
- 未切换 RuntimeHost、Desktop、CLI、RPC 或 IM。
- 未增加 Registry 自动监听、后台编译或 Host 自动 swap。
- 未把 Catalog 或 Coding 场景放入 Kernel 合同。
- 未迁移 grep 或其他新工具。

### 测试

- 新增 `coding-tool-catalog.test.ts`，覆盖：
  - 稳定排序、冻结快照和版本。
  - register/unregister 与旧快照隔离。
  - 初始/动态重名冲突。
  - scope 元数据边界复制。
  - class-backed Tool 的原型方法执行保持。
  - scope 追加激活、explicit 替代激活和未知名称。
- Feature 合同新增：
  - 同一 Registry 修改前后重新编译得到不同工具集合。
  - 修改前的旧 Runtime Snapshot 保持不变。
  - 空 scope 的 ls 通过 explicit Feature 激活进入真实 Agent Core Tool Loop。
- `packages/runtime-tools`
  - `bun run test`
  - 7 个测试文件、91 个测试通过。
- `bun run check:quick`
  - Biome、私钥、冲突标记和包边界检查通过。
- `bun run check`
  - Biome、monorepo tsgo、Desktop tsc 和全部 guards 通过。

### 结果

- Coding Tools Feature 不再随着工具数量增长而修改 Options。
- 工具实现、注册目录、激活策略和 Runtime Snapshot 生命周期形成独立边界。
- 动态注册能力已建立，旧 Snapshot 隔离由自动测试验证。
- ls 可以通过正式 Feature 激活合同显式启用，默认暴露保持不变。
- 生产入口仍使用旧实现，本轮没有用户可观察功能变化。

### 未解决问题

- 生产 Composition Root 尚未创建 Registry，也没有监听外部能力变化后执行 compile/swap。
- Registry 当前是进程内实现；持久化启用选择属于 Host/Profile 配置，不属于 Catalog。
- 完整 Coding Tools 仍缺少 grep、glob、find、tree、write、edit 和进程工具。

### 下一步

1. 为 grep 提取旧行为矩阵和参数化合同。
2. 实现独立 Runtime grep，并通过 Registry 注册而不修改 Feature Options。
3. 继续迁移只读工具组。
4. 在生产 Profile/Host 阶段接入 Registry 重编译与 Atomic Snapshot 交换。

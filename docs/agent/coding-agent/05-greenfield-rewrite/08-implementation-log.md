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

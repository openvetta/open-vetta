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

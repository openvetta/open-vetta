# 包布局与公开 API

## 1. 新目录布局

最终布局建议如下：

```text
packages/runtime-core/src/
  session/
    agent-session.ts
    session-state.ts
    input-queue.ts
  turn/
    turn-pipeline.ts
    turn-context.ts
    turn-runner.ts
    turn-engine-port.ts
  features/
    contracts.ts
    compiler.ts
    lifecycle.ts
  context/
    context-builder.ts
    context-strategy.ts
  tools/
    contracts.ts
    tool-runtime.ts
    tool-policy.ts
  storage/
    conversation-repository.ts
  events/
    session-events.ts
  index.ts

packages/runtime-storage/src/
  conversation/
    file-conversation-repository.ts
    event-codec.ts
    snapshot-codec.ts
    v1-importer.ts
  auth/
  settings/
  index.ts

packages/runtime-tools/src/
  coding/
    shared/
      anchors.ts
      path-resolution.ts
      text-decoding.ts
      truncation.ts
    tool-registration.ts
    tools/
      current-time/
        current-time-tool.ts
        description.ts
        registration.ts
        index.ts
      read/
        read-tool.ts
        description.ts
        registration.ts
        image-mime.ts
        image-resize.ts
        photon.ts
        index.ts
    coding-tools-feature.ts
    index.ts
  index.ts

packages/runtime-mcp/src/
  client/
  config/
  oauth/
  mcp-tool-adapter.ts
  mcp-feature.ts
  index.ts

packages/coding-agent/src/
  profile/
    coding-profile.ts
    coding-instructions.ts
    default-features.ts
  adapters/
    sdk.ts
    rpc.ts
    cli.ts
  create-coding-agent.ts
  index.ts
```

入口文件只做导出和装配。解析、状态、存储、工具和协议实现必须位于其职责目录。

迁移期间允许包根继续导出旧工具，但新实现只从明确的
`@vetta/runtime-tools/coding` 子入口发布。每迁移一个工具，都必须先在该目录形成
独立实现和 Feature 合同测试，不能从新子入口转发 `coding-agent`。合同测试必须同时运行
旧实现与新实现，比较 Schema、模型描述、结果、错误和副作用；只完成其中一部分时不能公开
同名工具。

每个工具使用独立 `tools/<tool-name>/` 目录。模型可见描述使用 `description.ts` 导出常量，
不在工具实现中内联长字符串，也不重复旧实现的 `description.txt -> generated TS` 构建步骤。

工具可以依赖包内纯行为模块，但不能通过共享模块重新形成“工具大全”。当前 read 提取的
路径解析、文本解码、锚点和截断只包含无状态算法；文件系统、图片解码和 Runtime 合同仍由
read 自己装配。后续工具只有在确实共享同一行为合同时才复用这些模块。

read 对外暴露两类 Port：

```text
ReadOperations
  stat / readFile / detectMime

ReadImageProcessor
  processImage
```

默认 Adapter 保持旧文件系统、`file-type` 和 Photon/WASM 行为，测试或其他宿主可以注入实现。
Port 的目的仅是隔离环境依赖，不允许 Adapter 修改模型可见结果。新实现不从
`coding-agent` 导入任何生产代码。

工具执行定义与 Coding 产品注册元数据必须分离：

```text
RuntimeToolDefinition
  name / label / description / inputSchema / execute

CodingToolRegistration
  tool / scopeUse / category
```

`RuntimeToolDefinition` 属于通用 Kernel 合同，不认识 `project`、`im-claw` 或 `cli`。
`scopeUse` 和 `category` 位于 `runtime-tools/coding` 注册层，由组合根把会话场景传给
`CodingToolsFeature` 后筛选。Agent Profile ID 与会话场景是两个概念，不能通过比较
`profileId === scope` 隐式绑定。

## 2. 公开 API 收缩

新 `@vetta/coding-agent` 根入口建议只导出：

```ts
export {
	createCodingAgent,
	type CodingAgent,
	type CodingAgentOptions,
	type CodingAgentSession,
	type SessionEvent,
	type SessionInput,
	type TurnResult,
} from "...";
```

可选的明确子入口：

```text
@vetta/coding-agent/cli
@vetta/coding-agent/rpc
@vetta/coding-agent/testing
```

不再从根入口导出：

- `SessionManager`。
- `SettingsManager`。
- `ModelRegistry`。
- `McpManager`。
- Tool 工厂。
- Extension Runner。
- Resource Loader。
- Knowledge 内部函数。

真正需要复用的实现必须移动到其所有权包并从该包导出。不能为了方便再次从 `coding-agent` 聚合导出。

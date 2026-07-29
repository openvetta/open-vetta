# @vetta/runtime-mcp

Greenfield Runtime 的独立 MCP Feature 合同与模型调用级同步实现。

## What It Owns

- 当前 MCP 工具视图的 `McpRuntimeToolSource` Port
- MCP 工具到 Runtime Registry 的增量同步与生命周期
- 会话级渐进披露、`tool_search` 和 MCP Prompt 物化
- 与具体 MCP SDK、配置来源和宿主无关的行为测试

## What It Does Not Own

- MCP server 配置文件或配置 UI
- stdio、HTTP、OAuth 等具体连接实现
- Legacy `McpManager` 或 Coding Agent 的 `AgentTool` 协议
- Desktop、CLI、IM 的 Composition Root

## Who Depends On It

- `runtime-composition`：在每次模型调用前刷新当前 MCP 工具集合
- `coding-agent`：把既有 `McpManager` 适配为独立 Source Port
- Desktop 与 CLI 宿主：通过 coding-agent 的临时兼容适配器创建和释放 MCP Source

依赖方向必须保持为：

```text
runtime-mcp -> runtime-core
coding-agent adapter -> runtime-mcp + legacy core/mcp
runtime-composition -> runtime-mcp + runtime-tools
```

`runtime-mcp/src` 禁止反向导入 `@vetta/coding-agent`。

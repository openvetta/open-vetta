# ADR-0154：MCP 支持旧式 HTTP+SSE 传输

## 状态

已采纳。补充 ADR-0152：`.mcp.json` 里的 `type: "sse"` 由跳过改为原样支持。

## 背景

仍有不少 MCP 服务器只提供 SSE 端点（2024-11 规范的 HTTP+SSE 传输），Claude Code 等工具的配置里常见 `type: "sse"`。Vetta 只支持 stdio 与 Streamable HTTP，这类服务器无法连接，从其他工具复制来的配置也不能直接用。

## 决策

1. 配置 `type` 新增 `"sse"`。它与 `http` 共用 `url`、`headers`、OAuth 字段，由同一个 `HttpMcpClient` 按 `type` 选择 SDK 的 `SSEClientTransport` 或 `StreamableHTTPClientTransport`；其余请求、重连与鉴权逻辑不变。
2. SSE 只走 legacy 协议。无状态的 modern 协议只定义在 Streamable HTTP 之上，所以 `sse` 与 `protocolMode: "modern"` / `"auto"` 的组合在配置解析时即被拒绝，不留含糊行为。
3. 浏览器 OAuth 授权会话按配置的传输创建，token 才与服务器端点对应。受管 runtime 与市场的受管字段只适用于 `http`，`sse` 配置里出现它们会被拒绝。
4. 桌面端数据模型把 `sse` 做成独立类型（`McpSseServerConfigData`），不并入 `http`；设置页表单、JSON 校验、审批弹窗、`mcp.manage` 能力与 SDK 类型都接受它。
5. 不自动回退：`http` 连接失败不会再尝试 SSE，用户需显式写 `type: "sse"`。避免一次失败的连接悄悄多出一次探测，也避免错误信息变得难以判断。
6. 插件清单里的 MCP 声明（`plugin.json`）不扩展：那是对外合同，改动要推进 `PLUGIN_API_VERSION`，不属于本次范围。

## 备选方案

- 把 `sse` 当作 `http` 的别名并自动回退：行为更省事，但每次失败多一次探测，且无法区分真正的网络故障和协议不匹配，未采用。
- 把 `sse` 并入 `http` 的数据类型：会让受管 runtime 等只属于 `http` 的字段出现在 `sse` 上，未采用。

## 后果

- SDK 已将 `SSEClientTransport` 标记为 deprecated；这里只为兼容仍在使用它的服务器保留，文档与 `mcp.manage` 的说明都要求优先使用 `http`。
- SSE 是长连接，连接中断后的恢复依赖 SDK 现有行为，未做额外重连；这一点没有在真实的、不稳定的网络下验证过。

# 插件内聚 MCP

插件可通过清单声明 **自带 MCP server**，随插件启用进入 agent 工具面，禁用/卸载即拆除。与用户设置的全局 MCP（`~/.vetta/agent/mcp.json`）**并列**，**不会**写入该文件。

详见 ADR-0040。

## 清单

```json
{
  "permissions": ["agent.mcp.control"],
  "agent": {
    "mcpServers": "./.mcp.json"
  }
}
```

或内联：

```json
"agent": {
  "mcpServers": {
    "canvas": {
      "command": "node",
      "args": ["./scripts/start-mcp.mjs"],
      "cwd": "."
    }
  }
}
```

`.mcp.json` 形状与用户 MCP 相同：

```json
{
  "mcpServers": {
    "canvas": {
      "command": "node",
      "args": ["./mcp/server.mjs"],
      "cwd": "."
    }
  }
}
```

## 权限与生命周期

| 条件 | 行为 |
|------|------|
| 插件启用 + 已授 `agent.mcp.control` | 贡献进入 `AgentPluginRuntimeConfig.mcpServerContributions` |
| 未授权 / 禁用 | 不贡献；已运行的 server 被 reconcile 关掉 |
| 系统插件 | 声明的权限自动全授（含本权限） |

## 运行时命名

- 本地 key（如 `canvas` / `cowart_mcp`）→ 全局名 `plugin-<pluginId>-<normalizedLocal>`
- `_` 与非法字符规范为 kebab-case（如 `cowart_mcp` → `cowart-mcp`）
- Agent 工具名：`mcp_plugin-<id>-<local>_<toolName>`

相对路径（`command` / `args` / `cwd`）相对**插件安装根**解析；裸命令名（如 `node`）走 PATH。

## 打包

`vettaPluginFederation({ package: true })` 在声明 `agent.mcpServers` 时会：

- 若为字符串路径，打入该 `.mcp.json`
- 若存在 `mcp/`、`scripts/` 目录，一并打入

依赖（`node_modules`）默认不打进 zip；由插件作者预构建或文档说明安装方式。

## 与 registerTool

| | 插件 MCP | `registerTool` |
|--|----------|----------------|
| 进程 | 独立 stdio/http | renderer handler |
| 适用 | 现成 MCP server、重逻辑 | 轻逻辑、强绑 UI |
| 权限 | `agent.mcp.control` | `agent.tools.register` + execute |

同一插件可同时使用两者。

## 非目标（当前）

- MCP Apps / 原生 widget 宿主
- 设置页 JSON 编辑器展示/编辑插件 MCP
- 安装时自动 `npm install`

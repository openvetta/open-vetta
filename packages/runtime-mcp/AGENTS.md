# Team: Runtime

> 本包属于 **Runtime Team**，同组包：`runtime-core`、`runtime-storage`、`runtime-telemetry`、`runtime-tools`、`cli-app`

## 职责范围

MCP（Model Context Protocol）的独立 Runtime Feature：定义当前工具视图 Source Port、增量同步、
渐进披露和模型调用级 Prompt/Tool 物化。

## 注意事项

- `src/` 不得导入或 re-export `@vetta/coding-agent`
- 不在本包解析 Desktop/CLI 产品配置，也不绑定具体 `McpManager`
- 具体 MCP SDK、stdio/HTTP、OAuth Provider 与显式路径文件适配器由本包提供；产品目录和交互式授权流程由宿主适配层提供
- 动态新增、删除、未变化 binding 保留、失败保持和渐进披露必须有独立测试
- 修改公开 Port 时同步检查 `runtime-composition` 与 coding-agent 的 legacy adapter

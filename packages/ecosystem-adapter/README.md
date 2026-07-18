# @vetta/ecosystem-adapter

外部 Agent 生态兼容层。包内的通用能力与具体生态 profile 分离：

- `@vetta/ecosystem-adapter/hooks`：Hook 领域模型、调度器和命令执行器。
- `@vetta/ecosystem-adapter/codex/hooks`：版本化 Codex Hook 配置与协议语义。
- `@vetta/ecosystem-adapter/claude-code/hooks`：版本化 Claude Code Hook 配置与协议语义。

根导出提供 `createEcosystemHookRuntime()`。运行时只依赖 `EcosystemHookAdapter` 接口，负责统一的 session/turn 状态、多 adapter 聚合和 Stop 安全阀；默认注册 Codex 与 Claude 两个 adapter。通过 `adapterFactories` 可替换默认集合，通过 `additionalAdapterFactories` 可追加其他生态实现，调用方生命周期无需增加新的 `xxHooks` 字段。

Codex profile 只兼容 `C:\github\codex` 提交 `fca51f6dafb106177f23084d16f076ff2f66dd91` 对应的最新版协议，不保留旧版兼容分支。该 profile 覆盖 10 个 Hook 事件、通用 function tool、Bash、MCP、输入改写、结果阻止、压缩生命周期和独立 additional context。PermissionRequest 与 Subagent 生命周期已提供通用运行时边界，是否触发由宿主是否具备真实审批/子代理生命周期决定。

Claude Code profile 固定为 `claude-code-hooks/2.1.211`。它复用通用 dispatcher/executor，但配置 schema、stdin/stdout、matcher 与 exit code 语义独立。首期支持 Vetta 宿主已触发的事件子集与同步 `command` handler；`http` / `prompt` / `agent` 等 handler 产生诊断而不静默执行。

Adapters 不发现 `CODEX_HOME`、`~/.codex`、`~/.claude` 或项目 `.codex` / `.claude`。它们只解析宿主显式传入的配置层。Vetta Coding Agent 当前只提供自己的应用目录，并按顺序累加读取：

- Codex：`~/.vetta/agent/hooks.json` 与 `<cwd>/.vetta/hooks.json`
- Claude：`~/.vetta/agent/claude-hooks.json` 与 `<cwd>/.vetta/claude-hooks.json`，以及带 `CLAUDE_PLUGIN_ROOT` 或 `profileId: claude-code-hooks/*` 的显式 source（例如插件 `hooks/hooks.json`）

这些目录由 Vetta 宿主传给兼容解析器；ecosystem-adapter 不拥有应用目录策略。配置只在每个 Agent Session 首次触发 Hook 时加载一次。

调用方也可以通过 `HookConfigLayer.sources` 显式提供 Vetta 已安装插件范围内的 Hook 文件，并为每个 source 注入环境变量。解析器不会自行扫描插件目录；插件 manifest 发现、路径边界校验与信任决策仍属于应用插件加载器职责。

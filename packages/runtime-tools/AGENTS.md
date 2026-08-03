# Team: Runtime

> 本包属于 **Runtime Team**，同组包：`runtime-core`、`runtime-mcp`、`runtime-storage`、`runtime-telemetry`、`cli-app`

## 职责范围

通用 Agent 工具实现与 Coding Tools Feature。

工具实现位于 `src/coding/`，由包根和 `@vetta/runtime-tools/coding` 暴露，
生产代码不得依赖 `coding-agent`。

## 注意事项

- `src/index.ts` 只转发独立 Coding Tool API，不得恢复旧工具单例或兼容导出
- `src/coding/` 真正拥有新 Runtime Tool 和 Feature
- 每个工具位于独立的 `src/coding/tools/<tool-name>/` 目录
- 模型可见工具描述使用独立 `description.ts`，不在工具工厂中内联长字符串
- Tool Definition 只表达执行能力；`scope_use`、`category` 等 Coding 暴露元数据放在独立注册对象
- 会话场景由组合根传给 Coding Tools Feature，不能与通用 Agent Profile ID 混为一谈
- 新工具参数使用 TypeBox，并实现 `RuntimeToolDefinition`
- 工具不得持有 Session 或绕过 Runtime Tool Policy
- 迁移工具必须保持旧 Schema、模型可见描述、输出、错误、副作用和路径语义
- 架构调整不能借机缩减功能；尚未通过旧新差分测试的工具不得标记为已迁移
- 新代码禁止导入 `@vetta/coding-agent`
- 旧 `coding-agent` 工具只允许作为测试差分 Oracle 出现在开发依赖中

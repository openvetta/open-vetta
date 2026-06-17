# 引导词走声明式 manifest 字段而非命令式 ctx.ui 注册

## Status

accepted

## 决策

[[引导词]]（见 CONTEXT.md）作为 `plugin.json` 顶层声明式字段 `guidingWords?: string[]` 实现，**不**新增命令式 API `ctx.ui.registerGuidingWords()`。字段随 [[description]] 同路径从 manifest 经 `parseManifest` 流入 `InstalledPlugin`，无 `PluginPermission` 门控、无 `activate` 运行时注册。NewSessionPage 直接读 `plugins.list()` 返回的静态清单数据按插件分组渲染。

## 背景约束

- 现有所有插件 UI 扩展点（全局 slot / [[文件预览插槽]] / [[活动面板插件 tab]]）都走命令式 `ctx.ui.register*`：需要插件 `activate` 执行过、且多数带权限位。
- 引导词的消费时机是**开新会话的欢迎页**——此时用户尚未进入任何 session，相关插件的 `activate` 未必已运行。若走命令式注册，NewSessionPage 拿不到未激活插件的引导词。
- 引导词是**纯静态文案**，无行为、无回调、不触碰宿主 store——不具备命令式注册所服务的「运行时动态贡献 React 组件 / 订阅会话」诉求。

## Considered Options

- **`ctx.ui.registerGuidingWords(words)` 命令式注册**：与现有插件 UI 扩展范式一致，但要求插件在 NewSession 前已 `activate`，与「会话开始前展示」的时机冲突；且为纯静态数据引入运行时注册、权限位、生命周期管理，过度。否决。
- **复用 [[对话插件 API]] 的 `insertText` / `sendPrompt`**：那是会话**进行中**的命令式驱动通道，作用于活动 session；引导词是会话**开始前**的声明式建议，作用域与时机均不同。否决（两者并存，互不替代）。
- **声明式 manifest 字段（采纳）**：与 `description` / `author` 同构，零运行时依赖、未激活插件也可读，最小实现面。

## Consequences

- 引导词是插件体系**第一个声明式 UI 贡献**，确立「纯静态、无行为的 UI 贡献走 manifest 字段，动态、有行为的走 `ctx.ui.register*`」这一分界。后续同类静态贡献应沿此惯例，避免为静态数据强上命令式注册。
- NewSessionPage 由此新增对 `plugins.list()` 的依赖，首次把插件数据引入该页面（此前只读 `skills.list()`）。两套数据源并存，需在术语与代码上保持区分（见 [[引导词]] 的 Avoid）。
- 代价：声明式字段无权限门控，任何启用的插件都可向欢迎页投放建议文案；信任模型依赖 [[可信插件]] 的策展分发前提（一方/可信 + 审核上架），与现有插件信任定位一致，未额外引入风险。

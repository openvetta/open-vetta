# Team: AI Core

> 本包属于 **AI Core Team**，同组包：`packages/ai`、`packages/agent`、`packages/tui`

## 职责范围

Web UI 组件库，提供 AI 聊天界面的前端组件、工具渲染器、存储后端。

## 关键模块

- `src/components/` — UI 组件（含 `sandbox/` 子目录）
- `src/tools/` — 工具实现（含 `renderers/` 和 `artifacts/`）
- `src/storage/` — 数据存储（含 `backends/` 和 `stores/`）
- `src/ChatPanel.ts` — 聊天面板主组件
- `src/dialogs/` — 对话框组件
- `src/prompts/` — 提示模板

## 注意事项

- 依赖 `pi-ai` 和 `pi-tui`，类型变更需同步检查
- 本包被 `desktop-app` 消费，接口变更需确认下游兼容
- 无独立测试目录，仅有 `example/` 用于开发调试

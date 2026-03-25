# Team: AI Core

> 本包属于 **AI Core Team**，同组包：`packages/ai`、`packages/agent`、`packages/web-ui`

## 职责范围

终端 UI 库，提供差异化渲染引擎、编辑器组件、快捷键系统。

## 关键模块

- `src/tui.ts` — TUI 主引擎
- `src/terminal.ts` — 终端控制
- `src/keybindings.ts` — 快捷键绑定（所有快捷键必须可配置，禁止硬编码）
- `src/editor-component.ts` — 编辑器组件
- `src/components/` — UI 组件目录

## 注意事项

- 快捷键必须通过 `DEFAULT_EDITOR_KEYBINDINGS` 或 `DEFAULT_APP_KEYBINDINGS` 配置，禁止 `matchesKey(keyData, "ctrl+x")` 式硬编码
- 本包被 `coding-agent` 的交互式模式直接使用
- 可用 tmux 测试 TUI（见根目录 AGENTS.md 的 tmux 测试说明）
- 测试在 `test/` 目录

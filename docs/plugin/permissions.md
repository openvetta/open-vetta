# 权限

插件必须在 `plugin.json` 的 `permissions` 数组里声明它要用的权限。宿主在插件管理页**单独授权**，并在运行时校验。

## 声明 → 授权 → 校验

1. **声明**：`plugin.json` 列出权限。未声明的权限永远拿不到。
2. **授权**：用户在设置 → 插件页为该插件勾选授权（系统插件自动全量授予、不可撤，见 [system-plugins.md](./system-plugins.md)）。Agent 经 `install-from-path` 安装时，确认后可**按声明一次授予**（见 [getting-started.md](./getting-started.md#安装)）。
3. **校验**：调用受门控的 API 时运行时检查；**未授权**会按下表两种方式之一处理。

```ts
// 运行时也可自查
ctx.permissions.has("fs.read");      // boolean
ctx.permissions.require("fs.read");  // 缺则抛 Plugin permission denied: fs.read
```

## 缺权限的两种行为

不同注册点对「声明了但未授权」的处理不同：

- **抛错（require）**：`registerInputAction`、`registerCardRenderer`、`registerToolCallSlot`、`registerTurnCard`、`openActivityTab`、`setEditImageAttachment`、`agent.registerContinuationProvider`、`agent.registerSystemPromptProvider`、`conversation.*`、`fs.*`、`images.*`、`command.run`。缺权限直接抛 `Plugin permission denied: <permission>`，中断该次调用。
- **跳过 + 警告（warn+noop）**：`registerGlobalSlot`、`registerFilePreview`、`registerActivityTab`、`agent.registerTool`。缺权限时静默跳过该贡献并打 `console.warn`，**不影响**插件其它已授权能力。

> 设计上一个缺失权限不应拖垮插件的其它能力——`activate()` 里建议把可选能力的注册各自独立，避免一处 throw 掉整段。

## 已实现权限（有对应 API / 清单面）

| 权限 | 门控 | 文档 |
| --- | --- | --- |
| `ui.slot.global` | `ctx.ui.registerGlobalSlot()` | [ui-slots](./ui-slots.md#全局浮层-registerglobalslot) |
| `ui.slot.file-preview` | `ctx.ui.registerFilePreview()` | [ui-slots](./ui-slots.md#文件预览-registerfilepreview) |
| `ui.slot.activity-tab` | `registerActivityTab` / `openActivityTab` | [ui-slots](./ui-slots.md#活动面板-tab-registeractivitytab) |
| `ui.slot.input-action` | `registerInputAction` / `setEditImageAttachment` | [ui-slots](./ui-slots.md#输入栏动作-registerinputaction) |
| `ui.slot.message` | `ctx.ui.registerCardRenderer()` | [message-cards](./message-cards.md) |
| `ui.slot.tool-call` | `ctx.ui.registerToolCallSlot()` | [ui-slots](./ui-slots.md#工具行内渲染-registertoolcallslot) |
| `ui.slot.turn-card` | `ctx.ui.registerTurnCard()` | [ui-slots](./ui-slots.md#本轮-turn-卡-registerturncard) |
| `agent.session.read` | `ctx.conversation.on()` + 对话 hook | [conversation-and-agent](./conversation-and-agent.md#对话读状态) |
| `agent.session.write` | `sendPrompt` / `insertText` / `abort` | [conversation-and-agent](./conversation-and-agent.md#对话驾驶) |
| `agent.command.run` | `ctx.command.run` + 清单 `commands` | [conversation-and-agent](./conversation-and-agent.md#命令执行-command) |
| `agent.skills.control` | 清单 `agent.skillPaths` | [manifest](./manifest.md#agent-agent-侧贡献) |
| `agent.mcp.control` | 清单 `agent.mcpServers`（三源聚合之插件源） | [mcp](./mcp.md) |
| `agent.tools.register` | `ctx.agent.registerTool()`（注册 shell） | [conversation-and-agent](./conversation-and-agent.md#注册-agent-工具) |
| `agent.toolHandler.execute` | 工具 handler 被 agent 调用时执行 | 同上 |
| `agent.tools.control` | 清单 `agent.toolPolicy` 声明式 allow/deny | [manifest](./manifest.md#agent-agent-侧贡献) |
| `agent.systemPrompt.write` | `registerSystemPromptProvider`；仅本插件 block | [conversation-and-agent](./conversation-and-agent.md#注册动态系统提示词-provider) |
| `agent.systemPrompt.fullControl` | 动态 provider 操作非本插件 block | 同上 |
| `agent.continuation.register` | `registerContinuationProvider` | [conversation-and-agent](./conversation-and-agent.md#注册-agent-自动续跑策略) |
| `fs.read` | `readDir` / `readFile` / `stat` / `listFilesRecursive` | [conversation-and-agent](./conversation-and-agent.md#文件-api) |
| `fs.write` | `writeFile` / `rename` / `delete` / `move` / `createDirectory` | 同上 |
| `images.generate` | `ctx.images.generate/edit/lineage/sessionLineages` | [conversation-and-agent](./conversation-and-agent.md#图像-api) |

> `ctx.settings` / `ctx.i18n` / **`ctx.ui.notify`** **不需要权限**——分别读本插件设置命名空间、本插件 catalog、以及向宿主右下角推送 Toast（含错误堆栈复制）。错误上报规范见 [ui-slots → notify](./ui-slots.md#全局通知-notify)。

## 占位符权限（已声明、暂无对应 API）

`PluginPermission` 联合里还包含以下值，目前是**声明了但还没对应能力 API** 的占位符，现在声明它们不会解锁任何功能：

`agent.systemPrompt.read`、`agent.state.read`、`agent.state.write`、`agent.runtime.configure`、`network.fetch`、`settings.read`、`settings.write`。

## 最小授权原则

只声明真正用到的权限。`permissions` 越小，用户授权越省心、审核越快。

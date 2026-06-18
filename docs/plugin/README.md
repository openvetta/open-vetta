# Vetta 桌面插件开发手册

面向第三方开发者的 Vetta 桌面端插件**对接与开发**完整手册。读完本目录你应当能从零写出、打包、安装、调试一个插件，并用上所有可用扩展点。

> 插件运行在 Vetta 桌面 App（Electron）的 renderer 进程内。它们是**可信、一方/策展**的扩展（经审核上架），共享宿主的 React 单例——**没有沙箱**。所有能力都通过 `@vetta/plugin-sdk` 的「策展能力出口 + 权限门控」暴露（见 [信任模型](#信任模型)）。

## 文档导航

| 文档 | 内容 |
| --- | --- |
| [getting-started.md](./getting-started.md) | 环境、脚手架、Vite/Module Federation 配置、构建、安装与调试闭环、最小可运行示例 |
| [manifest.md](./manifest.md) | `plugin.json` 全字段参考、安装与版本机制、目录布局、`contributes.settings` 配置项 schema、`guidingWords` |
| [permissions.md](./permissions.md) | 权限完整清单、门控点、声明/授权流程、占位符权限 |
| [ui-slots.md](./ui-slots.md) | 全局浮层 / 文件预览 / 活动面板 Tab / 输入栏动作 四类 UI 扩展点 |
| [message-cards.md](./message-cards.md) | 消息卡片系统（ADR-0030）：描述符、`details.cards`、`registerCardRenderer`、`pendingFor`、跨轮去重、收纳 UI |
| [conversation-and-agent.md](./conversation-and-agent.md) | 对话读状态/事件/驾驶、注册 Agent 工具、文件 API、图像 API、设置 API |
| [system-plugins.md](./system-plugins.md) | 随 App 发布的系统插件（presets）：构建、集成、分发、运行时语义 |
| [styling-and-pitfalls.md](./styling-and-pitfalls.md) | 样式约定、CSS 变量、Module Federation 顶层 JSX 陷阱、缓存刷新、Tailwind 配置坑 |

## 插件能做什么

一个插件在 `activate(ctx)` 里通过 `ctx` 注册贡献、调用能力。能力矩阵：

| 能力 | 入口 | 权限 | 文档 |
| --- | --- | --- | --- |
| 全局浮层 UI | `ctx.ui.registerGlobalSlot` | `ui.slot.global` | [ui-slots](./ui-slots.md#全局浮层-registerglobalslot) |
| 文件预览 | `ctx.ui.registerFilePreview` | `ui.slot.file-preview` | [ui-slots](./ui-slots.md#文件预览-registerfilepreview) |
| 活动面板 Tab | `ctx.ui.registerActivityTab` | `ui.slot.activity-tab` | [ui-slots](./ui-slots.md#活动面板-tab-registeractivitytab) |
| 输入栏动作（toggle） | `ctx.ui.registerInputAction` | `ui.slot.input-action` | [ui-slots](./ui-slots.md#输入栏动作-registerinputaction) |
| 消息卡片渲染器 | `ctx.ui.registerCardRenderer` | `ui.slot.message` | [message-cards](./message-cards.md) |
| 读对话状态 / 监听事件 | `useActiveConversation` / `ctx.conversation.on` | `agent.session.read` | [conversation-and-agent](./conversation-and-agent.md#对话读状态) |
| 驾驶对话（发/填/中断） | `ctx.conversation.*` | `agent.session.write` | [conversation-and-agent](./conversation-and-agent.md#对话驾驶) |
| 注册 Agent 工具 | `ctx.agent.registerTool` | `agent.tools.register` / `agent.toolHandler.execute` | [conversation-and-agent](./conversation-and-agent.md#注册-agent-工具) |
| 读写项目文件 | `ctx.fs.*` | `fs.read` / `fs.write` | [conversation-and-agent](./conversation-and-agent.md#文件-api) |
| 图像生成 / 编辑 | `ctx.images.*` | `images.generate` | [conversation-and-agent](./conversation-and-agent.md#图像-api) |
| 读插件自身设置 | `ctx.settings.*` | 无（读自身配置） | [conversation-and-agent](./conversation-and-agent.md#设置-api) |
| 新会话引导词 | `plugin.json` 的 `guidingWords`（声明式，无运行时注册） | 无 | [manifest](./manifest.md#guidingwords引导词) |

## 信任模型

- 插件是**一方 / 策展**的（官方或合作方编写、经审核上架），**不是**任意第三方不可信代码。
- 插件跑在 renderer 进程内，经 Module Federation 与宿主**共享同一份 React / React DOM / `@vetta/plugin-sdk` 单例**。
- 因此 SDK 是「**策展过的能力出口 + 权限门控**」——可同步、可直接传 React 组件实例、可读宿主状态，**刻意不做** iframe/worker 沙箱与异步消息桥。
- 每项能力由 `plugin.json` 声明权限、宿主单独授权、运行时校验；缺权限会抛 `Plugin permission denied: <permission>`。

## 5 分钟速览

```tsx
import { definePlugin } from "@vetta/plugin-sdk";

export default definePlugin({
  activate(ctx) {
    // 在 App 根部挂一个全局浮层
    ctx.ui.registerGlobalSlot({ id: "root", component: MyPanel });
  },
  deactivate() {
    // 可选：清理副作用。注册返回的 Disposable 已由宿主在卸载时统一处置
  },
});
```

```json
{
  "id": "my-plugin",
  "name": "我的插件",
  "version": "0.1.0",
  "pluginApiVersion": "^1.0.0",
  "runtime": "module-federation",
  "entry": "dist/mf-manifest.json",
  "moduleFederation": { "remoteName": "my_plugin", "expose": "./plugin" },
  "styles": ["dist/style.css"],
  "permissions": ["ui.slot.global"]
}
```

接下来从 [getting-started.md](./getting-started.md) 开始。

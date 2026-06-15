# 桌面插件系统

桌面 App 在打包后仍可加载可信的外部 UI 插件。

## 包结构

插件从 zip 归档安装。归档根目录必须有 `plugin.json`，或只含一个顶层文件夹、`plugin.json` 在其中。

```text
my-plugin.zip
  plugin.json
  dist/
    mf-manifest.json
    remoteEntry.js
    style.css
```

## Manifest

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "0.1.0",
  "pluginApiVersion": "^1.0.0",
  "runtime": "module-federation",
  "entry": "dist/mf-manifest.json",
  "moduleFederation": {
    "remoteName": "my_plugin",
    "expose": "./plugin"
  },
  "styles": ["dist/style.css"],
  "permissions": ["ui.slot.global"]
}
```

已安装的插件文件按版本存放：

```text
~/.vetta/plugins/my-plugin/versions/0.1.0/
```

安装更新版本只会记录为 pending；App 持续加载 `activeVersion`，直到用户触发 `window.vetta.plugins.reload(id)` 才切换。

## Module Federation 入口

```tsx
import { definePlugin } from "@vetta/plugin-sdk";
import { useState } from "react";

function PluginRoot() {
  const [open, setOpen] = useState(true);
  return open ? <div className="vetta-plugin-my-plugin">Hello</div> : null;
}

export default definePlugin({
  activate(ctx) {
    ctx.ui.registerGlobalSlot({
      id: "root",
      component: PluginRoot
    });
  }
});
```

宿主通过 `@module-federation/enhanced/runtime` 加载 `runtime: "module-federation"` 插件。插件应经配置的 `moduleFederation.expose` 暴露其定义。React 与 React DOM 由宿主作为共享单例提供。

Vite 配置示例：

```ts
import { vettaPluginFederation } from "@vetta/plugin-vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    vettaPluginFederation({
      name: "my_plugin",
      entry: "./src/index.tsx"
    })
  ]
});
```

其它依赖可打进插件本体；`@vetta/plugin-sdk` 由宿主提供，保持 external。

**模块顶层不要使用共享依赖（含 JSX）**：MF 共享模块（react / jsx-runtime）是异步填充的，bootstrap 完成前为 undefined——模块顶层的 JSX 字面量（如 `const ICON = <svg/>`）会在求值时抛 `TypeError: ... is not a function` 导致整个插件加载失败。把这类构造放进 `activate()` 或组件函数体内。

旧版 `runtime: "esm"` 插件仍受支持，可继续把 `react`、`react/jsx-runtime`、`react/jsx-dev-runtime`、`@vetta/plugin-sdk` 映射到 `vetta-host://` 模块。

## API 总览

全部公开接口都在 `@vetta/plugin-sdk`。信任模型：插件是**一方 / 策展**的，跑在 renderer 进程内、共享宿主 React 单例（ADR-0023）。API 是「策展过的能力出口 + 权限门控」——没有沙箱。

`activate(ctx)` 拿到的 `ctx`：

| `ctx` 字段 | 提供什么 |
| --- | --- |
| `ctx.plugin` | `{ id, version }` |
| `ctx.permissions` | `has(p)` / `require(p)` |
| `ctx.ui` | `registerGlobalSlot`、`registerFilePreview`、`registerActivityTab` |
| `ctx.conversation` | `sendPrompt`、`insertText`、`abort`、`on` |

React hook（直接从 `@vetta/plugin-sdk` import，在 slot 组件里调用）：`useActiveConversation()`、`useConversationMessages()`、`useActivityTab()`（仅活动面板 tab 组件内有值）。

### `ctx.ui.registerGlobalSlot(contribution)`

在 App 根部渲染一个组件（全局浮层），返回 `Disposable`。需要 `ui.slot.global` 权限。组件不接收任何 props。

```tsx
ctx.ui.registerGlobalSlot({ id: "panel", component: MyPanel });
```

### `ctx.ui.registerFilePreview(contribution)`

按文件扩展名贡献一个预览组件，渲染在活动面板的文件预览里。需要 `ui.slot.file-preview` 权限，返回 `Disposable`。

优先级为**仅补空白**：插件只能处理内置不支持的扩展名（内置：image / audio / pdf / docx / markdown / json / 常见文本）；**无法**覆盖内置预览。同一扩展名多插件抢注时，先注册者胜。

组件收到一个 `file` prop —— 宿主**不**预读、也不替你猜编码，你自决读什么（内容访问无需额外权限，因为是用户主动点开的这一个文件）：

```ts
interface PluginPreviewFile {
  path: string | null;     // 绝对路径（url-only 项为 null）
  name: string;
  extension: string;       // 小写、不含点
  mime: string;
  size: number;            // 字节（未知为 0）
  readText(): Promise<string>;
  readBytes(): Promise<ArrayBuffer>;
  getUrl(): string;        // 支持 Range 的流式 URL
}
```

```tsx
import { definePlugin, type PluginFilePreviewProps } from "@vetta/plugin-sdk";

function SvgPreview({ file }: PluginFilePreviewProps) {
  const [svg, setSvg] = useState("");
  useEffect(() => { void file.readText().then(setSvg); }, [file]);
  return <img src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`} />;
}

export default definePlugin({
  activate(ctx) {
    ctx.ui.registerFilePreview({ extensions: ["svg"], component: SvgPreview });
  },
});
```

完整示例见 `packages/plugins/svg-viewer`。

### `ctx.ui.registerActivityTab(contribution)`

向活动面板的「可添加池」注册一个 tab。需要 `ui.slot.activity-tab` 权限，返回 `Disposable`。一个插件可注册多个 tab。

与前两个插槽不同，注册**不直接渲染**——用户在活动面板 tab 栏 hover 时点右侧的"+"按钮，从勾选列表中手动 attach 后才出现为一个 tab（再次点击取消勾选即 remove）。attach 记录以**会话 cwd** 为 key（ADR-0026）：普通项目所有 session 共享、「对话」项目按 session 隔离。插件被禁用时 tab 隐藏，重新启用自动回来。

```tsx
ctx.ui.registerActivityTab({
  id: "stats",                // 插件内唯一
  label: "统计",
  icon: <StatsIcon />,        // 可选，React 节点（不是 iconify class 字符串）
  component: StatsPanel,      // 零 props，自包含
});
```

组件不接收任何 props。**面板作用域用 `useActivityTab()` 获取**：

```tsx
import { useActivityTab } from "@vetta/plugin-sdk";

function StatsPanel() {
  const { cwd } = useActivityTab(); // 本 tab 所在面板的作用域 cwd（与 attach 记录同 key）
  // ...
}
```

不要用 `useActiveConversation().cwd` 代替——项目详情页的面板 cwd 是项目的，而活动会话可能属于别的项目（或为 null）。会话相关上下文仍走对话 hook。

完整示例见 `packages/plugins/externals/mobile-ui-preview`（设备边框内预览作用域内的 HTML）。

### 对话：读状态

hook 读取当前活动对话并自动 rerender，按用途需要 `agent.session.read` 权限。

```tsx
import { useActiveConversation, useConversationMessages } from "@vetta/plugin-sdk";

function Sidebar() {
  const convo = useActiveConversation();
  // { id, cwd, sessionPath, model, isStreaming }
  const messages = useConversationMessages();
  // ConversationMessage[]: { id, role, text, timestamp? }
  return <div>{convo.isStreaming ? "…" : `${messages.length} 条消息`}</div>;
}
```

### 对话：事件

`ctx.conversation.on(listener)` 推送实时事件（需要 `agent.session.read`），返回 `Disposable`。

```ts
const sub = ctx.conversation.on((event) => {
  switch (event.type) {
    case "turn-start": break;
    case "turn-end": event.stopReason; break;          // "stop" | "aborted"
    case "message-added": event.message; break;         // ConversationMessage
    case "message-updated": event.delta; break;         // 流式文本增量
    case "tool-call-start": event.toolCallId; event.toolName; break;
    case "tool-call-end": event.isError; break;
    case "conversation-changed": event.conversation; break; // 活动会话切换
  }
});
// 之后：sub.dispose();
```

### 对话：驾驶

需要 `agent.session.write` 权限。

```ts
await ctx.conversation.sendPrompt("总结一下这个 diff");  // 发起一轮用户对话
ctx.conversation.insertText("草稿文本");                  // 填输入框，不发送
await ctx.conversation.abort();                           // 中断当前轮
```

所有对话 API 都作用于**活动**会话（桌面同时只展示一个）；插件不能枚举或持有任意会话句柄。

## 权限

插件必须在 `plugin.json` 声明权限。宿主单独授权并在运行时校验；缺权限会抛 `Plugin permission denied: <permission>`。

已实现的权限：

| 权限 | 门控 |
| --- | --- |
| `ui.slot.global` | `ctx.ui.registerGlobalSlot()` |
| `ui.slot.file-preview` | `ctx.ui.registerFilePreview()` |
| `ui.slot.activity-tab` | `ctx.ui.registerActivityTab()` |
| `agent.session.read` | `ctx.conversation.on()` + 对话 hook |
| `agent.session.write` | `ctx.conversation.sendPrompt/insertText/abort` |

`PluginPermission` 联合里其余的值（`agent.command.run`、`fs.read`、`fs.write`、`network.fetch`、`settings.read`、`settings.write`）目前是**声明了但还没有对应 API** 的占位符。

## 系统插件（随 App 发布，用户不可删改）

除用户自行安装的插件外，还有**系统插件**——随 App 一起发、用户不可删除/修改（ADR-0024）。

源码放在 monorepo 的 `packages/plugins/presets/<id>/`，结构与普通插件包一致（`plugin.json` + `src/` + `vite.config.ts`）。放进该目录即自动作为系统插件集成：

```text
packages/plugins/presets/
  svg-viewer/
    plugin.json
    vite.config.ts
    src/index.tsx
```

- **构建制品**：`bun run build:presets` 先构建插件 workspace 的 SDK/构建包，再逐个构建 `release/<id>-<version>.zip`。`dev` / `start` / 打包都会先跑它。
- **依赖隔离**：presets 属于 `packages/plugins` 的独立 workspace，使用单独的 `bun.lock`；`@vetta/plugin-sdk` 和 `@vetta/plugin-vite` 通过 `workspace:*` 直接链接仓库源码，不进入根 workspace 的 preset 依赖图。
- **校验**：Desktop 按 preset 的 `plugin.json` 精确定位 zip，拒绝路径穿越、id/version 不一致、入口或样式缺失的归档。
- **dev**：zip 解压到 `packages/desktop-app/.artifacts/system-plugins/<id>/`，主进程只读取该 staging，不直接读取 preset 源码和 `dist/`。
- **打包**：`prepare-pack.js` 从 zip 解压到打包 staging 的 `system-plugins/<id>/`，再随 `extraResources` 进入 `Resources/system-plugins/<id>/`。

运行时语义：

- `source: "system"`，`listPlugins()` 运行时发现并与用户插件合并。
- **id 冲突**：系统插件优先、id 保留——用户安装同 id 被拒，已存在的同 id 用户插件被遮蔽。
- **权限**：`plugin.json` 声明的权限自动全量授予，用户不可撤。
- **停用**：默认启用，用户可在设置里关闭（偏好存进 `~/.vetta/system-plugin-prefs.json`），但不可卸载、不可改文件/权限。
- **更新**：版本随 App，不走用户插件的更新流。

不进 `~/.vetta/plugins`、不写 `plugins-manifest.json`——系统插件本体不落用户态目录，每次启动从开发或安装包内的只读 staging 重新发现。zip 是统一构建制品，不在应用启动时直接读取。

## 样式

插件应使用 Vetta 的 CSS 变量，避免全局选择器：

```css
.vetta-plugin-my-plugin {
  color: var(--foreground);
  background: var(--background);
  border-color: var(--border);
}
```

不要从插件 CSS 给 `body`、`button`、`*` 等全局选择器加样式。

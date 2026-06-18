# 对话 / Agent 工具 / 文件 / 图像 / 设置 API

`ctx` 上除 UI 注册外的能力出口，以及配套 React hook。

```ts
interface PluginContext {
  plugin: { id: string; version: string };
  permissions: { has(p): boolean; require(p): void };
  ui: PluginUiApi;            // 见 ui-slots.md / message-cards.md
  conversation: PluginConversationApi;
  agent: PluginAgentApi;
  fs: PluginFsApi;
  images: PluginImagesApi;
  settings: PluginSettingsApi;
}
```

所有对话 API 都作用于**当前活动会话**（桌面同时只展示一个）；插件不能枚举或持有任意会话句柄。

## 对话：读状态

hook 直接从 `@vetta/plugin-sdk` import、在组件里调用，读当前活动对话并自动 rerender。需要 `agent.session.read`。

```tsx
import { useActiveConversation, useConversationMessages } from "@vetta/plugin-sdk";

function Sidebar() {
  const convo = useActiveConversation();
  // ConversationState: { id, cwd, sessionPath, model, isStreaming }（无会话时各为 null / false）
  const messages = useConversationMessages();
  // ConversationMessage[]: { id, role: "user"|"assistant"|"compaction", text, timestamp? }
  return <div>{convo.isStreaming ? "生成中…" : `${messages.length} 条消息`}</div>;
}
```

> 取**活动会话的 sessionId**：从 `convo.sessionPath` 里嵌的 UUID 解析（session 文件名里的 UUID）。`ctx.images.sessionLineages` 等需要它。

## 对话：事件

`ctx.conversation.on(listener)` 推实时事件，返回 `Disposable`。需要 `agent.session.read`。

```ts
const sub = ctx.conversation.on((event) => {
  switch (event.type) {
    case "turn-start": break;
    case "turn-end": event.stopReason; break;            // "stop" | "aborted" 等
    case "message-added": event.message; break;           // ConversationMessage
    case "message-updated": event.delta; break;           // 流式文本增量
    case "tool-call-start": event.toolCallId; event.toolName; break;
    case "tool-call-end": event.toolCallId; event.toolName; event.isError; break;
    case "conversation-changed": event.conversation; break; // 活动会话切换（ConversationState）
  }
});
// 之后：sub.dispose();
```

## 对话：驾驶

需要 `agent.session.write`。

```ts
await ctx.conversation.sendPrompt("总结一下这个 diff"); // 发起一轮用户对话（渲染成用户气泡）
ctx.conversation.insertText("草稿文本");                 // 仅填输入框，不发送，供用户编辑
await ctx.conversation.abort();                          // 中断当前轮
```

## 注册 Agent 工具

`ctx.agent.registerTool` 让插件用 JS 注册一个 **agent 可见的工具**：coding-agent 只看到工具 shell（schema + 描述），实际执行经 IPC 回到你的 renderer handler。需要 `agent.tools.register`（注册）+ `agent.toolHandler.execute`（执行）。返回 `Disposable`。

```ts
interface PluginAgentToolRegistration<TInput = unknown> {
  id: string;                 // 插件内唯一
  name?: string;              // LLM 可见工具名（默认取 id）
  label?: string;
  description: string;        // 进系统提示词的 Available tools，写清楚何时用
  parameters: object;         // JSON Schema（可用 TypeBox 产出）
  timeoutMs?: number;
  handler: (input: TInput, api: { fs: PluginFsApi; conversation: PluginConversationApi }) => unknown | Promise<unknown>;
}
```

```ts
ctx.agent.registerTool({
  id: "word-count",
  description: "统计一段文本的字数。当用户想知道字数时调用。",
  parameters: {
    type: "object",
    properties: { text: { type: "string" } },
    required: ["text"],
  },
  handler: async ({ text }: { text: string }) => ({ count: text.length }),
});
```

- handler 的**返回值**会被宿主格式化成工具结果文本回给模型；该工具结果的 `details` 为 `{ pluginId, toolId, result }`（`result` = 你的返回值）。
- **返回 `cards` 即可产消息卡片**：若返回值含 `cards: CardDescriptor[]`，宿主会把它**提升**到 `details.cards`（消息卡片的 settled 数据源）并从模型可见文本里**剔除**。配合 `ctx.ui.registerCardRenderer` 即可让插件**用自己的工具**在消息下方渲染卡片——见 [message-cards.md](./message-cards.md#第三方插件如何拿到卡片数据)。
- 插件激活会等待工具 schema 注册完成；注册 / 注销 / 权限或启停变化会刷新空闲的对话 session。

## 文件 API

`ctx.fs` 受权限门控读写文件（`fs.read` / `fs.write`，缺权限**抛错**）。

```ts
interface PluginFsApi {
  readDir(dirPath): Promise<PluginFsEntry[]>;                 // fs.read
  readFile(filePath): Promise<{ content: string; encoding: "utf8" | "base64" }>; // fs.read
  writeFile(filePath, content: string): Promise<void>;       // fs.write
  stat(filePath): Promise<{ size; modifiedAt; createdAt } | null>; // fs.read
  rename(oldPath, newPath): Promise<void>;                   // fs.write
  delete(targetPath): Promise<void>;                         // fs.write
  move(sourcePath, destDir): Promise<void>;                  // fs.write
  createDirectory(dirPath): Promise<void>;                   // fs.write
  listFilesRecursive(rootPath): Promise<{ name; path; relPath }[]>; // fs.read
}
// PluginFsEntry: { name, path, isDirectory, size, modifiedAt }
```

同一份 `fs` API 也通过工具 handler 的 `api.fs` 暴露给 agent 工具 handler。

## 图像 API

`ctx.images` 路由到宿主主进程图像服务（与 agent 内置图像工具**同一份实现**）。需要 `images.generate`。图像字节存 out-of-band，返回**引用**（`PluginImageRef { id, url, mimeType?, rootId? }`，`url` 是可直接作 `<img src>` 的宿主媒体 URL）。

```ts
interface PluginImagesApi {
  generate(input: { prompt: string; size?: string; sessionId?: string }): Promise<PluginImageRef[]>;
  edit(input: {
    prompt: string;
    source: { imageId: string } | { data: string; mimeType: string }; // 续 lineage 或上传字节
    sessionId?: string;
  }): Promise<PluginImageRef[]>;
  lineage(imageId: string): Promise<PluginImageRef[]>;          // 该图的编辑谱系（旧→新）
  sessionLineages(sessionId: string): Promise<PluginImageRef[][]>; // 会话所有谱系（新谱系在前；每谱系旧→新）
}
```

配套：

- `ctx.ui.setEditImageAttachment(ref | null)`：把某图绑为下一轮 prompt 的「编辑目标」，宿主在输入栏顶部渲染缩略图胶囊，发送时注入 `metadata.editImageId`（一次性）。需要 `ui.slot.input-action`。
- `ctx.ui.previewImage(ref, group?)`：打开宿主全屏图片预览器（传 `group` 作图片组，带缩略图条与翻页）。
- `useEditImageAttachment()` hook：响应式读当前编辑目标（「选中编辑」高亮的唯一真相源，发送 / 关闭胶囊 / 切会话时自动清）。

## 设置 API

`ctx.settings` 读插件**自身**在 `plugin.json` `contributes.settings` 声明、用户在设置页填写的值（按插件 id 命名空间）。**只读**，写入只能经宿主设置 UI。**不需要权限**。

```ts
interface PluginSettingsApi {
  get<T = unknown>(key: string): T | undefined;
  getAll(): Record<string, unknown>;
  onChange(listener: (values: Record<string, unknown>) => void): Disposable;
}
```

```ts
const apiKey = ctx.settings.get<string>("apiKey");
const sub = ctx.settings.onChange((values) => { /* 配置变更，重读 */ });
```

配置项的 schema（类型、`visibleWhen`、`secret` 等）见 [manifest.md](./manifest.md#contributessettings配置项)。引导用户去填配置用 `ctx.ui.openPluginSettings()`（跳到本插件的设置区）。

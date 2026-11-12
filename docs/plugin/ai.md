# AI 文本能力

`ctx.ai` 让插件调用用户已经在 Vetta 中配置的文本模型。模型发现、默认模型解析、API Key 与登录凭据注入、实际请求都由 Desktop 主进程负责；插件只能看到脱敏后的模型描述与完成结果。

## 权限

- `ai.models.list`：调用 `ctx.ai.listModels()`。
- `ai.complete`：调用 `ctx.ai.complete()`、`ctx.ai.stream()` 或 `ctx.ai.chat()`，可能产生模型费用或消耗用户额度。

两项权限独立。只知道固定模型标识的插件可以仅声明 `ai.complete`；需要自己拿到模型清单（如按能力筛选、做统计）时再同时声明 `ai.models.list`。只是让用户挑一个模型的话，直接用下面的 `ModelPicker`。

## 让用户选模型：`ModelPicker`

`@vetta-org/plugin-sdk` 导出的 `ModelPicker` 就是会话输入栏右下角那个模型选择器，由宿主渲染：模型清单（本地配置 + 登录后的云端目录）、服务商分栏、收藏、搜索、模型详情、推理档位以及主题定制都和宿主其它地方一致，宿主改了这里跟着变。插件只给受控的 `value` / `onChange`，决定选中的 `modelKey` 存到哪。

```tsx
import { ModelPicker } from "@vetta-org/plugin-sdk";

function ModelField({ value, onChange }: { value: string | null; onChange(key: string | null): void }) {
  return (
    <ModelPicker
      value={value}
      onChange={onChange}
      emptyOption={{ label: "跟随默认模型" }} // 可选：列表顶部的空值项，选中回调 null
      ariaLabel="生成模型"
      className="w-full"
    />
  );
}
```

| prop | 说明 |
|---|---|
| `value` / `onChange` | 受控值，`provider/model` 格式；只有提供 `emptyOption` 时才会回调 `null` |
| `reasoning` | `{ value, onChange }`，提供后出现推理档位一栏，选中带档位的模型时菜单保持打开 |
| `emptyOption` | `{ label }`，「跟随默认」这类空值项 |
| `placeholder` | 未选中时触发器上的文案 |
| `defaultModelKey` | 打「默认」徽章的模型，缺省为用户在宿主里设置的默认模型 |
| `autoSelectDefault` | 未选中时自动选上宿主默认模型 |
| `variant` | `field`（默认，表单选择框）或 `inline`（输入栏式无边框胶囊） |
| `className` | 追加到触发器上的类名 |

- 不需要任何权限，也不需要开启 `hostThemeUi`：清单只展示给用户，插件代码只拿到用户选中的那一个 `modelKey`（类比文件选择器）。用这个 key 调模型仍需要 `ai.complete`，交给会话仍需要相应的会话权限。
- 选择器列出的是宿主里所有可选的模型，与 `ctx.ai.listModels()` 的「当前可用文本模型」不完全相同：用户选了一个尚未配置凭据的模型时，`complete` 会照常报错，插件应把错误提示给用户。
- 需要 Desktop 0.5.76 及以上；更早的宿主没有这个导出，插件会在加载时失败。

## 列出模型

```ts
const { defaultModel, models } = await ctx.ai.listModels();

const options = models.map((model) => ({
  value: model.modelKey,
  label: model.name,
  provider: model.provider,
}));
```

列表只包含当前可用且支持文本输入的模型。`modelKey` 使用 `provider/model` 格式；`defaultModel` 只有在用户设置的默认模型当前可用时才返回，否则为 `null`。

## 完成文本

```ts
const result = await ctx.ai.complete({
  modelKey: selectedModelKey,
  systemPrompt: "在不改变含义的前提下优化用户提示词。只返回优化结果。",
  prompt: userPrompt,
  temperature: 0.3,
  maxTokens: 1200,
});

console.log(result.text, result.usage.totalTokens);
```

`modelKey` 可省略，此时宿主使用用户明确设置且当前可用的默认模型；没有可用默认模型时调用会失败。`reasoning` 只会传给声明支持推理的模型，`maxTokens` 不会超过该模型自身的输出上限。

`complete` 是单轮契约（`systemPrompt + prompt`），不接受工具或图片。多轮对话使用下方的 `chat`；插件提供 API Key 仍然不被接受——凭据永远由宿主注入。

## 流式完成

`ctx.ai.stream()` 与 `complete()` 接受相同请求并返回相同的最终结果，但会在生成期间通过
`onTextDelta` 交付增量文本。`delta` 是本次新增片段，`text` 是截至当前事件的完整文本；UI 通常直接使用
`text` 更新同一条消息，完成后再使用 Promise 返回值保存最终结果。

```ts
const controller = new AbortController();

const result = await ctx.ai.stream(
  {
    modelKey: selectedModelKey,
    systemPrompt: "使用 Markdown 回答；公式使用 LaTeX。",
    prompt: userPrompt,
    maxTokens: 1600,
  },
  {
    signal: controller.signal,
    onTextDelta: ({ text }) => updatePreview(text),
  },
);

await saveAnswer(result.text);
```

传入的 `AbortSignal` 取消时，宿主会中止主进程中的 Provider 请求，而不只是停止 UI 更新。事件与最终结果
仍经过 Capability Schema 校验；模型选择、凭据、额度、错误与 usage 语义均和 `complete()` 相同。

## 多轮对话 chat

`ctx.ai.chat()` 是**无状态**的多轮文本完成：宿主不保存任何会话状态，插件自己持有完整消息转写（需要跨重启保留时配合 `ctx.storage` 持久化），每次调用都发送全量 `messages`。权限沿用 `ai.complete`。当前 `chat()` 只返回完整结果；需要边生成边展示的单轮文本使用 `stream()`。

```ts
const messages: PluginAiChatMessage[] = [
  { role: "user", content: "轮到你走棋了。当前局面：…" },
];

const result = await ctx.ai.chat({
  modelKey: selectedModelKey, // 可省略，同 complete 的默认模型解析
  systemPrompt: "你是中国象棋棋手。",
  messages,
  tools: [
    {
      name: "make_move",
      description: "落子。走法使用 ICCS 坐标，如 h2e2。",
      parameters: {
        type: "object",
        properties: { move: { type: "string" } },
        required: ["move"],
      },
    },
  ],
});
```

- `messages` 为全量转写，元素是 `user` / `assistant` / `toolResult` 三种角色；`assistant` 消息可携带其历史 `toolCalls`，`toolResult` 通过 `toolCallId` 与之对应。
- `tools` 是**插件内部工具**：只对本次请求可见，模型触发时宿主不执行任何东西，只把 `toolCalls` 原样返回（`stopReason: "toolUse"`）。插件自行执行，把结果作为 `toolResult` 消息追加进 `messages` 后再次调用 `chat`，形成插件内部 loop。这类工具**不会**注册进宿主 Agent，不影响正常会话。
- `temperature` / `maxTokens` / `reasoning` 语义与 `complete` 一致。

典型 loop：

```ts
for (;;) {
  const turn = await ctx.ai.chat({ systemPrompt, messages, tools });
  messages.push({ role: "assistant", content: turn.text, toolCalls: turn.toolCalls });
  if (turn.stopReason !== "toolUse") break;
  for (const call of turn.toolCalls) {
    const outcome = runLocalTool(call); // 插件内部执行，例如校验并落子
    messages.push({
      role: "toolResult",
      toolCallId: call.id,
      toolName: call.name,
      content: outcome.text,
      isError: outcome.isError,
    });
  }
}
```

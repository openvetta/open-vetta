# CronAgent · 核心逻辑

> 本文档定义 CronAgent 的核心逻辑：类型、工具实现、agentLoop 自校正机制、测试策略和依赖。
> 
> **关联文档**：[cron-agent-ui.md](./cron-agent-ui.md) — desktop-app 集成方案（视图组件、Chat 组件复用、状态映射、路由接入）。

---

## 概述

`CronAgent` 将用户的自然语言调度需求转换为标准 5 段式 cron 表达式。通过 `agentLoop` 驱动模型与工具的交互循环实现自校验：每次模型生成 cron，调用 `describe_cron` 工具获取人类可读描述，模型判断是否符合意图，不符合则继续修正，直到输出正确表达式。

---

## 自校验循环逻辑

```
用户: "每天下午6点执行"
  │
  ▼
模型生成 cron: "0 18 * * *"
  │
  ▼
调用工具: describe_cron(cron="0 18 * * *")
  │
  ▼
工具返回: "每天下午 6:00 执行（每天一次）"
  │
  ▼
模型判断: "描述符合用户意图"？
  ├── 是 → 输出最终结果（结束循环）
  └── 否 → 修正 cron，继续调用工具
```

**关键点**：模型是循环的判断者，`describe_cron` 是唯一的验证手段。循环自然终止于模型不再调用工具且输出中包含有效 cron 表达式。

---

## 文件结构

```
src/
├── agent.ts                 # CronAgent 类（基于 agentLoop）
├── types.ts                # 类型定义
├── tools/
│   └── describe-cron.ts    # describe_cron 工具
└── utils/
    └── parse-cron.ts       # cron 解析与描述生成
```

> 所在包：`packages/desktop-app/src/agents/cron-agent/`（与 renderer 进程共用，可直接 import workspace 依赖）。

---

## 类型定义

```typescript
// types.ts

export interface CronAgentOptions {
  /** 使用的模型，默认 gemini-2.5-flash */
  model?: Model<any>;
  /** 最大循环次数，默认 5 */
  maxIterations?: number;
  /** 自定义 stream 函数 */
  streamFn?: StreamFn;
  /** API Key（Node.js 环境从环境变量读取，可省略） */
  apiKey?: string;
}

export interface CronResult {
  cron: string;
  description: string;
  valid: boolean;
  error?: string;
}

/** CronAgent 对外的事件流 */
export type CronAgentEvents =
  | { type: "iteration"; iteration: number; delta: string }
  | { type: "tool_start"; toolName: string; args: unknown }
  | { type: "tool_end"; toolName: string; result: string }
  | { type: "complete"; result: CronResult }
  | { type: "error"; message: string };
```

---

## 工具：describe_cron

### TypeBox Schema

```typescript
const DescribeCronParams = Type.Object({
  cron: Type.String({
    description: "要解析的 cron 表达式，格式为 5 段：分 时 日 月 周",
  }),
});
```

### 执行逻辑

1. 接收 cron 字符串
2. 验证格式（5 段，每段合法）
3. 解析每段，生成自然语言描述
4. 返回 `AgentToolResult<{ description: string }>`

### 描述格式

| 字段 | 示例值 | 描述 |
|------|--------|------|
| 分 | `0` | 0分 |
| 时 | `18` | 18时（下午6点） |
| 日 | `*` | 每天 |
| 月 | `*` | 每月 |
| 周 | `*` | 每天 |

### 边界情况

| 输入 | 工具行为 |
|------|---------|
| `"0 18 * * *"` | 返回 "每天下午 18:00 执行" |
| `"*/5 * * * *"` | 返回 "每 5 分钟执行一次" |
| `"0 9 * * 1"` | 返回 "每周一上午 09:00 执行" |
| `"invalid"` | 抛出错误 |
| `"60 * * * *"` | 抛出错误：`"Invalid minute value: 60 (must be 0-59)"` |
| `"* * * * * *"` | 抛出错误（只支持5段） |

---

## Agent 逻辑（agent.ts）

### 为什么用 agentLoop 而非 Agent 类

`Agent` 类的 `prompt()` 不暴露 `getFollowUpMessages` 配置项，直接用 `agentLoop` 更透明。

### System Prompt

```typescript
const systemPrompt = `你是一个 cron 表达式专家。用户会描述一个调度需求，你需要生成对应的 cron 表达式。

生成 cron 后，必须调用 describe_cron 工具将表达式转换为人类可读的描述，以验证是否符合用户意图。

如果描述不符合用户意图，修正 cron 表达式后再次调用 describe_cron 工具。

当 cron 表达式准确表达了用户的需求时，在回复中清晰地输出最终结果，格式如下：
【最终结果】
cron: <生成的表达式>
描述: <描述>
【最终结果】

只输出最终结果，不要再调用工具。`;
```

### 初始化

```typescript
export class CronAgent {
  private options: Required<CronAgentOptions>;

  constructor(options: CronAgentOptions = {}) {
    this.options = {
      model: options.model ?? getModel('google', 'gemini-2.5-flash'),
      maxIterations: options.maxIterations ?? 5,
      streamFn: options.streamFn,
      apiKey: options.apiKey,
    };
  }
}
```

### 迭代控制：getFollowUpMessages

`agentLoop` 自然行为：工具调用结束后若无更多消息则退出。自校正通过 `getFollowUpMessages` 注入引导消息，让模型继续。

```typescript
// 共享状态对象：getFollowUpMessages 写入，generate 读取
const state = { iterationCount: 0 };

function buildConfig(context: AgentContext): AgentLoopConfig {
  return {
    model: this.options.model,
    convertToLlm: defaultConvertToLlm,
    apiKey: this.options.apiKey,
    getFollowUpMessages: () => {
      // 达到迭代上限，不再注入引导
      if (state.iterationCount >= this.options.maxIterations) return [];

      // 检测最近一条 toolResult 是否为 describe_cron 结果
      const last = context.messages.at(-1);
      const isDescribeCronResult =
        last?.role === "toolResult" &&
        (last as any).toolName === "describe_cron" &&
        !(last as any).isError;
      if (!isDescribeCronResult) return [];

      state.iterationCount++;
      return [{
        role: "user",
        content: "请检查 describe_cron 工具返回的描述是否符合用户的调度需求。" +
                 "如符合，输出最终结果；如不符合，修正后再次调用工具。",
        timestamp: Date.now(),
      }];
    },
  };
}
```

### 执行方法

```typescript
async *generate(userInput: string): AsyncGenerator<CronAgentEvents> {
  const userMsg: AgentMessage = {
    role: "user",
    content: userInput,
    timestamp: Date.now(),
  };

  const context: AgentContext = {
    systemPrompt,
    messages: [],
    tools: [describeCronTool],
  };

  for await (const event of agentLoop(userMsg, context, config)) {
    if (event.type === "message_update") {
      if (event.assistantMessageEvent.type === "text_delta") {
        yield { type: "iteration", iteration: state.iterationCount, delta: event.assistantMessageEvent.delta };
      }
    }
    if (event.type === "tool_execution_start") {
      yield { type: "tool_start", toolName: event.toolName, args: event.args };
    }
    if (event.type === "tool_execution_end") {
      yield { type: "tool_end", toolName: event.toolName, result: event.result as string };
    }
    if (event.type === "agent_end") {
      const cron = extractCronFromMessages(event.messages);
      if (cron) {
        yield {
          type: "complete",
          result: { cron: cron.expression, description: cron.description, valid: cron.valid },
        };
      } else {
        yield { type: "error", message: "未能在回复中找到有效的 cron 表达式" };
      }
    }
  }
}
```

### 辅助函数：从消息中提取 cron

```typescript
function extractCronFromMessages(messages: AgentMessage[]): {
  expression: string;
  description: string;
  valid: boolean;
} | null {
  const lastAssistant = [...messages].reverse().find(m => m.role === "assistant");
  if (!lastAssistant) return null;

  const text = typeof lastAssistant.content === "string"
    ? lastAssistant.content
    : (lastAssistant.content as any[]).find(c => c.type === "text")?.text ?? "";

  const cronMatch = text.match(/cron:\s*([^\s\n]+)/);
  const descMatch = text.match(/描述:\s*([^\n]+)/);
  if (!cronMatch) return null;

  const expr = cronMatch[1];
  const valid = nodeCron.validate(expr);
  return { expression: expr, description: descMatch?.[1] ?? "", valid };
}
```

### 终止条件

`agentLoop` 正常结束时（`agent_end` 事件），用 `extractCronFromMessages` 从最后一条 assistant 消息提取 cron 表达式。若不存在或不合法，抛出 `error` 事件。

---

## 测试策略

### 工具单元测试（describe-cron.test.ts）

| 用例 | 输入 | 期望 |
|------|------|------|
| 每5分钟 | `"*/5 * * * *"` | 包含 "5 分钟" |
| 每天9点 | `"0 9 * * *"` | 包含 "09:00" 和 "每天" |
| 每周一9点 | `"0 9 * * 1"` | 包含 "周一" 和 "09:00" |
| 每月1日9点 | `"0 9 1 * *"` | 包含 "每月1日" |
| 无效格式 | `"abc"` | 抛出错误 |
| 分钟超范围 | `"60 * * * *"` | 抛出错误 |
| 6段表达式 | `"* * * * * *"` | 抛出错误 |

### Agent 集成测试（agent.test.ts）

| 用例 | 输入 | 期望 |
|------|------|------|
| 简单需求 | "每5分钟" | 输出 `*/5 * * * *` |
| 自然语言 | "每天下午6点" | 输出 `0 18 * * *` |
| 周指定 | "每周一上午9点" | 输出 `0 9 * * 1` |
| 月指定 | "每月1号凌晨0点" | 输出 `0 0 1 * *` |
| 迭代上限 | 触发超过 maxIterations=2 | 第3次工具结果后不再注入引导，模型直接输出最后结果 |

---

## 依赖

```json
{
  "dependencies": {
    "@mariozechner/pi-ai": "workspace:*",
    "@mariozechner/pi-agent-core": "workspace:*",
    "@sinclair/typebox": "^0.34.0",
    "node-cron": "^4.0.0"
  },
  "devDependencies": {
    "@types/node-cron": "^3.0.11",
    "vitest": "^3.0.0"
  }
}
```

> `node-cron@4.x` 不内置 TypeScript 类型，需额外安装 `@types/node-cron`。

---

## 已知限制

1. **6 段 cron（带秒）**：当前只支持标准 5 段式
2. **非标准 cron**：Quartz、AWS EventBridge 等扩展格式不支持
3. **时区**：描述统一使用 24 小时制，不涉及时区转换
4. **最大迭代保护**：`maxIterations` 防止无限循环，但可能在中间停止并返回部分正确结果
5. **模型能力依赖**：生成质量依赖模型对 cron 语法的理解能力

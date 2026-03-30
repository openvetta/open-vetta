# CronAgent · UI 集成

> 本文档定义 CronAgent 的 desktop-app 集成方案：视图组件、Chat 组件复用、事件到原子状态的映射、路由接入。
> 
> **关联文档**：[cron-agent-logic.md](./cron-agent-logic.md) — 核心逻辑（类型、agentLoop、自校正机制、工具实现、测试）。
> 
> **前置依赖**：`cron-agent-logic.md` 中的 `CronAgent` 类、`CronAgentEvents` 类型、`agent.generate()` 方法已实现。

---

## 文件结构

```
packages/desktop-app/src/agents/cron-agent/
├── index.tsx           # 入口：导出 CronAgentView
├── CronAgentView.tsx  # 视图组件
└── agent.ts           # 核心逻辑（见 cron-agent-logic.md）
```

> 与 desktop-app 共用同一 renderer 进程，可直接 import workspace 依赖、`@mariozechner/pi-ai`、`@mariozechner/pi-agent-core`。

---

## 复用的 Chat 组件

| 组件 | 用途 | 必须 |
|------|------|------|
| `MessageList` | 消息列表 + 滚动 + TypingIndicator | **必须** |
| `TextBlockView` | 渲染 assistant 消息的 Markdown 文本块 | **必须** |
| `ThinkingBlockView` | 渲染 thinking 内容（可折叠） | 必须（模型可能带 reasoning） |
| `ToolCallBlockView` | 渲染 `describe_cron` 工具调用及结果 | **必须** |
| `UsageBar` | 显示速度/耗时（依赖 `lastTurnUsageAtom`） | 可选（不填充则不显示） |

### 不需要的组件

- `InputBar`：不允许用户输入，不需要
- `ModelSelector`：CronAgent 固定使用 `gemini-2.5-flash`，不需要
- `SlashPanel`、`AtPanel`：用户无法触发命令，不需要
- `ContextRing`：无上下文管理，不需要

---

## 状态映射

`CronAgentEvents` 映射到 desktop-app 的原子状态：

| CronAgent 事件 | ChatMessage 更新 | atoms 状态 |
|---|---|---|
| 用户输入（首次） | `{ role: "user", text: userInput }` 追加到 messages | 无 |
| `iteration`（text_delta） | `appendTextDelta(messages, delta, draftIdRef)` | `isStreamingAtom = true` |
| `tool_start` | `handleToolStart(messages, toolCallId, toolName, args)` | 无 |
| `tool_end` | `handleToolEnd(messages, toolCallId, result, isError)` | 无 |
| `complete` | 流式已完成 | `isStreamingAtom = false` |
| `error` | 流式已结束 | `isStreamingAtom = false` |

> 直接复用 `packages/desktop-app/src/renderer/lib/chat-stream.ts` 中的工具函数，**无需重新实现**。

---

## CronAgentView

### Props 接口

```typescript
interface CronAgentViewProps {
  /** 用户输入的调度需求 */
  initialPrompt: string;
  /** 关闭回调 */
  onClose: () => void;
  /** 完成回调（传递最终 cron 表达式） */
  onComplete: (cron: string, description: string) => void;
}
```

### 布局

```
┌──────────────────────────────────────┐
│ 顶部栏：标题 + 关闭按钮               │
├──────────────────────────────────────┤
│                                      │
│  MessageList                         │
│   - 用户消息（气泡右侧）              │
│   - Assistant 消息（气泡左侧）        │
│     ├─ TextBlock（Markdown）          │
│     ├─ ThinkingBlock（可折叠）        │
│     └─ ToolCallBlock                  │
│   - 流式中显示 TypingIndicator        │
│                                      │
├──────────────────────────────────────┤
│ 底部栏（无输入框）                   │
│  complete 后： [应用] [重新生成]        │
└──────────────────────────────────────┘
```

### 实现

```typescript
import { useAtom } from "jotai";
import { useEffect, useRef, useState } from "react";
import { chatMessagesAtom, isStreamingAtom } from "../../store/atoms";
import { MessageList } from "../Chat/MessageList";
import { appendTextDelta, handleToolStart, handleToolEnd } from "../../lib/chat-stream";
import { CronAgent } from "./agent";

export function CronAgentView({ initialPrompt, onClose, onComplete }: CronAgentViewProps) {
  const [messages, setMessages] = useAtom(chatMessagesAtom);
  const [isStreaming, setIsStreaming] = useAtom(isStreamingAtom);
  const [isComplete, setIsComplete] = useState(false);
  const [finalResult, setFinalResult] = useState<{ cron: string; description: string } | null>(null);
  const draftIdRef = useRef<string | null>(null);
  const toolCallIdRef = useRef<string>("");

  useEffect(() => {
    setMessages([{ id: `user-${Date.now()}`, role: "user", text: initialPrompt }]);
    setIsStreaming(true);
    setIsComplete(false);

    const agent = new CronAgent();
    const ac = new AbortController();

    (async () => {
      for await (const ev of agent.generate(initialPrompt)) {
        if (ev.type === "iteration") {
          setMessages(prev => appendTextDelta(prev, ev.delta, draftIdRef));
        }
        if (ev.type === "tool_start") {
          toolCallIdRef.current = crypto.randomUUID();
          setMessages(prev => handleToolStart(
            prev,
            toolCallIdRef.current,
            ev.toolName,
            ev.args as Record<string, unknown>,
          ));
        }
        if (ev.type === "tool_end") {
          setMessages(prev => handleToolEnd(prev, toolCallIdRef.current, ev.result, false));
        }
        if (ev.type === "complete") {
          setIsStreaming(false);
          setIsComplete(true);
          setFinalResult({ cron: ev.result.cron, description: ev.result.description });
        }
        if (ev.type === "error") {
          setIsStreaming(false);
        }
      }
    })();

    return () => ac.abort();
  }, [initialPrompt]);

  const handleApply = () => {
    if (finalResult) onComplete(finalResult.cron, finalResult.description);
  };

  const handleRegenerate = () => {
    setMessages([]);
    setIsComplete(false);
    setFinalResult(null);
    draftIdRef.current = null;
    toolCallIdRef.current = "";
    setMessages([{ id: `user-${Date.now()}`, role: "user", text: initialPrompt }]);
    setIsStreaming(true);

    const agent = new CronAgent();
    const ac = new AbortController();

    (async () => {
      for await (const ev of agent.generate(initialPrompt)) {
        if (ev.type === "iteration") {
          setMessages(prev => appendTextDelta(prev, ev.delta, draftIdRef));
        }
        if (ev.type === "tool_start") {
          toolCallIdRef.current = crypto.randomUUID();
          setMessages(prev => handleToolStart(
            prev,
            toolCallIdRef.current,
            ev.toolName,
            ev.args as Record<string, unknown>,
          ));
        }
        if (ev.type === "tool_end") {
          setMessages(prev => handleToolEnd(prev, toolCallIdRef.current, ev.result, false));
        }
        if (ev.type === "complete") {
          setIsStreaming(false);
          setIsComplete(true);
          setFinalResult({ cron: ev.result.cron, description: ev.result.description });
        }
        if (ev.type === "error") {
          setIsStreaming(false);
        }
      }
    })();
  };

  return (
    <div className="relative flex h-full min-w-0 flex-1 flex-col bg-[var(--content-bg)]">
      {/* 顶部栏 */}
      <div
        className="drag-region pointer-events-none absolute inset-x-0 top-0 z-10"
        style={{
          background: "linear-gradient(to bottom, var(--content-bg) 40%, transparent 100%)",
          paddingTop: 20,
          paddingBottom: 20,
          paddingLeft: 16,
          paddingRight: 16,
        }}
      >
        <div className="pointer-events-auto no-drag flex items-center justify-between">
          <span className="text-[14px] font-semibold text-[var(--text-1)]">Cron 表达式生成</span>
          <button
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-[var(--hover-strong)]"
          >
            <span className="icon-[mdi--close] text-[14px]" />
          </button>
        </div>
      </div>

      {/* 消息列表 */}
      <MessageList messages={messages} isStreaming={isStreaming} />

      {/* 底部：结果确认 */}
      <div className="px-4 pb-4 pt-1">
        {isComplete && finalResult && (
          <div className="mx-auto flex max-w-2xl items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-[12px] text-[var(--text-3)]">生成结果</span>
              <code className="font-mono text-[13px] text-[var(--text-1)]">{finalResult.cron}</code>
              <span className="text-[11px] text-[var(--text-3)]">{finalResult.description}</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleRegenerate}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] text-[var(--text-2)] transition-colors hover:bg-[var(--hover)]"
              >
                <span className="icon-[mdi--refresh] h-4 w-4" />
                重新生成
              </button>
              <button
                onClick={handleApply}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors"
                style={{
                  background: "var(--accent)",
                  color: "var(--accent-fg)",
                }}
              >
                <span className="icon-[mdi--check] h-4 w-4" />
                应用
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## 路由接入

### atoms.ts 扩展 PageView

```typescript
// packages/desktop-app/src/renderer/store/atoms.ts
export type PageView = "chat" | "automation" | "skills" | "settings" | "cron-agent";
```

### 主 App switch

```typescript
// 主 App 组件
switch (pageView) {
  case "cron-agent":
    return <CronAgentView
      initialPrompt={pendingCronPrompt}
      onClose={() => { setPageView("automation"); setPendingCronPrompt(""); }}
      onComplete={(cron, desc) => {
        setCronValue(cron);
        setPageView("automation");
      }}
    />;
  // ...
}
```

### TaskForm 触发

在 `TaskForm.tsx`（`packages/desktop-app/src/renderer/components/AutomationPage/TaskForm.tsx`）中，点击"自定义"按钮时：

```typescript
// TaskForm.tsx
const handleOpenCronAgent = () => {
  setPendingCronPrompt(cronInput);
  setPageView("cron-agent");
};
```

---

## 入口导出

```typescript
// index.tsx
export { CronAgentView } from "./CronAgentView";
```

---

## 已知 UI 细节

1. **共享 atoms 状态**：使用 `chatMessagesAtom` 和 `isStreamingAtom`，会与主 Chat 页面共享。退出 CronAgentView 时无需清理（主 Chat 页面会覆盖）。
2. **UsageBar**：`lastTurnUsageAtom` 不会被 CronAgent 填充，UsageBar 不显示。
3. **toolCallId**：使用 `crypto.randomUUID()` 生成，与 agentLoop 返回的 toolCallId 无需对应——`handleToolStart` 和 `handleToolEnd` 通过 `toolCallIdRef` 内部关联。

# Context

This is a living glossary. Each term is a deliberately-chosen canonical name for a concept in the system. When you find yourself reaching for a vague word ("info", "data", "meta"), check here first.

## Glossary

### ToolTimingEntry

A `SessionEntry` (parallel to `thinking_level_change` / `model_change`, not a `message`) written to a session's jsonl by `agent-session` at `tool_execution_end`. Carries `toolCallId`, `startedAt` (absolute ms), `durationMs`, and `phases` (relative offsets, see `phase`).

ToolTimingEntry exists in a separate channel from `Message` deliberately so that LLM providers — which only consume `message` entries — never see it. This is a hard architectural boundary, not a filter to be maintained.

### phase

A user-defined interval inside a tool's `execute`. Tools call `ctx.phase(label)` to mark "from this moment on, I'm doing `label`"; the next call (or `tool_execution_end`) implicitly ends the previous interval. Persisted as `phases: [{ label, atMs }]` where `atMs` is the offset from `startedAt` in ms. Duration of each interval is computed at read time by diffing consecutive `atMs` (last interval uses `durationMs`).

### conspicuous duration

The user-facing threshold above which a tool call shows a duration badge on the `ToolCallBlock` header. Default 1000 ms. Below the threshold, the badge is hidden but the meta panel still has the data when expanded.

Threshold is a UI display rule, never a write-time filter. Every `tool_execution_end` produces a `ToolTimingEntry` regardless of duration.

### meta panel (of a tool_call block)

The region revealed when a user expands a `tool_call` block. First row is a labelled meta zone showing `startedAt` (absolute time), full-precision `durationMs`, and `phases` as a centred-dot string ("download 2.1s · ocr 12.3s · write 0.8s"). This row is explicitly out-of-band — never sent to the LLM.

### ctx (in a tool's `execute` signature)

The fourth positional argument introduced for timing support: `execute(toolCallId, input, signal, ctx)`. Currently exposes `ctx.phase(label)`. Older tools that don't accept `ctx` continue to work — their timing data is just `[startedAt, durationMs]` with empty `phases`.

### mentionedFile

A user-attached file or directory reference carried alongside a chat prompt. Shape: `{ path: string; name: string; isDirectory: boolean }`. `path` is always an **absolute filesystem path** and is **not constrained to the session's cwd** — it may originate from an `@`-mention inside cwd, an internal File Explorer drag, or an external OS drag-drop. Rendered in `InputBar` as a `Capsule` with a native `title` tooltip exposing the full path. Consumed in `sendPrompt` by being prepended to the user message as `@${path}` lines (one per entry) — the agent then decides whether to read each path via its own tools.

`mentionedFile` is distinct from `attachedImage`: dropping an `image/*` MIME file still routes to `attachedImage` (DataURL multimodal attachment), not to `mentionedFile`. The two channels coexist in `InputBar` capsules but serialize differently at send time.

### 结论 (assistant turn conclusion)

一轮 assistant 回答「已经有结论」的判定：本轮 streaming 已结束，即 `!(isLastAssistant && isStreaming)`。与 [[AssistantFoldTip]] 的 `state: "complete"` 同源，不引入新状态。

定义刻意**不**要求 `foldData.outputBlocks` 非空 —— 纯工具调用收尾（agent 调完工具就 stop、没有 final text）的轮次同样算「有结论」，仍允许用户对该轮内容触发操作（如复制工具输出摘要）。复制按钮在 streaming 期间隐藏，是为了避免用户复制到半句话；轮次结束后内容已稳定，即便没有 final text 也已稳定。

历史 assistant 消息天然满足该判定，不需要额外的 per-message "done" 标志。

### MessageActions

挂在每条 chat message（user / assistant）底部的一排 icon-only 操作按钮，hover 出 tooltip。当前只有「复制」一个按钮，设计为可扩展（后续可能加 regenerate / 评分 / 分享 等）。

与 `ActionButtonBar`（全局粘性条，受 `visibleActionButtonsAtom` 驱动，主色实心 pill）是**完全不同的概念** —— 不要混用 "ActionBar" 命名。前者是"消息附属工具"（灰、轻量），后者是"召唤主动操作"（主色、显眼）。

显示策略：
- User message：hover 整行才显示，绝对定位浮在 bubble 下方不占布局。复制源 = `displayText`（`parseUserPrefixes` 之后的 body，剥掉 `/skill:` 和 `@file` 行）。
- Assistant message：本轮[[结论]]已出现后常驻显示。复制源 = `foldData.outputBlocks` 拼接出的结论文本。

按钮不存在的情形（整条 bar 不渲染）：`role === "compaction"`、user 仅图片或完全空、assistant 仅含 error block、assistant 纯工具轮（outputBlocks 为空）。这是"按钮无可复制内容"的自然 fall-out，不是 hasConclusion 判定的例外。

### drop overlay (of ChatPage)

A full-`ChatPage` overlay rendered while an OS-level drag carrying `Files` (or an internal drag carrying the `application/vetta-path` MIME) is hovering. Provides the visual affordance "release to reference"; on drop, each dragged item becomes a `mentionedFile` (or an `attachedImage` for image MIME). Triggers regardless of whether a session is currently active — items dropped on `NewSessionPage` stay in `mentionedFilesAtom` and are picked up by the next `sendPrompt`. Internal drags from File Explorer are detected via the `application/vetta-path` MIME and bypass `webUtils.getPathForFile`, reading the path directly from the dataTransfer payload.

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

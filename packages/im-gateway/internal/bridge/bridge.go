package bridge

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"vetta-im-gateway/internal/hostclient"
	"vetta-im-gateway/internal/transport"
)

// EditThrottle is the minimum gap between successive edit calls when the
// transport supports message editing. Default mirrors the typical IM rate
// limit window.
const EditThrottle = 800 * time.Millisecond

// Bridge translates a stream of agent events into outbound IM messages.
//
// One Bridge instance per (transport, chatID) pair; constructed at the
// router level when an inbound message arrives, run for the duration of
// the agent's response, then discarded.
//
// Two output strategies, picked at construction time from the transport's
// Capabilities:
//
//  1. Edit-in-place: send one initial message, then edit it as text deltas
//     arrive. Throttled to ≥ EditThrottle between edit calls. The transport
//     must declare SupportsMessageEdit=true.
//
//  2. Chunk fallback: buffer text until a flush boundary or the transport's
//     MaxMessageLength, then SendMessage a new chunk. This is what mock /
//     telegram / most simple platforms get.
//
// thinking_delta is emitted as a separate message. Tool execution events
// flush pending output and emit a one-line tool summary.
type Bridge struct {
	tr     transport.Transport
	chatID string
	caps   transport.Capabilities

	// streaming state
	buf           strings.Builder
	thinkingBuf   strings.Builder
	editMessageID string    // empty if not yet sent
	lastEdit      time.Time // throttle anchor for edit mode

	// pendingErrors accumulates error events seen during this turn. We
	// deliberately do NOT push each error to the user as a separate IM
	// card: coding-agent's startup pipeline (skill / extension / theme
	// loading, model probe retries) emits non-fatal `type:"error"`
	// events that it then recovers from, and forwarding each one
	// floods the chat with "(agent error)" bubbles before the real
	// reply. We surface them only if the whole turn produces no text
	// (see flushAll). Reset to nil on any successful text send.
	pendingErrors []string

	// anyOutputSent tracks whether this turn produced any user-visible
	// IM message (text / chunk / tool summary). Drives the
	// "suppress transient errors" rule above.
	anyOutputSent bool
}

// New constructs a Bridge for one outbound conversation.
func New(tr transport.Transport, chatID string) *Bridge {
	return &Bridge{
		tr:     tr,
		chatID: chatID,
		caps:   tr.Capabilities(),
	}
}

// Run consumes events until the agent's turn ends and emits IM messages
// along the way. A turn ends on the first of:
//
//   - an agent_end event (the agent finished one prompt's worth of work;
//     the subprocess stays alive for the next prompt — this is the normal
//     happy path and is what allows multi-turn conversations to work)
//   - the events channel closing (subprocess died)
//   - ctx cancellation
//
// Returns the first error encountered along the way (subsequent errors
// are swallowed; the bridge tries to deliver as much as possible before
// reporting). Run is intended to be called from one goroutine; the caller
// owns goroutine lifetime.
func (b *Bridge) Run(ctx context.Context, events <-chan hostclient.AgentEvent) error {
	var firstErr error
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case ev, ok := <-events:
			if !ok {
				// Channel closed: subprocess exited unexpectedly. Flush
				// whatever we still have buffered so the user sees a final
				// state instead of a silent dropoff.
				if err := b.flushAll(ctx); err != nil && firstErr == nil {
					firstErr = err
				}
				return firstErr
			}
			if err := b.handle(ctx, ev); err != nil && firstErr == nil {
				firstErr = err
			}
			// agent_end marks the end of one turn. The subprocess is still
			// alive and we MUST return so the per-conversation goroutine can
			// process the next inbound message; otherwise users can only
			// ever exchange one message per session.
			if ev.Type == hostclient.AgentEventTypeAgentEnd {
				return firstErr
			}
		}
	}
}

func (b *Bridge) handle(ctx context.Context, ev hostclient.AgentEvent) error {
	switch ev.Type {
	case hostclient.AgentEventTypeMessageUpdate:
		eventType, delta := extractAssistantMessageDelta(ev.Raw)
		switch eventType {
		case "text_delta":
			if delta == "" {
				return nil
			}
			return b.appendText(ctx, delta)
		case "thinking_delta":
			if delta == "" {
				return nil
			}
			return b.appendThinking(ctx, delta)
		default:
			return nil
		}

	case hostclient.AgentEventTypeMessageEnd:
		// End of one assistant message. Two responsibilities here:
		// 1) If the agent emitted a message-level error (stopReason ==
		//    "error" with an errorMessage) — e.g. the LLM call returned
		//    a fetch failure / 4xx / rate limit — record it so the
		//    user sees something other than silence. The bridge only
		//    surfaces it if the turn ends with no other text output
		//    (same suppression policy as type:"error" events).
		// 2) flush so the next message starts fresh in chunk mode and
		//    edit mode commits final state.
		if errText := extractMessageEndError(ev.Raw); errText != "" {
			b.pendingErrors = append(b.pendingErrors, errText)
		}
		return b.flushAll(ctx)

	case hostclient.AgentEventTypeToolExecutionStart:
		if err := b.flushAll(ctx); err != nil {
			return err
		}
		return b.sendToolCallSummary(ctx, ev.Raw)

	case hostclient.AgentEventTypeToolExecutionEnd:
		// Same: flush so any text the agent emits while still mid-turn
		// is visible.
		return b.flushAll(ctx)

	case hostclient.AgentEventTypeAgentEnd:
		return b.flushAll(ctx)

	case hostclient.AgentEventTypeError:
		// Buffer the error rather than sending immediately. Most error
		// events the upstream agent emits during startup are recovered
		// from before the turn ends; forwarding each one floods the
		// chat with redundant "(agent error)" cards.
		text := extractErrorText(ev.Raw)
		if text == "" {
			// Fallback: include a truncated raw snippet so the next
			// person debugging this can see what actually happened.
			snippet := string(ev.Raw)
			if len(snippet) > 240 {
				snippet = snippet[:240] + "…"
			}
			text = "(agent error) " + snippet
		}
		b.pendingErrors = append(b.pendingErrors, text)
		return nil
	}
	return nil
}

// markOutputSent records that this turn produced a visible IM message.
// Drops any buffered transient errors — the agent clearly recovered.
func (b *Bridge) markOutputSent() {
	b.anyOutputSent = true
	b.pendingErrors = nil
}

// appendText incorporates a text delta into the bridge's buffer and
// (depending on capabilities) either edits the live message or sends a
// new chunk if the buffer crossed a threshold.
func (b *Bridge) appendText(ctx context.Context, delta string) error {
	if b.thinkingBuf.Len() > 0 {
		if err := b.flushThinking(ctx); err != nil {
			return err
		}
	}
	b.buf.WriteString(delta)

	if b.caps.SupportsMessageEdit {
		return b.maybeEdit(ctx, false)
	}
	return b.maybeChunk(ctx)
}

func (b *Bridge) appendThinking(ctx context.Context, delta string) error {
	if b.buf.Len() > 0 {
		if err := b.flushText(ctx); err != nil {
			return err
		}
	}
	b.thinkingBuf.WriteString(delta)
	return nil
}

// maybeEdit sends or edits the in-flight message. force=true bypasses
// the throttle (used by flush).
func (b *Bridge) maybeEdit(ctx context.Context, force bool) error {
	now := time.Now()
	if !force && !b.lastEdit.IsZero() && now.Sub(b.lastEdit) < EditThrottle {
		return nil
	}
	text := b.buf.String()
	if text == "" {
		return nil
	}
	if b.caps.MaxMessageLength > 0 && len(text) > b.caps.MaxMessageLength {
		// Even in edit mode, respect a hard cap. Send the head, then
		// switch to a fresh message for the tail. This is a rare path
		// but feishu does have a (large) cap.
		head := text[:b.caps.MaxMessageLength]
		tail := text[b.caps.MaxMessageLength:]
		if err := b.commitEdit(ctx, head); err != nil {
			return err
		}
		b.editMessageID = ""
		b.buf.Reset()
		b.buf.WriteString(tail)
		return b.maybeEdit(ctx, true)
	}
	return b.commitEdit(ctx, text)
}

func (b *Bridge) commitEdit(ctx context.Context, text string) error {
	if b.editMessageID == "" {
		// First frame of a streaming response — hint the transport so it
		// can pick its dedicated streaming path (e.g. cardkit on Feishu).
		id, err := b.tr.SendMessage(ctx, b.chatID, transport.OutboundMessage{Text: text, Streaming: true})
		if err != nil {
			return err
		}
		b.editMessageID = id
	} else {
		if err := b.tr.EditMessage(ctx, b.chatID, b.editMessageID, transport.OutboundMessage{Text: text, Streaming: true}); err != nil {
			return err
		}
	}
	b.markOutputSent()
	b.lastEdit = time.Now()
	return nil
}

// maybeChunk emits messages ONLY when the buffer would exceed the
// platform's hard length limit. Otherwise it accumulates silently and
// waits for flush() to emit the buffered text as a single coherent
// message at a natural boundary (tool execution, message_end, agent_end).
//
// We deliberately do NOT auto-split on paragraph boundaries: doing so
// would chop a single coherent assistant answer into a flood of small
// IM messages whenever the agent uses markdown. Sending one message per
// assistant turn is much friendlier in IM contexts.
func (b *Bridge) maybeChunk(ctx context.Context) error {
	limit := b.caps.MaxMessageLength
	if limit <= 0 {
		// No hard cap — just keep buffering until flush.
		return nil
	}
	for b.buf.Len() >= limit {
		text := b.buf.String()
		// Try to split at the last newline within the limit so we don't
		// chop mid-line; fall back to a hard cut if the limit is reached
		// without any newline.
		split := limit
		candidate := text[:limit]
		if nl := strings.LastIndex(candidate, "\n"); nl > 0 {
			split = nl + 1
		}
		head := strings.TrimRight(text[:split], "\n")
		if head != "" {
			if _, err := b.tr.SendMessage(ctx, b.chatID, transport.OutboundMessage{Text: head}); err != nil {
				return err
			}
			b.markOutputSent()
		}
		tail := text[split:]
		b.buf.Reset()
		b.buf.WriteString(tail)
	}
	return nil
}

// flush emits whatever is in the buffer immediately, regardless of
// throttle / chunk thresholds. Called on tool execution boundaries,
// message_end, and on the events channel closing.
func (b *Bridge) flushAll(ctx context.Context) error {
	if err := b.flushThinking(ctx); err != nil {
		return err
	}
	return b.flushText(ctx)
}

func (b *Bridge) flushThinking(ctx context.Context) error {
	text := strings.TrimSpace(b.thinkingBuf.String())
	if text == "" {
		b.thinkingBuf.Reset()
		return nil
	}
	b.thinkingBuf.Reset()
	_, err := b.tr.SendMessage(ctx, b.chatID, transport.OutboundMessage{
		Text: "思考：\n" + text,
	})
	return err
}

func (b *Bridge) flushText(ctx context.Context) error {
	if b.caps.SupportsMessageEdit {
		if err := b.maybeEdit(ctx, true); err != nil {
			return err
		}
		// Tell the transport this streaming response is done so it can
		// clean up server-side state (e.g. flip cardkit's streaming_mode
		// off so the typewriter cursor stops blinking). EndStream is a
		// no-op when there's no streaming message in flight.
		if b.editMessageID != "" {
			if err := b.tr.EndStream(ctx, b.chatID, b.editMessageID); err != nil {
				return err
			}
		}
		// Reset edit state so the next message starts a new bubble.
		b.editMessageID = ""
		b.buf.Reset()
		b.lastEdit = time.Time{}
		return b.flushPendingErrors(ctx)
	}
	text := b.buf.String()
	if text == "" {
		return b.flushPendingErrors(ctx)
	}
	b.buf.Reset()
	if _, err := b.tr.SendMessage(ctx, b.chatID, transport.OutboundMessage{Text: text}); err != nil {
		return err
	}
	b.markOutputSent()
	return nil
}

// flushPendingErrors emits a single consolidated error message when the
// turn ended with no user-visible output and at least one error event
// was buffered. No-op when output was produced (errors get dropped by
// markOutputSent) or when no errors were seen.
func (b *Bridge) flushPendingErrors(ctx context.Context) error {
	if b.anyOutputSent || len(b.pendingErrors) == 0 {
		b.pendingErrors = nil
		return nil
	}
	combined := strings.Join(b.pendingErrors, "\n")
	b.pendingErrors = nil
	_, err := b.tr.SendMessage(ctx, b.chatID, transport.OutboundMessage{Text: combined})
	return err
}

func (b *Bridge) sendToolCallSummary(ctx context.Context, raw json.RawMessage) error {
	toolName := extractToolName(raw)
	if toolName == "" {
		toolName = "unknown"
	}
	if _, err := b.tr.SendMessage(ctx, b.chatID, transport.OutboundMessage{
		Text: "调用工具：`" + toolName + "`",
	}); err != nil {
		return err
	}
	b.markOutputSent()
	return nil
}

// extractAssistantMessageDelta extracts the message_update subtype and delta.
//
// The upstream agent emits several flavors of message_update during a turn:
//
//   - text_delta:     incremental user-visible text
//   - thinking_delta: incremental reasoning text
//   - toolcall_delta: incremental JSON args of an in-flight tool call
//   - *_start / *_end: lifecycle bookends, no delta payload
//
// The bridge decides how to render each subtype; toolcall_delta remains
// hidden so users do not see partial JSON arguments.
func extractAssistantMessageDelta(raw json.RawMessage) (eventType string, delta string) {
	var v struct {
		AssistantMessageEvent struct {
			Type  string `json:"type"`
			Delta string `json:"delta"`
		} `json:"assistantMessageEvent"`
	}
	if err := json.Unmarshal(raw, &v); err != nil {
		return "", ""
	}
	return v.AssistantMessageEvent.Type, v.AssistantMessageEvent.Delta
}

func extractToolName(raw json.RawMessage) string {
	var v struct {
		ToolName string `json:"toolName"`
	}
	if err := json.Unmarshal(raw, &v); err != nil {
		return ""
	}
	return strings.TrimSpace(v.ToolName)
}

// extractMessageEndError pulls a user-facing error string from a
// `message_end` event whose payload is a fully-formed AssistantMessage
// with stopReason == "error". Returns "" when the message ended normally.
//
// Shape we read (subset of @vetta/coding-agent's AssistantMessage):
//
//	{ "message": { "stopReason": "error", "errorMessage": "Connection error." } }
//
// We deliberately ignore other stop reasons (aborted / end_turn / etc.)
// — those are normal terminations, no IM-side notice needed.
func extractMessageEndError(raw json.RawMessage) string {
	var v struct {
		Message struct {
			StopReason   string `json:"stopReason"`
			ErrorMessage string `json:"errorMessage"`
		} `json:"message"`
	}
	if err := json.Unmarshal(raw, &v); err != nil {
		return ""
	}
	if v.Message.StopReason != "error" {
		return ""
	}
	if v.Message.ErrorMessage != "" {
		return v.Message.ErrorMessage
	}
	// stopReason=error but no explicit message — surface a generic note
	// rather than going silent so the user at least knows something
	// broke. Should be rare; coding-agent normally fills errorMessage.
	return "⚠ 模型调用失败（无具体错误信息）"
}

// extractErrorText pulls a human-readable error string from an error event.
func extractErrorText(raw json.RawMessage) string {
	var v struct {
		Error   string `json:"error"`
		Message string `json:"message"`
		Data    struct {
			Error   string `json:"error"`
			Message string `json:"message"`
		} `json:"data"`
	}
	if err := json.Unmarshal(raw, &v); err != nil {
		return ""
	}
	if v.Error != "" {
		return v.Error
	}
	if v.Message != "" {
		return v.Message
	}
	if v.Data.Error != "" {
		return v.Data.Error
	}
	return v.Data.Message
}

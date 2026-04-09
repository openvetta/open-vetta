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
//  2. Chunk fallback: buffer text until a paragraph boundary or the
//     transport's MaxMessageLength, then SendMessage a new chunk. This is
//     what mock / telegram / most simple platforms get.
//
// Tool execution events flush the buffer or force a final edit immediately
// so the user sees progress between long-running tools.
type Bridge struct {
	tr     transport.Transport
	chatID string
	caps   transport.Capabilities

	// streaming state
	buf            strings.Builder
	editMessageID  string    // empty if not yet sent
	lastEdit       time.Time // throttle anchor for edit mode
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
				if err := b.flush(ctx); err != nil && firstErr == nil {
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
		text := extractTextDelta(ev.Raw)
		if text == "" {
			return nil
		}
		return b.appendText(ctx, text)

	case hostclient.AgentEventTypeMessageEnd:
		// End of one assistant message — flush so the next message
		// starts fresh in chunk mode and edit mode commits final state.
		return b.flush(ctx)

	case hostclient.AgentEventTypeToolExecutionStart:
		// Force-flush any buffered text so the user sees a "thinking"
		// state before the tool runs.
		if err := b.flush(ctx); err != nil {
			return err
		}
		// Optional: emit a "(running tool)" status. Skipped for first
		// milestone — the agent itself usually narrates tool calls in
		// its assistant text.
		return nil

	case hostclient.AgentEventTypeToolExecutionEnd:
		// Same: flush so any text the agent emits while still mid-turn
		// is visible.
		return b.flush(ctx)

	case hostclient.AgentEventTypeAgentEnd:
		return b.flush(ctx)

	case hostclient.AgentEventTypeError:
		// Surface errors verbatim to the user. The exact shape varies
		// upstream so we just dump the raw text.
		text := extractErrorText(ev.Raw)
		if text == "" {
			text = "(agent error)"
		}
		_, err := b.tr.SendMessage(ctx, b.chatID, transport.OutboundMessage{Text: text})
		return err
	}
	return nil
}

// appendText incorporates a text delta into the bridge's buffer and
// (depending on capabilities) either edits the live message or sends a
// new chunk if the buffer crossed a threshold.
func (b *Bridge) appendText(ctx context.Context, delta string) error {
	b.buf.WriteString(delta)

	if b.caps.SupportsMessageEdit {
		return b.maybeEdit(ctx, false)
	}
	return b.maybeChunk(ctx)
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
func (b *Bridge) flush(ctx context.Context) error {
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
		return nil
	}
	text := b.buf.String()
	if text == "" {
		return nil
	}
	b.buf.Reset()
	_, err := b.tr.SendMessage(ctx, b.chatID, transport.OutboundMessage{Text: text})
	return err
}

// extractTextDelta extracts USER-FACING text from a message_update event.
//
// The upstream agent emits several flavors of message_update during a turn:
//
//   - text_delta:     incremental user-visible text (what we want)
//   - thinking_delta: the agent's internal reasoning ("chain of thought")
//   - toolcall_delta: incremental JSON args of an in-flight tool call
//   - *_start / *_end: lifecycle bookends, no delta payload
//
// Only text_delta should reach the IM. Forwarding thinking_delta would
// leak the agent's monologue to users; forwarding toolcall_delta would
// dump JSON fragments into the chat.
//
// To stay forward-compatible we filter by the explicit subtype field,
// returning the empty string for everything except text_delta.
func extractTextDelta(raw json.RawMessage) string {
	var v struct {
		AssistantMessageEvent struct {
			Type  string `json:"type"`
			Delta string `json:"delta"`
		} `json:"assistantMessageEvent"`
	}
	if err := json.Unmarshal(raw, &v); err != nil {
		return ""
	}
	if v.AssistantMessageEvent.Type == "text_delta" {
		return v.AssistantMessageEvent.Delta
	}
	return ""
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

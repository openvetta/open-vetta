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

// Run consumes events from the channel until it closes (the agent
// finished its turn) and emits IM messages along the way. Returns the
// last error encountered, if any. Earlier errors are logged into the
// transport via SendMessage but not aborted.
//
// Run is intended to be called from one goroutine. Caller is responsible
// for goroutine lifetime.
func (b *Bridge) Run(ctx context.Context, events <-chan hostclient.AgentEvent) error {
	var firstErr error
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case ev, ok := <-events:
			if !ok {
				// Channel closed: agent ended its turn or session died.
				if err := b.flush(ctx); err != nil && firstErr == nil {
					firstErr = err
				}
				return firstErr
			}
			if err := b.handle(ctx, ev); err != nil && firstErr == nil {
				firstErr = err
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
		id, err := b.tr.SendMessage(ctx, b.chatID, transport.OutboundMessage{Text: text})
		if err != nil {
			return err
		}
		b.editMessageID = id
	} else {
		if err := b.tr.EditMessage(ctx, b.chatID, b.editMessageID, transport.OutboundMessage{Text: text}); err != nil {
			return err
		}
	}
	b.lastEdit = time.Now()
	return nil
}

// maybeChunk emits a new outbound message when the buffer crosses a
// paragraph boundary or the platform's max length. Used in fallback mode
// (no message editing).
func (b *Bridge) maybeChunk(ctx context.Context) error {
	for {
		text := b.buf.String()
		limit := b.caps.MaxMessageLength
		if limit <= 0 {
			limit = 4000
		}

		// Two flush triggers: paragraph boundary anywhere within limit,
		// or len ≥ limit (force a hard split).
		split := -1
		if idx := strings.LastIndex(text, "\n\n"); idx > 0 && idx <= limit {
			split = idx + 2 // include the blank line
		} else if len(text) >= limit {
			// Try to split at the last newline within limit, else hard cut.
			candidate := text[:limit]
			if nl := strings.LastIndex(candidate, "\n"); nl > 0 {
				split = nl + 1
			} else {
				split = limit
			}
		}
		if split < 0 {
			return nil
		}

		head := strings.TrimRight(text[:split], "\n")
		if head != "" {
			if _, err := b.tr.SendMessage(ctx, b.chatID, transport.OutboundMessage{Text: head}); err != nil {
				return err
			}
		}
		// Reset buffer to the unsent tail.
		tail := text[split:]
		b.buf.Reset()
		b.buf.WriteString(tail)
		if tail == "" {
			return nil
		}
	}
}

// flush emits whatever is in the buffer immediately, regardless of
// throttle / chunk thresholds. Called on tool execution boundaries,
// message_end, and on the events channel closing.
func (b *Bridge) flush(ctx context.Context) error {
	if b.caps.SupportsMessageEdit {
		if err := b.maybeEdit(ctx, true); err != nil {
			return err
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

// extractTextDelta extracts the text content from a message_update event.
// The upstream rpc protocol nests the text inside an `assistantMessageEvent`
// object with `type:"text_delta"` and a `delta` string. We accept either
// shape (some upstream versions vary) and fall back to a top-level "text"
// or "data.text" field.
func extractTextDelta(raw json.RawMessage) string {
	var v struct {
		AssistantMessageEvent struct {
			Type  string `json:"type"`
			Delta string `json:"delta"`
			Text  string `json:"text"`
		} `json:"assistantMessageEvent"`
		Data struct {
			Text string `json:"text"`
		} `json:"data"`
		Text string `json:"text"`
	}
	if err := json.Unmarshal(raw, &v); err != nil {
		return ""
	}
	if v.AssistantMessageEvent.Delta != "" {
		return v.AssistantMessageEvent.Delta
	}
	if v.AssistantMessageEvent.Text != "" {
		return v.AssistantMessageEvent.Text
	}
	if v.Data.Text != "" {
		return v.Data.Text
	}
	return v.Text
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

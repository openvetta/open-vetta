package router

import (
	"context"
	"errors"
	"strings"
	"unicode/utf8"

	"vetta-im-gateway/internal/transport"
)

// ErrNoDeliveryChat means the request named no chat to send an automation
// result to.
var ErrNoDeliveryChat = errors.New("no chat to deliver to")

// DeliveryChatHandler receives chats proposed as the automation delivery
// target. explicit is true when the user ran /notify in that chat; otherwise
// it is a private chat that just sent a message. The host owns the decision
// and persists the target; the router keeps no copy.
type DeliveryChatHandler func(chatID, userID string, explicit bool)

// SetDeliveryChatHandler installs the proposal hook. Only private chats are
// proposed implicitly, so a group mention never becomes the target by
// accident; groups can still be chosen explicitly with /notify.
func (r *Router) SetDeliveryChatHandler(handler DeliveryChatHandler) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.onDeliveryChat = handler
}

// DeliverAutomationResult sends text to chatID on the active transport. Text
// longer than the channel's message limit is sent as several messages.
func (r *Router) DeliverAutomationResult(ctx context.Context, chatID, text string) error {
	if chatID == "" {
		return ErrNoDeliveryChat
	}
	activeTransport := r.getTransport()
	for _, part := range splitAtMessageLimit(text, activeTransport.Capabilities().MaxMessageLength) {
		if _, err := activeTransport.SendMessage(ctx, chatID, transport.OutboundMessage{Text: part}); err != nil {
			return err
		}
	}
	return nil
}

// splitAtMessageLimit follows the bridge's chunking rule: each part is at
// most limit bytes, preferably ending at a newline, and never splits a UTF-8
// character. A limit of 0 means the channel has no length cap.
func splitAtMessageLimit(text string, limit int) []string {
	if limit <= 0 || len(text) <= limit {
		return []string{text}
	}
	var parts []string
	for len(text) > limit {
		cut := limit
		for cut > 0 && !utf8.RuneStart(text[cut]) {
			cut--
		}
		if newline := strings.LastIndex(text[:cut], "\n"); newline > 0 {
			cut = newline + 1
		}
		if part := strings.TrimRight(text[:cut], "\n"); part != "" {
			parts = append(parts, part)
		}
		text = text[cut:]
	}
	if strings.TrimSpace(text) != "" {
		parts = append(parts, text)
	}
	return parts
}

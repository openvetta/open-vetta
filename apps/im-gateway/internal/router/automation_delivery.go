package router

import (
	"context"
	"errors"
	"strings"
	"unicode/utf8"

	"vetta-im-gateway/internal/transport"
)

// ErrNoDeliveryChat means the active channel has no chat to send an
// automation result to.
var ErrNoDeliveryChat = errors.New("no chat to deliver to")

// DeliverAutomationResult sends text to the chat that most recently messaged
// the gateway. Until a message arrives after a restart, it uses the routed
// chat when the routing table holds exactly one. Text longer than the
// channel's message limit is sent as several messages.
func (r *Router) DeliverAutomationResult(ctx context.Context, text string) error {
	chatID, err := r.automationDeliveryChatID(ctx)
	if err != nil {
		return err
	}
	activeTransport := r.getTransport()
	for _, part := range splitAtMessageLimit(text, activeTransport.Capabilities().MaxMessageLength) {
		if _, err := activeTransport.SendMessage(ctx, chatID, transport.OutboundMessage{Text: part}); err != nil {
			return err
		}
	}
	return nil
}

func (r *Router) automationDeliveryChatID(ctx context.Context) (string, error) {
	r.mu.Lock()
	lastChatID := r.lastChatID
	r.mu.Unlock()
	if lastChatID != "" {
		return lastChatID, nil
	}

	routes, err := r.state.Load(ctx)
	if err != nil {
		return "", err
	}
	routedChatID := ""
	for _, entry := range routes.Sessions {
		if entry.ChatID == "" || entry.ChatID == routedChatID {
			continue
		}
		if routedChatID != "" {
			return "", ErrNoDeliveryChat
		}
		routedChatID = entry.ChatID
	}
	if routedChatID == "" {
		return "", ErrNoDeliveryChat
	}
	return routedChatID, nil
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

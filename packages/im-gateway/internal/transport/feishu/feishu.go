// Package feishu implements transport.Transport for Feishu (Lark) using the
// official oapi-sdk-go/v3 long-connection event subscription.
//
// Personal mode does not need a public webhook: the SDK's ws.Client opens
// a long-running WebSocket to the Feishu open platform and the event
// dispatcher delivers messages to a handler we register. Outgoing messages
// go through the regular Im.Message API client.
//
// First-milestone scope:
//   - private chats only (group / topic_group are silently dropped per
//     the Non-Goals in the spec)
//   - inbound: text messages only (rich blocks / attachments deferred)
//   - outbound: rendered as Feishu interactive cards (card JSON 2.0,
//     `rich_text` element) so LLM markdown output (headings, code blocks,
//     lists, tables, bold/italic) renders properly. Plain `text` msg type
//     is no longer used.
//   - automatic reconnect via SDK default behavior (autoReconnect=true,
//     unlimited retries, 2-minute interval)
//
// Outbound content is wrapped in card JSON 2.0:
// `{"schema":"2.0","config":{"update_multi":true},"body":{"elements":
// [{"tag":"rich_text","content":"<markdown body>"}]}}`. JSON encoding
// handles escaping. Card JSON 2.0 requires Feishu client ≥ 7.20.
package feishu

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"

	lark "github.com/larksuite/oapi-sdk-go/v3"
	larkcore "github.com/larksuite/oapi-sdk-go/v3/core"
	"github.com/larksuite/oapi-sdk-go/v3/event/dispatcher"
	larkim "github.com/larksuite/oapi-sdk-go/v3/service/im/v1"
	larkws "github.com/larksuite/oapi-sdk-go/v3/ws"

	"vetta-im-gateway/internal/transport"
)

// Options configures Transport. AppID + AppSecret are required.
type Options struct {
	AppID     string
	AppSecret string

	// Domain optionally overrides the Feishu base URL (e.g. for the lark
	// international tenant). Empty defaults to the SDK's standard
	// open.feishu.cn endpoint.
	Domain string

	// LogLevel for the SDK's internal logger. Defaults to Warn.
	LogLevel larkcore.LogLevel
}

// Transport implements transport.Transport for Feishu.
type Transport struct {
	opts   Options
	api    *lark.Client
	ws     *larkws.Client
	mu     sync.Mutex
	closed atomic.Bool
	done   chan struct{}
}

// New constructs a Feishu Transport. Validates required fields.
func New(opts Options) (*Transport, error) {
	if opts.AppID == "" || opts.AppSecret == "" {
		return nil, errors.New("feishu transport: AppID and AppSecret are required")
	}
	if opts.LogLevel == 0 {
		opts.LogLevel = larkcore.LogLevelWarn
	}

	apiOpts := []lark.ClientOptionFunc{
		lark.WithLogLevel(opts.LogLevel),
	}
	if opts.Domain != "" {
		apiOpts = append(apiOpts, lark.WithOpenBaseUrl(opts.Domain))
	}

	t := &Transport{
		opts: opts,
		api:  lark.NewClient(opts.AppID, opts.AppSecret, apiOpts...),
		done: make(chan struct{}),
	}
	return t, nil
}

// Compile-time interface check.
var _ transport.Transport = (*Transport)(nil)

func (t *Transport) Name() string { return "feishu" }

func (t *Transport) Capabilities() transport.Capabilities {
	return transport.Capabilities{
		// Feishu's PATCH /im/v1/messages/:message_id endpoint only supports
		// updating interactive cards, NOT text messages — text messages are
		// effectively immutable once sent. Declaring this honestly forces
		// the bridge to use the chunk fallback path (one final SendMessage
		// per assistant message) instead of trying to edit-in-place and
		// silently losing all but the first delta.
		SupportsMessageEdit: false,
		SupportsCards:       true,
		SupportsButtons:     true,
		SupportsFileUpload:  true,
		SupportsThreads:     true,
		// Feishu's text message body limit is 150KB. We pick a generous
		// 30000-character cap to leave headroom for JSON escaping.
		MaxMessageLength: 30000,
	}
}

// Start opens the long-connection and blocks delivering inbound messages
// to handler until ctx is cancelled or Stop() is called. Returns the
// underlying SDK's connect/run error, if any.
//
// The handler is invoked from inside the SDK's event dispatcher goroutine,
// so handlers MUST be cheap or hand off the message to a worker.
func (t *Transport) Start(ctx context.Context, handler transport.MessageHandler) error {
	d := dispatcher.NewEventDispatcher("", "").
		OnP2MessageReceiveV1(func(ctx context.Context, event *larkim.P2MessageReceiveV1) error {
			return t.handleInbound(ctx, event, handler)
		}).
		// Noop handlers for events Feishu always delivers but we don't use.
		// Without these, the SDK logs an [Error] line for every "user opened
		// the chat" or "user read a message" event, drowning the real logs.
		OnP2ChatAccessEventBotP2pChatEnteredV1(func(_ context.Context, _ *larkim.P2ChatAccessEventBotP2pChatEnteredV1) error {
			return nil
		}).
		OnP2MessageReadV1(func(_ context.Context, _ *larkim.P2MessageReadV1) error {
			return nil
		})

	wsOpts := []larkws.ClientOption{
		larkws.WithEventHandler(d),
		larkws.WithLogLevel(t.opts.LogLevel),
	}
	if t.opts.Domain != "" {
		wsOpts = append(wsOpts, larkws.WithDomain(t.opts.Domain))
	}

	t.mu.Lock()
	t.ws = larkws.NewClient(t.opts.AppID, t.opts.AppSecret, wsOpts...)
	t.mu.Unlock()

	// SDK Start blocks; run it on a goroutine so we can react to ctx and
	// Stop concurrently.
	errCh := make(chan error, 1)
	go func() {
		errCh <- t.ws.Start(ctx)
	}()

	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.done:
		return nil
	case err := <-errCh:
		return err
	}
}

// Stop signals the connection to close. The SDK doesn't expose an explicit
// shutdown for ws.Client; we close our done channel to unblock Start, and
// rely on context cancellation from the caller to terminate the underlying
// connect/reconnect loop.
func (t *Transport) Stop() error {
	if t.closed.Swap(true) {
		return nil
	}
	close(t.done)
	return nil
}

// handleInbound translates a Feishu P2MessageReceiveV1 event into the
// gateway's normalized InboundMessage and forwards it to the handler.
//
// Filters:
//   - Group / topic_group chats are silently dropped (Non-Goal for first
//     milestone). The bot still receives the events but does nothing.
//   - Non-text messages (image, file, post, etc.) are dropped with a
//     friendly reply suggesting text-only.
//   - Bot-self messages should not loop back here (Feishu's open platform
//     doesn't deliver them) but we defensively check anyway.
func (t *Transport) handleInbound(ctx context.Context, event *larkim.P2MessageReceiveV1, handler transport.MessageHandler) error {
	if event == nil || event.Event == nil || event.Event.Message == nil || event.Event.Sender == nil {
		return nil
	}
	msg := event.Event.Message

	chatType := strVal(msg.ChatType)
	if chatType != "p2p" {
		// Group / topic_group: Non-Goal for first milestone. Drop silently.
		return nil
	}

	msgType := strVal(msg.MessageType)
	if msgType != "text" {
		// Reply with a hint then drop.
		if msg.ChatId != nil {
			_, _ = t.SendMessage(ctx, *msg.ChatId, transport.OutboundMessage{
				Text: "Sorry, this gateway only supports text messages right now.",
			})
		}
		return nil
	}

	text := extractText(strVal(msg.Content))
	if text == "" {
		return nil
	}
	text = stripBotMentions(text, msg.Mentions)

	userID := ""
	if event.Event.Sender.SenderId != nil {
		userID = strVal(event.Event.Sender.SenderId.OpenId)
	}
	if userID == "" {
		return nil
	}

	inbound := transport.InboundMessage{
		Platform:  "feishu",
		ChatID:    strVal(msg.ChatId),
		UserID:    userID,
		MessageID: strVal(msg.MessageId),
		Text:      text,
		Raw:       event,
	}
	return handler.HandleInbound(ctx, inbound)
}

// SendMessage sends an interactive markdown card to the chat and returns
// the Feishu message ID for later editing. The body of OutboundMessage.Text
// is treated as markdown and rendered via card JSON 2.0's rich_text element.
func (t *Transport) SendMessage(ctx context.Context, chatID string, msg transport.OutboundMessage) (string, error) {
	body, err := encodeMarkdownCard(msg.Text)
	if err != nil {
		return "", err
	}

	req := larkim.NewCreateMessageReqBuilder().
		ReceiveIdType("chat_id").
		Body(larkim.NewCreateMessageReqBodyBuilder().
			ReceiveId(chatID).
			MsgType("interactive").
			Content(body).
			Build()).
		Build()

	resp, err := t.api.Im.Message.Create(ctx, req)
	if err != nil {
		return "", fmt.Errorf("feishu send: %w", err)
	}
	if !resp.Success() {
		return "", fmt.Errorf("feishu send: %s (%d)", resp.Msg, resp.Code)
	}
	if resp.Data == nil || resp.Data.MessageId == nil {
		return "", errors.New("feishu send: missing message id in response")
	}
	return *resp.Data.MessageId, nil
}

// EditMessage replaces the content of a previously sent message via the
// Feishu Patch API. Currently unused — Capabilities() advertises
// SupportsMessageEdit=false so the bridge never calls this — but kept
// correct so enabling streaming edits later is a one-line capability flip.
func (t *Transport) EditMessage(ctx context.Context, _ string, messageID string, msg transport.OutboundMessage) error {
	body, err := encodeMarkdownCard(msg.Text)
	if err != nil {
		return err
	}
	req := larkim.NewPatchMessageReqBuilder().
		MessageId(messageID).
		Body(larkim.NewPatchMessageReqBodyBuilder().
			Content(body).
			Build()).
		Build()
	resp, err := t.api.Im.Message.Patch(ctx, req)
	if err != nil {
		return fmt.Errorf("feishu edit: %w", err)
	}
	if !resp.Success() {
		return fmt.Errorf("feishu edit: %s (%d)", resp.Msg, resp.Code)
	}
	return nil
}

// DeleteMessage removes a previously sent message.
func (t *Transport) DeleteMessage(ctx context.Context, _ string, messageID string) error {
	req := larkim.NewDeleteMessageReqBuilder().MessageId(messageID).Build()
	resp, err := t.api.Im.Message.Delete(ctx, req)
	if err != nil {
		return fmt.Errorf("feishu delete: %w", err)
	}
	if !resp.Success() {
		return fmt.Errorf("feishu delete: %s (%d)", resp.Msg, resp.Code)
	}
	return nil
}

// ShowTyping is a no-op on Feishu — the open platform doesn't expose a
// typing indicator API for bots. Returning nil keeps the bridge happy.
func (t *Transport) ShowTyping(_ context.Context, _ string) error {
	return nil
}

// =============================================================================
// helpers
// =============================================================================

// encodeMarkdownCard wraps a markdown string into a Feishu card JSON 2.0
// payload that renders as a single rich_text element. The result is the
// stringified JSON expected by `Im.Message.Create` when MsgType is
// "interactive". JSON encoding handles all escaping.
//
// Schema reference: card JSON 2.0 with a single rich_text element. Requires
// Feishu client ≥ 7.20. `update_multi: true` allows the same card to be
// updated by multiple subsequent edits (forward-compatible with future
// streaming edits even though Capabilities currently advertises
// SupportsMessageEdit=false).
func encodeMarkdownCard(markdown string) (string, error) {
	card := map[string]any{
		"schema": "2.0",
		"config": map[string]any{
			"update_multi": true,
		},
		"body": map[string]any{
			"elements": []any{
				map[string]any{
					"tag":     "markdown",
					"content": markdown,
				},
			},
		},
	}
	body, err := json.Marshal(card)
	if err != nil {
		return "", fmt.Errorf("encode markdown card: %w", err)
	}
	return string(body), nil
}

// extractText pulls the user-visible text out of Feishu's text-message
// content envelope (`{"text":"..."}`). Returns empty string when the
// content is not parseable as a text message.
func extractText(content string) string {
	if content == "" {
		return ""
	}
	var v struct {
		Text string `json:"text"`
	}
	if err := json.Unmarshal([]byte(content), &v); err != nil {
		return ""
	}
	return v.Text
}

// stripBotMentions removes leading "@bot " noise from message text. Feishu
// delivers @-mentions as a separate Mentions array; the inline text still
// contains "@_user_1" or similar tokens that the user did not literally
// type. We blunt-strip them so the agent receives clean prompts.
func stripBotMentions(text string, mentions []*larkim.MentionEvent) string {
	if len(mentions) == 0 {
		return strings.TrimSpace(text)
	}
	for _, m := range mentions {
		if m == nil || m.Key == nil {
			continue
		}
		text = strings.ReplaceAll(text, *m.Key, "")
	}
	return strings.TrimSpace(text)
}

func strVal(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

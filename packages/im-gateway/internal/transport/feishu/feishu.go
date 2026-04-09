// Package feishu implements transport.Transport for Feishu (Lark) using the
// official oapi-sdk-go/v3 long-connection event subscription.
//
// Personal mode does not need a public webhook: the SDK's ws.Client opens
// a long-running WebSocket to the Feishu open platform and the event
// dispatcher delivers messages to a handler we register. Outgoing messages
// go through the regular Im.Message API client.
//
// Outbound paths (selected per OutboundMessage.Streaming):
//
//   - One-shot replies (command output, errors, hints): a card JSON 2.0
//     with a single inline `markdown` element is sent directly via
//     `Im.Message.Create` with msg_type=interactive. One round trip.
//
//   - Streaming responses (LLM output via the bridge): the transport
//     creates a cardkit "card entity" first (`Cardkit.V1.Card.Create`)
//     with `streaming_mode: true`, then sends an `Im.Message.Create`
//     whose content references the card_id. Subsequent EditMessage calls
//     are routed to the cardkit content API
//     (`Cardkit.V1.CardElement.Content`) so the Feishu client renders the
//     incremental updates with a typewriter effect. EndStream flips
//     `streaming_mode` back to false on the underlying card so the
//     blinking cursor goes away.
//
// First-milestone scope:
//   - private chats only (group / topic_group are silently dropped per
//     the Non-Goals in the spec)
//   - inbound: text messages only (rich blocks / attachments deferred)
//   - automatic reconnect via SDK default behavior (autoReconnect=true,
//     unlimited retries, 2-minute interval)
//
// Card JSON 2.0 + cardkit streaming both require Feishu client ≥ 7.20.
package feishu

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	lark "github.com/larksuite/oapi-sdk-go/v3"
	larkcardkit "github.com/larksuite/oapi-sdk-go/v3/service/cardkit/v1"
	larkcore "github.com/larksuite/oapi-sdk-go/v3/core"
	"github.com/larksuite/oapi-sdk-go/v3/event/dispatcher"
	larkim "github.com/larksuite/oapi-sdk-go/v3/service/im/v1"
	larkws "github.com/larksuite/oapi-sdk-go/v3/ws"

	"vetta-im-gateway/internal/transport"
)

// streamElementID is the fixed element_id we assign to the single markdown
// component inside every streaming card. The cardkit content-update API
// addresses elements by id, so we need a stable name to patch into.
const streamElementID = "streaming_text"

// streamRegistryCap caps the number of in-flight streaming cards we
// remember. A streaming card lives only for the duration of one assistant
// turn (created on SendMessage(streaming=true), dropped on EndStream), so
// 256 is far more than the steady-state need; it exists purely to bound
// memory if a turn ever fails to call EndStream (e.g. context cancelled
// mid-turn).
const streamRegistryCap = 256

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

// streamHandle remembers what cardkit card backs an in-flight streaming
// IM message, and the last sequence number we sent. Sequences must be
// strictly monotonic within one card's streaming cycle (Feishu rejects
// non-increasing values), so we keep the running counter here instead of
// trusting time.Now() in case two updates arrive in the same millisecond.
type streamHandle struct {
	cardID  string
	lastSeq int64
}

// Transport implements transport.Transport for Feishu.
type Transport struct {
	opts   Options
	api    *lark.Client
	ws     *larkws.Client
	mu     sync.Mutex
	closed atomic.Bool
	done   chan struct{}

	// Streaming state. The map is keyed by IM message ID (what the bridge
	// holds onto) and stores the cardkit card_id we need for subsequent
	// content updates and the EndStream call. order tracks insertion order
	// for FIFO eviction. Both are guarded by streamMu (separate from mu so
	// streaming traffic doesn't contend with start/stop).
	streamMu sync.Mutex
	streams  map[string]*streamHandle
	order    []string
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
		opts:    opts,
		api:     lark.NewClient(opts.AppID, opts.AppSecret, apiOpts...),
		done:    make(chan struct{}),
		streams: make(map[string]*streamHandle),
	}
	return t, nil
}

// Compile-time interface check.
var _ transport.Transport = (*Transport)(nil)

func (t *Transport) Name() string { return "feishu" }

func (t *Transport) Capabilities() transport.Capabilities {
	return transport.Capabilities{
		// Streaming responses use the cardkit content-update API which
		// is purpose-built for incremental edits and not subject to the
		// im/messages PATCH "interactive only" limitation. The bridge
		// uses commitEdit ⇒ SendMessage(streaming=true) ⇒ repeated
		// EditMessage(streaming=true) ⇒ EndStream — see the package doc.
		SupportsMessageEdit: true,
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

// SendMessage delivers a message to the chat. Two paths:
//
//   - msg.Streaming=false: a one-shot card 2.0 markdown message sent
//     directly via Im.Message.Create. One round trip; no cardkit state.
//
//   - msg.Streaming=true: provision a cardkit card entity in streaming
//     mode, send an interactive message that references its card_id, and
//     remember the binding so subsequent EditMessage calls can patch the
//     card's content via the cardkit content API.
//
// Returns the platform message_id either way.
func (t *Transport) SendMessage(ctx context.Context, chatID string, msg transport.OutboundMessage) (string, error) {
	if msg.Streaming {
		return t.sendStreamingMessage(ctx, chatID, msg.Text)
	}
	return t.sendStaticCard(ctx, chatID, msg.Text)
}

// sendStaticCard is the simple one-shot path used by command replies,
// errors, and any other non-streaming output.
func (t *Transport) sendStaticCard(ctx context.Context, chatID, text string) (string, error) {
	body, err := encodeMarkdownCard(text)
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

// sendStreamingMessage provisions a cardkit card entity, sends it via the
// IM API as a `card`-type interactive message, and registers the resulting
// (message_id, card_id) binding so EditMessage / EndStream can find it.
func (t *Transport) sendStreamingMessage(ctx context.Context, chatID, text string) (string, error) {
	cardJSON, err := encodeStreamingCardJSON(text)
	if err != nil {
		return "", err
	}

	createReq := larkcardkit.NewCreateCardReqBuilder().
		Body(larkcardkit.NewCreateCardReqBodyBuilder().
			Type("card_json").
			Data(cardJSON).
			Build()).
		Build()
	createResp, err := t.api.Cardkit.V1.Card.Create(ctx, createReq)
	if err != nil {
		return "", fmt.Errorf("feishu cardkit create: %w", err)
	}
	if !createResp.Success() {
		return "", fmt.Errorf("feishu cardkit create: %s (%d)", createResp.Msg, createResp.Code)
	}
	if createResp.Data == nil || createResp.Data.CardId == nil {
		return "", errors.New("feishu cardkit create: missing card_id in response")
	}
	cardID := *createResp.Data.CardId

	// Reference the card_id from an interactive message. The IM API expects
	// content as a JSON string of {"type":"card","data":{"card_id":"..."}}.
	refBody, err := encodeCardReferenceContent(cardID)
	if err != nil {
		return "", err
	}
	imReq := larkim.NewCreateMessageReqBuilder().
		ReceiveIdType("chat_id").
		Body(larkim.NewCreateMessageReqBodyBuilder().
			ReceiveId(chatID).
			MsgType("interactive").
			Content(refBody).
			Build()).
		Build()
	imResp, err := t.api.Im.Message.Create(ctx, imReq)
	if err != nil {
		return "", fmt.Errorf("feishu send (cardkit): %w", err)
	}
	if !imResp.Success() {
		return "", fmt.Errorf("feishu send (cardkit): %s (%d)", imResp.Msg, imResp.Code)
	}
	if imResp.Data == nil || imResp.Data.MessageId == nil {
		return "", errors.New("feishu send (cardkit): missing message id in response")
	}
	messageID := *imResp.Data.MessageId
	t.registerStream(messageID, cardID)
	return messageID, nil
}

// EditMessage updates a streaming message in place. The bridge only calls
// this for messages it created via SendMessage(streaming=true), so the
// (message_id → card_id) binding must already be registered. We push the
// new full text to cardkit's content API which diffs against the previous
// content and renders the change as a typewriter effect on the client.
func (t *Transport) EditMessage(ctx context.Context, _ string, messageID string, msg transport.OutboundMessage) error {
	h := t.lookupStream(messageID)
	if h == nil {
		return fmt.Errorf("feishu edit: no streaming card for message %s", messageID)
	}

	seq := t.nextSequence(h)
	body, err := encodeStreamingContentBody(msg.Text)
	if err != nil {
		return err
	}
	req := larkcardkit.NewContentCardElementReqBuilder().
		CardId(h.cardID).
		ElementId(streamElementID).
		Body(larkcardkit.NewContentCardElementReqBodyBuilder().
			Content(body).
			Sequence(int(seq)).
			Build()).
		Build()
	resp, err := t.api.Cardkit.V1.CardElement.Content(ctx, req)
	if err != nil {
		return fmt.Errorf("feishu cardkit content: %w", err)
	}
	if !resp.Success() {
		return fmt.Errorf("feishu cardkit content: %s (%d)", resp.Msg, resp.Code)
	}
	return nil
}

// EndStream marks a streaming card as finished by flipping streaming_mode
// off via the cardkit settings API, then drops the (message_id → card_id)
// binding. EndStream on an unknown message_id is a no-op (returning nil)
// so the bridge can call it unconditionally.
func (t *Transport) EndStream(ctx context.Context, _ string, messageID string) error {
	h := t.unregisterStream(messageID)
	if h == nil {
		return nil
	}
	seq := t.nextSequence(h)
	settingsJSON, err := encodeStreamingFinishedSettings()
	if err != nil {
		return err
	}
	req := larkcardkit.NewSettingsCardReqBuilder().
		CardId(h.cardID).
		Body(larkcardkit.NewSettingsCardReqBodyBuilder().
			Settings(settingsJSON).
			Sequence(int(seq)).
			Build()).
		Build()
	resp, err := t.api.Cardkit.V1.Card.Settings(ctx, req)
	if err != nil {
		return fmt.Errorf("feishu cardkit settings: %w", err)
	}
	if !resp.Success() {
		return fmt.Errorf("feishu cardkit settings: %s (%d)", resp.Msg, resp.Code)
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
// payload that renders as a single markdown element. The result is the
// stringified JSON expected by `Im.Message.Create` when MsgType is
// "interactive". JSON encoding handles all escaping.
//
// Used by the non-streaming send path (one-shot replies). Card JSON 2.0
// requires Feishu client ≥ 7.20.
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

// encodeStreamingCardJSON builds the card JSON 2.0 body that gets handed to
// cardkit's Card.Create. It declares streaming_mode=true so that subsequent
// content updates animate with the typewriter effect, and pins a stable
// element_id on the markdown element so the content-update API can address
// it.
func encodeStreamingCardJSON(initial string) (string, error) {
	card := map[string]any{
		"schema": "2.0",
		"config": map[string]any{
			"streaming_mode": true,
			"update_multi":   true,
			"summary": map[string]any{
				"content": "",
			},
			"streaming_config": map[string]any{
				"print_strategy": "fast",
			},
		},
		"body": map[string]any{
			"elements": []any{
				map[string]any{
					"tag":        "markdown",
					"element_id": streamElementID,
					"content":    initial,
				},
			},
		},
	}
	body, err := json.Marshal(card)
	if err != nil {
		return "", fmt.Errorf("encode streaming card: %w", err)
	}
	return string(body), nil
}

// encodeCardReferenceContent builds the JSON the IM messages-create
// endpoint expects when sending an interactive card by reference (rather
// than inlining the card body): {"type":"card","data":{"card_id":"..."}}.
func encodeCardReferenceContent(cardID string) (string, error) {
	body, err := json.Marshal(map[string]any{
		"type": "card",
		"data": map[string]any{
			"card_id": cardID,
		},
	})
	if err != nil {
		return "", fmt.Errorf("encode card reference: %w", err)
	}
	return string(body), nil
}

// encodeStreamingContentBody wraps a markdown chunk in the {"content":"..."}
// envelope that the cardkit element-content endpoint expects.
func encodeStreamingContentBody(markdown string) (string, error) {
	body, err := json.Marshal(map[string]string{"content": markdown})
	if err != nil {
		return "", fmt.Errorf("encode streaming content: %w", err)
	}
	return string(body), nil
}

// encodeStreamingFinishedSettings produces the partial card-settings JSON
// the cardkit Settings endpoint expects to flip a card out of streaming
// mode. We only touch streaming_mode; everything else stays as it was.
func encodeStreamingFinishedSettings() (string, error) {
	body, err := json.Marshal(map[string]any{
		"config": map[string]any{
			"streaming_mode": false,
		},
	})
	if err != nil {
		return "", fmt.Errorf("encode streaming-finished settings: %w", err)
	}
	return string(body), nil
}

// =============================================================================
// streaming registry
// =============================================================================

// registerStream stores a (message_id → card_id) binding, evicting the
// oldest entry FIFO if we're at capacity. Initial sequence is the current
// wall clock in milliseconds — that gives us a unique starting point per
// stream and matches Feishu's "use a timestamp" recommendation, while
// nextSequence() guarantees strict monotonicity from there.
func (t *Transport) registerStream(messageID, cardID string) {
	t.streamMu.Lock()
	defer t.streamMu.Unlock()
	if _, exists := t.streams[messageID]; exists {
		// Re-binding the same id is unexpected but harmless; just refresh.
		t.streams[messageID] = &streamHandle{cardID: cardID, lastSeq: time.Now().UnixMilli()}
		return
	}
	if len(t.streams) >= streamRegistryCap {
		oldest := t.order[0]
		t.order = t.order[1:]
		delete(t.streams, oldest)
	}
	t.streams[messageID] = &streamHandle{cardID: cardID, lastSeq: time.Now().UnixMilli()}
	t.order = append(t.order, messageID)
}

func (t *Transport) lookupStream(messageID string) *streamHandle {
	t.streamMu.Lock()
	defer t.streamMu.Unlock()
	return t.streams[messageID]
}

func (t *Transport) unregisterStream(messageID string) *streamHandle {
	t.streamMu.Lock()
	defer t.streamMu.Unlock()
	h := t.streams[messageID]
	if h == nil {
		return nil
	}
	delete(t.streams, messageID)
	for i, id := range t.order {
		if id == messageID {
			t.order = append(t.order[:i], t.order[i+1:]...)
			break
		}
	}
	return h
}

// nextSequence returns the next strictly-increasing sequence number for
// the given stream. Always at least lastSeq+1 even if the wall clock
// hasn't moved (or moved backwards), so back-to-back updates within the
// same millisecond stay valid.
func (t *Transport) nextSequence(h *streamHandle) int64 {
	t.streamMu.Lock()
	defer t.streamMu.Unlock()
	now := time.Now().UnixMilli()
	if now <= h.lastSeq {
		now = h.lastSeq + 1
	}
	h.lastSeq = now
	return now
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

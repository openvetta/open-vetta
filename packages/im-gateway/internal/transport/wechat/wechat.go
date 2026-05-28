// Package wechat implements transport.Transport over the WeChat iLink bot
// protocol.
//
// The protocol is a third-party-friendly HTTP/JSON API maintained by the
// Tencent ClawBot team for OpenClaw integration. We bypass OpenClaw and
// speak iLink directly via the internal/transport/wechat/ilink subpackage.
// See packages/im-gateway/docs/ilink-protocol.md for the full protocol
// reference.
//
// Scope (M1):
//
//   - Text-only 1-on-1 chats
//   - QR-scan binding (driven by `im-gateway wechat login`)
//   - Persistent credentials, long-poll cursor, and per-peer context_token
//     map under ~/.vetta/im-gateway/wechat.json
//   - 24h/10-msg quota tracking per peer (server-side enforced; we shadow
//     it client-side to fail fast)
//
// Out of scope: streaming responses, message edit, media (image/video/file/
// voice), typing indicators, group chat, multi-account.
package wechat

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"go.uber.org/zap"

	"vetta-im-gateway/internal/transport"
	"vetta-im-gateway/internal/transport/wechat/ilink"
)

// ErrNotBound is returned by New when the on-disk state has no credentials
// yet. The caller should run `im-gateway wechat login` to populate them.
var ErrNotBound = errors.New("wechat: no bound account; run `im-gateway wechat login` first")

// ErrQuotaExhausted is returned by SendMessage when the local quota
// tracker indicates the per-peer 24h/10-message ceiling has been hit.
// The caller (the bridge) is responsible for translating this into
// whatever user-facing message is appropriate.
var ErrQuotaExhausted = errors.New("wechat: per-peer 24h send quota exhausted; user must reply to reset the window")

// Options configures Transport construction.
type Options struct {
	// StatePath is the JSON file holding credentials, cursor, and
	// context-token map. Created on first save if its parent directory
	// does not yet exist.
	StatePath string

	// Logger receives operational logs. Optional; falls back to a no-op.
	Logger *zap.Logger

	// QuotaPerWindow caps successful sends per peer per QuotaWindow.
	// Defaults to 10.
	QuotaPerWindow int

	// QuotaWindow is the rolling window length for QuotaPerWindow.
	// Defaults to 24h.
	QuotaWindow time.Duration

	// PollBackoff is the maximum exponential backoff between getupdates
	// retries on hard errors. Defaults to 30s. Long-poll timeouts and
	// "no new messages" do NOT trigger backoff — only real failures.
	PollBackoff time.Duration

	// PollInitialBackoff is the initial backoff between retries.
	// Defaults to 1s.
	PollInitialBackoff time.Duration
}

// Transport implements transport.Transport. Construct via New; the zero
// value is not usable.
type Transport struct {
	store    *stateStore
	client   *ilink.Client
	quota    *Quota
	log      *zap.Logger

	pollMaxBackoff     time.Duration
	pollInitialBackoff time.Duration

	mu      sync.Mutex
	stopped bool
	cancel  context.CancelFunc
}

// Compile-time interface check.
var _ transport.Transport = (*Transport)(nil)

// New constructs a Transport from persisted state. Returns ErrNotBound if
// no credentials have been recorded yet — the caller should run
// `im-gateway wechat login` first.
func New(opts Options) (*Transport, error) {
	if opts.StatePath == "" {
		return nil, errors.New("wechat: Options.StatePath is required")
	}
	store, err := newStateStore(opts.StatePath)
	if err != nil {
		return nil, err
	}
	if !store.HasCredentials() {
		return nil, ErrNotBound
	}

	logger := opts.Logger
	if logger == nil {
		logger = zap.NewNop()
	}

	quotaPer := opts.QuotaPerWindow
	if quotaPer == 0 {
		quotaPer = 10
	}
	quotaWin := opts.QuotaWindow
	if quotaWin == 0 {
		quotaWin = 24 * time.Hour
	}

	pollMax := opts.PollBackoff
	if pollMax == 0 {
		pollMax = 30 * time.Second
	}
	pollInit := opts.PollInitialBackoff
	if pollInit == 0 {
		pollInit = 1 * time.Second
	}

	client := ilink.Restore(store.Credentials(), ilink.Options{
		Logger: zapShim{logger},
	})

	return &Transport{
		store:              store,
		client:             client,
		quota:              NewQuota(quotaPer, quotaWin, time.Now),
		log:                logger,
		pollMaxBackoff:     pollMax,
		pollInitialBackoff: pollInit,
	}, nil
}

// Name returns the transport identifier used in InboundMessage.Platform.
func (t *Transport) Name() string { return "wechat" }

// Capabilities reports what the WeChat iLink protocol can and cannot do.
//
// SupportsMessageEdit is the most consequential field: false here forces
// the bridge into the "send a fresh message per agent reply" path because
// iLink has no edit endpoint. Streaming responses are deliberately not
// supported in M1.
func (t *Transport) Capabilities() transport.Capabilities {
	return transport.Capabilities{
		SupportsMessageEdit: false,
		SupportsCards:       false,
		SupportsButtons:     false,
		SupportsFileUpload:  false, // protocol supports it; M1 does not
		SupportsThreads:     false,
		MaxMessageLength:    0, // unknown; will be probed in real testing
		// iLink enforces ≤10 outbound messages per peer until the next
		// inbound resets the window. Streaming chunks would burn that
		// budget in one turn, so the bridge defers everything to a
		// single digest message at agent_end (plus an optional ack).
		DeferUntilTurnEnd: true,
	}
}

// Start runs the long-poll loop until ctx is cancelled, Stop is called, or
// an unrecoverable credential error (ErrSessionTimeout) is returned by the
// server.
func (t *Transport) Start(ctx context.Context, handler transport.MessageHandler) error {
	t.mu.Lock()
	if t.stopped {
		t.mu.Unlock()
		return errors.New("wechat: Start called after Stop")
	}
	ctx, t.cancel = context.WithCancel(ctx)
	t.mu.Unlock()

	t.log.Info("wechat transport starting",
		zap.String("base_url", t.client.MessagingBaseURL()),
	)

	backoff := t.pollInitialBackoff
	for {
		if err := ctx.Err(); err != nil {
			return err
		}

		resp, err := t.client.GetUpdates(ctx, t.store.Cursor())
		if err != nil {
			if errors.Is(err, ilink.ErrSessionTimeout) {
				// Bot token is dead. Stop the loop; the caller is
				// expected to surface this to the user (re-bind).
				t.log.Warn("wechat session expired, stopping", zap.Error(err))
				return err
			}
			if ctx.Err() != nil {
				return ctx.Err()
			}
			t.log.Warn("wechat getupdates failed, backing off",
				zap.Duration("backoff", backoff),
				zap.Error(err),
			)
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(backoff):
			}
			backoff *= 2
			if backoff > t.pollMaxBackoff {
				backoff = t.pollMaxBackoff
			}
			continue
		}
		// Success: reset backoff.
		backoff = t.pollInitialBackoff

		for i := range resp.Msgs {
			t.dispatchInbound(ctx, &resp.Msgs[i], handler)
		}

		// Persist the cursor AFTER dispatching so a crash mid-dispatch
		// re-delivers (at-least-once), not silently drops.
		if resp.GetUpdatesBuf != "" {
			if err := t.store.SetCursor(resp.GetUpdatesBuf); err != nil {
				t.log.Warn("wechat persist cursor failed", zap.Error(err))
			}
		}
	}
}

// dispatchInbound translates one WeixinMessage into transport.InboundMessage,
// records the new context_token + quota reset, and invokes the handler.
// Errors from the handler are logged and swallowed — one bad message must
// not stall the poll loop.
func (t *Transport) dispatchInbound(ctx context.Context, msg *ilink.WeixinMessage, handler transport.MessageHandler) {
	peer := msg.FromUserID
	if peer == "" {
		t.log.Debug("wechat dropping message with empty from_user_id")
		return
	}

	text := extractText(msg)
	if text == "" {
		t.log.Debug("wechat dropping non-text message",
			zap.String("peer", peer),
			zap.Int("items", len(msg.ItemList)),
		)
		return
	}

	// Reset the per-peer quota window: any inbound message reopens the
	// 24h/10 budget per the upstream protocol rules.
	t.quota.OnInbound(peer)

	// Persist the latest context_token for this peer so subsequent sends
	// can echo it. Survives gateway restart.
	if msg.ContextToken != "" {
		if err := t.store.SetContextToken(peer, msg.ContextToken); err != nil {
			t.log.Warn("wechat persist context_token failed",
				zap.String("peer", peer),
				zap.Error(err),
			)
		}
	}

	in := transport.InboundMessage{
		Platform:   "wechat",
		ChatID:     peer, // 1-on-1 only in M1: chat == peer
		UserID:     peer,
		MessageID:  formatMessageID(msg),
		Text:       text,
		ReceivedAt: time.Now(),
		Raw:        msg,
	}

	if err := handler.HandleInbound(ctx, in); err != nil {
		t.log.Warn("wechat handler error",
			zap.String("peer", peer),
			zap.Error(err),
		)
	}
}

// Stop signals Start to return. Safe to call multiple times.
func (t *Transport) Stop() error {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.stopped {
		return nil
	}
	t.stopped = true
	if t.cancel != nil {
		t.cancel()
	}
	return nil
}

// SendMessage sends one text message to a peer. Returns ErrQuotaExhausted
// if the local quota tracker says we are out of budget for this peer in
// the current 24h window. The bridge should turn that into a user-visible
// notice rather than crashing.
func (t *Transport) SendMessage(ctx context.Context, chatID string, msg transport.OutboundMessage) (string, error) {
	if chatID == "" {
		return "", errors.New("wechat: chatID required")
	}
	text := flattenOutbound(msg)
	if text == "" {
		return "", errors.New("wechat: empty outbound message")
	}

	if !t.quota.CanSend(chatID) {
		t.log.Warn("wechat quota exhausted, refusing send",
			zap.String("peer", chatID),
		)
		return "", ErrQuotaExhausted
	}

	ctxToken := t.store.ContextToken(chatID)
	if ctxToken == "" {
		t.log.Warn("wechat sending without context_token (proactive push)",
			zap.String("peer", chatID),
		)
	}

	cid, err := t.client.SendText(ctx, ilink.SendTextOptions{
		PeerUserID:   chatID,
		Text:         text,
		ContextToken: ctxToken,
	})
	if err != nil {
		return "", fmt.Errorf("wechat send: %w", err)
	}
	t.quota.RecordSend(chatID)
	t.log.Debug("wechat send ok",
		zap.String("peer", chatID),
		zap.String("client_id", cid),
		zap.Int("remaining", t.quota.Remaining(chatID)),
	)
	return cid, nil
}

// EditMessage is intentionally a hard error: the iLink protocol has no
// edit endpoint. Capabilities.SupportsMessageEdit=false should prevent the
// bridge from ever calling this; if it does, returning an error helps
// catch the bug in tests.
func (t *Transport) EditMessage(_ context.Context, _, _ string, _ transport.OutboundMessage) error {
	return errors.New("wechat: edit not supported")
}

// EndStream is a no-op; M1 does not support streaming.
func (t *Transport) EndStream(_ context.Context, _, _ string) error { return nil }

// DeleteMessage returns an error; the protocol has no delete endpoint.
func (t *Transport) DeleteMessage(_ context.Context, _, _ string) error {
	return errors.New("wechat: delete not supported")
}

// ShowTyping is a no-op in M1. The protocol supports a typing indicator
// but it requires a 5-8s heartbeat goroutine which we defer.
func (t *Transport) ShowTyping(_ context.Context, _ string) error { return nil }

// =============================================================================
// helpers
// =============================================================================

// extractText pulls user-readable text out of a WeixinMessage. Mirrors the
// upstream `bodyFromItemList` logic in src/messaging/inbound.ts:
//
//   - Prefer the first TEXT item; if it has a ref_msg, prefix the body
//     with a "[引用: ...]\n" line so the agent can see what was quoted.
//   - Fall back to a VOICE item that already has server-side STT
//     (`voice_item.text`).
//
// Returns "" if no readable text is present (e.g. pure image/file message
// — those are dropped in M1).
func extractText(msg *ilink.WeixinMessage) string {
	for i := range msg.ItemList {
		item := &msg.ItemList[i]
		if item.Type == ilink.MessageItemTypeText && item.TextItem != nil && item.TextItem.Text != "" {
			text := item.TextItem.Text
			if item.RefMsg == nil {
				return text
			}
			ref := item.RefMsg
			// If the quoted message was media, we cannot inline it
			// here (M1 has no media support); just return the bare text.
			if ref.MessageItem != nil && isMediaItem(ref.MessageItem) {
				return text
			}
			parts := []string{}
			if ref.Title != "" {
				parts = append(parts, ref.Title)
			}
			if ref.MessageItem != nil {
				if refBody := extractItemText(ref.MessageItem); refBody != "" {
					parts = append(parts, refBody)
				}
			}
			if len(parts) == 0 {
				return text
			}
			quoted := parts[0]
			for _, p := range parts[1:] {
				quoted += " | " + p
			}
			return "[引用: " + quoted + "]\n" + text
		}
		if item.Type == ilink.MessageItemTypeVoice && item.VoiceItem != nil && item.VoiceItem.Text != "" {
			return item.VoiceItem.Text
		}
	}
	return ""
}

// extractItemText is the single-item variant used for ref_msg bodies.
func extractItemText(item *ilink.MessageItem) string {
	if item == nil {
		return ""
	}
	if item.Type == ilink.MessageItemTypeText && item.TextItem != nil {
		return item.TextItem.Text
	}
	if item.Type == ilink.MessageItemTypeVoice && item.VoiceItem != nil {
		return item.VoiceItem.Text
	}
	return ""
}

// isMediaItem reports whether an item is one of the media kinds (used to
// decide whether a quoted ref_msg can be inlined).
func isMediaItem(item *ilink.MessageItem) bool {
	switch item.Type {
	case ilink.MessageItemTypeImage,
		ilink.MessageItemTypeVoice,
		ilink.MessageItemTypeFile,
		ilink.MessageItemTypeVideo:
		return true
	}
	return false
}

// flattenOutbound collapses an OutboundMessage to plain text. wechat
// declares SupportsCards=false so the bridge always populates Text, but
// we defensively concatenate Block text as well in case some upstream
// path drops Text.
func flattenOutbound(m transport.OutboundMessage) string {
	if m.Text != "" {
		return m.Text
	}
	if len(m.Blocks) == 0 {
		return ""
	}
	var sb strings.Builder
	for i, b := range m.Blocks {
		if i > 0 {
			sb.WriteString("\n")
		}
		sb.WriteString(b.Text)
	}
	return sb.String()
}

// formatMessageID gives upstream layers a stable id for an inbound msg.
// We prefer the protocol-level message_id when present, falling back to
// client_id, then to "<seq>".
func formatMessageID(msg *ilink.WeixinMessage) string {
	if msg.MessageID != 0 {
		return fmt.Sprintf("wx-%d", msg.MessageID)
	}
	if msg.ClientID != "" {
		return msg.ClientID
	}
	return fmt.Sprintf("wx-seq-%d", msg.Seq)
}

// zapShim adapts *zap.Logger to ilink.Logger so the protocol package does
// not need to import zap.
type zapShim struct{ l *zap.Logger }

func (z zapShim) Debug(msg string, fields ...any) { z.l.Sugar().Debugw(msg, fields...) }
func (z zapShim) Info(msg string, fields ...any)  { z.l.Sugar().Infow(msg, fields...) }
func (z zapShim) Warn(msg string, fields ...any)  { z.l.Sugar().Warnw(msg, fields...) }
func (z zapShim) Error(msg string, fields ...any) { z.l.Sugar().Errorw(msg, fields...) }

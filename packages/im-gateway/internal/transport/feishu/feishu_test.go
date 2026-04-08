package feishu

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	larkim "github.com/larksuite/oapi-sdk-go/v3/service/im/v1"

	"vetta-im-gateway/internal/transport"
)

func TestNew_RequiresCredentials(t *testing.T) {
	if _, err := New(Options{}); err == nil {
		t.Error("expected error for missing credentials")
	}
	if _, err := New(Options{AppID: "x"}); err == nil {
		t.Error("expected error for missing AppSecret")
	}
}

func TestCapabilities(t *testing.T) {
	tr, err := New(Options{AppID: "x", AppSecret: "y"})
	if err != nil {
		t.Fatal(err)
	}
	caps := tr.Capabilities()
	// Feishu's PATCH endpoint only updates interactive cards, not text
	// messages — see the design note in feishu.go Capabilities().
	if caps.SupportsMessageEdit {
		t.Error("Feishu should advertise SupportsMessageEdit=false (text messages are immutable)")
	}
	if caps.MaxMessageLength <= 0 {
		t.Error("MaxMessageLength should be positive")
	}
}

func TestEncodeText_RoundTrip(t *testing.T) {
	cases := []string{
		"hello",
		`with "quotes" inside`,
		"line1\nline2",
		"中文测试",
		"emoji 🚀 emoji",
	}
	for _, in := range cases {
		got, err := encodeText(in)
		if err != nil {
			t.Fatalf("encode %q: %v", in, err)
		}
		var v struct{ Text string }
		if err := json.Unmarshal([]byte(got), &v); err != nil {
			t.Errorf("encoded %q is not valid JSON: %v", in, err)
		}
		if v.Text != in {
			t.Errorf("round-trip mismatch: in=%q out=%q", in, v.Text)
		}
	}
}

func TestExtractText_HappyPath(t *testing.T) {
	got := extractText(`{"text":"hello world"}`)
	if got != "hello world" {
		t.Errorf("got %q", got)
	}
}

func TestExtractText_NotJSON(t *testing.T) {
	if got := extractText("not json"); got != "" {
		t.Errorf("expected empty string for invalid content, got %q", got)
	}
}

func TestExtractText_Empty(t *testing.T) {
	if got := extractText(""); got != "" {
		t.Errorf("expected empty string, got %q", got)
	}
}

func TestStripBotMentions_RemovesKeyTokens(t *testing.T) {
	key := "@_user_1"
	mentions := []*larkim.MentionEvent{
		{Key: &key},
	}
	got := stripBotMentions("@_user_1 hello agent", mentions)
	if got != "hello agent" {
		t.Errorf("got %q", got)
	}
}

func TestStripBotMentions_NoMentions(t *testing.T) {
	got := stripBotMentions("  hello agent  ", nil)
	if got != "hello agent" {
		t.Errorf("got %q", got)
	}
}

// captureHandler records inbound messages from handleInbound for assertions.
type captureHandler struct {
	mu   sync.Mutex
	msgs []transport.InboundMessage
}

func (h *captureHandler) HandleInbound(_ context.Context, msg transport.InboundMessage) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.msgs = append(h.msgs, msg)
	return nil
}

func (h *captureHandler) snapshot() []transport.InboundMessage {
	h.mu.Lock()
	defer h.mu.Unlock()
	out := make([]transport.InboundMessage, len(h.msgs))
	copy(out, h.msgs)
	return out
}

// makeP2 builds a minimal P2MessageReceiveV1 for handleInbound tests.
func makeP2(chatType, msgType, content, openID, chatID string) *larkim.P2MessageReceiveV1 {
	return &larkim.P2MessageReceiveV1{
		Event: &larkim.P2MessageReceiveV1Data{
			Sender: &larkim.EventSender{
				SenderId: &larkim.UserId{OpenId: ptr(openID)},
			},
			Message: &larkim.EventMessage{
				MessageId:   ptr("om_test"),
				ChatId:      ptr(chatID),
				ChatType:    ptr(chatType),
				MessageType: ptr(msgType),
				Content:     ptr(content),
			},
		},
	}
}

func ptr(s string) *string { return &s }

func TestHandleInbound_PrivateText(t *testing.T) {
	tr, _ := New(Options{AppID: "x", AppSecret: "y"})
	h := &captureHandler{}

	ev := makeP2("p2p", "text", `{"text":"hello"}`, "ou_user_1", "oc_chat_1")
	if err := tr.handleInbound(context.Background(), ev, h); err != nil {
		t.Fatal(err)
	}

	got := h.snapshot()
	if len(got) != 1 {
		t.Fatalf("expected 1 inbound, got %d", len(got))
	}
	m := got[0]
	if m.Platform != "feishu" {
		t.Errorf("Platform: %q", m.Platform)
	}
	if m.UserID != "ou_user_1" || m.ChatID != "oc_chat_1" {
		t.Errorf("user/chat wrong: %+v", m)
	}
	if m.Text != "hello" {
		t.Errorf("Text: %q", m.Text)
	}
}

func TestHandleInbound_GroupDropped(t *testing.T) {
	tr, _ := New(Options{AppID: "x", AppSecret: "y"})
	h := &captureHandler{}

	ev := makeP2("group", "text", `{"text":"hello group"}`, "ou_user_1", "oc_group_1")
	_ = tr.handleInbound(context.Background(), ev, h)
	if len(h.snapshot()) != 0 {
		t.Error("group messages should be silently dropped (Non-Goal)")
	}
}

func TestHandleInbound_NonTextDropped(t *testing.T) {
	// Note: non-text triggers a bot reply which would call SendMessage
	// against the Feishu API. We only verify the handler is NOT invoked
	// (the SendMessage failure is silent in tests since we can't reach
	// Feishu). The snapshot remains empty.
	tr, _ := New(Options{AppID: "x", AppSecret: "y"})
	h := &captureHandler{}

	ev := makeP2("p2p", "image", `{"image_key":"img1"}`, "ou_user_1", "oc_chat_1")
	_ = tr.handleInbound(context.Background(), ev, h)
	if len(h.snapshot()) != 0 {
		t.Error("non-text messages should not reach the handler")
	}
}

func TestHandleInbound_MissingFields(t *testing.T) {
	tr, _ := New(Options{AppID: "x", AppSecret: "y"})
	h := &captureHandler{}

	if err := tr.handleInbound(context.Background(), nil, h); err != nil {
		t.Errorf("nil event should be a noop, got error: %v", err)
	}
	if len(h.snapshot()) != 0 {
		t.Error("nil event should not invoke handler")
	}
}

func TestHandleInbound_StripsBotMention(t *testing.T) {
	tr, _ := New(Options{AppID: "x", AppSecret: "y"})
	h := &captureHandler{}

	ev := makeP2("p2p", "text", `{"text":"@_user_1 hello agent"}`, "ou_user_1", "oc_chat_1")
	key := "@_user_1"
	ev.Event.Message.Mentions = []*larkim.MentionEvent{{Key: &key}}

	_ = tr.handleInbound(context.Background(), ev, h)
	got := h.snapshot()
	if len(got) != 1 {
		t.Fatalf("expected 1, got %d", len(got))
	}
	if got[0].Text != "hello agent" {
		t.Errorf("mention not stripped: %q", got[0].Text)
	}
}

// =============================================================================
// Integration test (gated)
// =============================================================================
//
// Set FEISHU_INTEGRATION_TEST=1 plus IM_GATEWAY_FEISHU_APP_ID /
// IM_GATEWAY_FEISHU_APP_SECRET in env to run a real connect cycle. The
// test creates a Transport, briefly Start()s it, and immediately Stop()s.
// It does not send any messages.
func TestFeishu_Integration_ConnectAndStop(t *testing.T) {
	if os.Getenv("FEISHU_INTEGRATION_TEST") != "1" {
		t.Skip("set FEISHU_INTEGRATION_TEST=1 to run")
	}
	appID := os.Getenv("IM_GATEWAY_FEISHU_APP_ID")
	appSecret := os.Getenv("IM_GATEWAY_FEISHU_APP_SECRET")
	if appID == "" || appSecret == "" {
		t.Skip("integration test requires FEISHU app id + secret env vars")
	}

	tr, err := New(Options{AppID: appID, AppSecret: appSecret})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	done := make(chan error, 1)
	go func() {
		done <- tr.Start(ctx, transport.MessageHandlerFunc(func(_ context.Context, msg transport.InboundMessage) error {
			t.Logf("received: %+v", msg)
			return nil
		}))
	}()

	// Brief connect window
	time.Sleep(2 * time.Second)
	_ = tr.Stop()
	cancel()

	select {
	case err := <-done:
		if err != nil && !strings.Contains(err.Error(), "context canceled") {
			t.Errorf("Start returned: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Error("Start did not return after Stop+cancel")
	}
}

package bridge

import (
	"context"
	"encoding/json"
	"strings"
	"sync"
	"testing"
	"time"

	"vetta-im-gateway/internal/hostclient"
	"vetta-im-gateway/internal/transport"
)

// fakeTransport records all SendMessage / EditMessage calls so tests can
// assert on the resulting message stream.
type fakeTransport struct {
	caps transport.Capabilities

	mu     sync.Mutex
	nextID int
	calls  []transportCall
}

type transportCall struct {
	Action    string // "send" | "edit" | "delete" | "typing"
	ChatID    string
	MessageID string
	Text      string
}

func newFakeTransport(caps transport.Capabilities) *fakeTransport {
	return &fakeTransport{caps: caps}
}

func (f *fakeTransport) Name() string                      { return "fake" }
func (f *fakeTransport) Capabilities() transport.Capabilities { return f.caps }
func (f *fakeTransport) Start(_ context.Context, _ transport.MessageHandler) error {
	return nil
}
func (f *fakeTransport) Stop() error { return nil }

func (f *fakeTransport) SendMessage(_ context.Context, chatID string, msg transport.OutboundMessage) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.nextID++
	id := "m" + itoa(f.nextID)
	f.calls = append(f.calls, transportCall{Action: "send", ChatID: chatID, MessageID: id, Text: msg.Text})
	return id, nil
}

func (f *fakeTransport) EditMessage(_ context.Context, chatID, messageID string, msg transport.OutboundMessage) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, transportCall{Action: "edit", ChatID: chatID, MessageID: messageID, Text: msg.Text})
	return nil
}

func (f *fakeTransport) DeleteMessage(_ context.Context, chatID, messageID string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, transportCall{Action: "delete", ChatID: chatID, MessageID: messageID})
	return nil
}

func (f *fakeTransport) ShowTyping(_ context.Context, chatID string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, transportCall{Action: "typing", ChatID: chatID})
	return nil
}

func (f *fakeTransport) snapshot() []transportCall {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]transportCall, len(f.calls))
	copy(out, f.calls)
	return out
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	return string(b[i:])
}

// helpers to build agent events

func textDelta(text string) hostclient.AgentEvent {
	raw, _ := json.Marshal(map[string]any{
		"type": hostclient.AgentEventTypeMessageUpdate,
		"assistantMessageEvent": map[string]any{
			"type":  "text_delta",
			"delta": text,
		},
	})
	return hostclient.AgentEvent{Type: hostclient.AgentEventTypeMessageUpdate, Raw: raw}
}

func plainEvent(t string) hostclient.AgentEvent {
	raw, _ := json.Marshal(map[string]any{"type": t})
	return hostclient.AgentEvent{Type: t, Raw: raw}
}

func errorEvent(message string) hostclient.AgentEvent {
	raw, _ := json.Marshal(map[string]any{
		"type":  hostclient.AgentEventTypeError,
		"error": message,
	})
	return hostclient.AgentEvent{Type: hostclient.AgentEventTypeError, Raw: raw}
}

func TestBridge_ChunkMode_FlushOnAgentEnd(t *testing.T) {
	tr := newFakeTransport(transport.Capabilities{SupportsMessageEdit: false, MaxMessageLength: 1000})
	b := New(tr, "c1")

	events := make(chan hostclient.AgentEvent, 8)
	events <- textDelta("hello ")
	events <- textDelta("world")
	events <- plainEvent(hostclient.AgentEventTypeAgentEnd)
	close(events)

	if err := b.Run(context.Background(), events); err != nil {
		t.Fatal(err)
	}

	calls := tr.snapshot()
	if len(calls) != 1 {
		t.Fatalf("expected 1 send, got %d: %+v", len(calls), calls)
	}
	if calls[0].Text != "hello world" {
		t.Errorf("got %q", calls[0].Text)
	}
}

func TestBridge_ChunkMode_ParagraphBoundary(t *testing.T) {
	tr := newFakeTransport(transport.Capabilities{SupportsMessageEdit: false, MaxMessageLength: 1000})
	b := New(tr, "c1")

	events := make(chan hostclient.AgentEvent, 8)
	events <- textDelta("first paragraph\n\nsecond paragraph")
	events <- plainEvent(hostclient.AgentEventTypeAgentEnd)
	close(events)

	_ = b.Run(context.Background(), events)

	calls := tr.snapshot()
	if len(calls) != 2 {
		t.Fatalf("expected paragraph split into 2 sends, got %d: %+v", len(calls), calls)
	}
	if calls[0].Text != "first paragraph" {
		t.Errorf("first chunk wrong: %q", calls[0].Text)
	}
	if calls[1].Text != "second paragraph" {
		t.Errorf("second chunk wrong: %q", calls[1].Text)
	}
}

func TestBridge_ChunkMode_HardLengthCap(t *testing.T) {
	tr := newFakeTransport(transport.Capabilities{SupportsMessageEdit: false, MaxMessageLength: 10})
	b := New(tr, "c1")

	events := make(chan hostclient.AgentEvent, 8)
	events <- textDelta("0123456789ABCDEFGHIJ") // 20 chars
	events <- plainEvent(hostclient.AgentEventTypeAgentEnd)
	close(events)

	_ = b.Run(context.Background(), events)

	calls := tr.snapshot()
	if len(calls) < 2 {
		t.Fatalf("expected at least 2 chunks for 20 chars at limit 10, got %d", len(calls))
	}
	for _, c := range calls {
		if len(c.Text) > 10 {
			t.Errorf("chunk over hard cap: %q (%d)", c.Text, len(c.Text))
		}
	}
}

func TestBridge_EditMode_StreamsViaEdits(t *testing.T) {
	tr := newFakeTransport(transport.Capabilities{SupportsMessageEdit: true, MaxMessageLength: 0})
	b := New(tr, "c1")

	events := make(chan hostclient.AgentEvent, 8)
	events <- textDelta("hello ")
	events <- textDelta("world ")
	events <- textDelta("agent")
	events <- plainEvent(hostclient.AgentEventTypeAgentEnd)
	close(events)

	if err := b.Run(context.Background(), events); err != nil {
		t.Fatal(err)
	}

	calls := tr.snapshot()
	// First call should be a send (initial message), subsequent are edits.
	if calls[0].Action != "send" {
		t.Errorf("first action should be send, got %q", calls[0].Action)
	}
	last := calls[len(calls)-1]
	if !strings.Contains(last.Text, "hello world agent") {
		t.Errorf("final text should be the full accumulated text, got %q", last.Text)
	}
	// Final emission must equal the entire stream — this is what the
	// flush-on-agent_end guarantees.
}

func TestBridge_EditMode_FlushSplitsAcrossMessageEnd(t *testing.T) {
	tr := newFakeTransport(transport.Capabilities{SupportsMessageEdit: true, MaxMessageLength: 0})
	b := New(tr, "c1")

	events := make(chan hostclient.AgentEvent, 8)
	events <- textDelta("first message")
	events <- plainEvent(hostclient.AgentEventTypeMessageEnd)
	events <- textDelta("second message")
	events <- plainEvent(hostclient.AgentEventTypeAgentEnd)
	close(events)

	_ = b.Run(context.Background(), events)

	calls := tr.snapshot()
	// We should see at least two SENDs (one per message_end boundary),
	// because flush resets editMessageID.
	sendCount := 0
	for _, c := range calls {
		if c.Action == "send" {
			sendCount++
		}
	}
	if sendCount < 2 {
		t.Errorf("expected at least 2 sends across message boundaries, got %d in %+v", sendCount, calls)
	}
}

func TestBridge_ToolExecutionFlushes(t *testing.T) {
	tr := newFakeTransport(transport.Capabilities{SupportsMessageEdit: false, MaxMessageLength: 1000})
	b := New(tr, "c1")

	events := make(chan hostclient.AgentEvent, 8)
	events <- textDelta("running tool now")
	events <- plainEvent(hostclient.AgentEventTypeToolExecutionStart)
	events <- textDelta("post-tool text")
	events <- plainEvent(hostclient.AgentEventTypeAgentEnd)
	close(events)

	_ = b.Run(context.Background(), events)

	calls := tr.snapshot()
	if len(calls) != 2 {
		t.Fatalf("expected pre-tool flush + post-tool send = 2 calls, got %d: %+v", len(calls), calls)
	}
	if calls[0].Text != "running tool now" {
		t.Errorf("first call: %q", calls[0].Text)
	}
	if calls[1].Text != "post-tool text" {
		t.Errorf("second call: %q", calls[1].Text)
	}
}

func TestBridge_ErrorEventForwarded(t *testing.T) {
	tr := newFakeTransport(transport.Capabilities{SupportsMessageEdit: false, MaxMessageLength: 1000})
	b := New(tr, "c1")

	events := make(chan hostclient.AgentEvent, 8)
	events <- errorEvent("model unavailable")
	close(events)

	_ = b.Run(context.Background(), events)

	calls := tr.snapshot()
	if len(calls) != 1 || !strings.Contains(calls[0].Text, "model unavailable") {
		t.Errorf("expected error message in send, got %+v", calls)
	}
}

func TestBridge_ContextCancellation(t *testing.T) {
	tr := newFakeTransport(transport.Capabilities{SupportsMessageEdit: false, MaxMessageLength: 1000})
	b := New(tr, "c1")

	ctx, cancel := context.WithCancel(context.Background())
	events := make(chan hostclient.AgentEvent)
	done := make(chan error)
	go func() { done <- b.Run(ctx, events) }()

	cancel()
	select {
	case err := <-done:
		if err == nil {
			t.Error("expected context cancellation error")
		}
	case <-time.After(time.Second):
		t.Error("Run did not return after cancel")
	}
}

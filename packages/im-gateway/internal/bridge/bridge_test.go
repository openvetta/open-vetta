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

func (f *fakeTransport) EndStream(_ context.Context, chatID, messageID string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, transportCall{Action: "endstream", ChatID: chatID, MessageID: messageID})
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

func thinkingDelta(text string) hostclient.AgentEvent {
	raw, _ := json.Marshal(map[string]any{
		"type": hostclient.AgentEventTypeMessageUpdate,
		"assistantMessageEvent": map[string]any{
			"type":  "thinking_delta",
			"delta": text,
		},
	})
	return hostclient.AgentEvent{Type: hostclient.AgentEventTypeMessageUpdate, Raw: raw}
}

func toolcallDelta(text string) hostclient.AgentEvent {
	raw, _ := json.Marshal(map[string]any{
		"type": hostclient.AgentEventTypeMessageUpdate,
		"assistantMessageEvent": map[string]any{
			"type":  "toolcall_delta",
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

func TestBridge_ChunkMode_NoParagraphSplit(t *testing.T) {
	// Updated contract: chunk mode buffers the full assistant message and
	// emits it as ONE IM message at flush time. We deliberately do not
	// auto-split on paragraph boundaries so the user gets a coherent
	// answer instead of a flood of small messages whenever the agent
	// uses markdown.
	tr := newFakeTransport(transport.Capabilities{SupportsMessageEdit: false, MaxMessageLength: 1000})
	b := New(tr, "c1")

	events := make(chan hostclient.AgentEvent, 8)
	events <- textDelta("first paragraph\n\nsecond paragraph")
	events <- plainEvent(hostclient.AgentEventTypeAgentEnd)
	close(events)

	_ = b.Run(context.Background(), events)

	calls := tr.snapshot()
	if len(calls) != 1 {
		t.Fatalf("expected single send (no paragraph split), got %d: %+v", len(calls), calls)
	}
	if calls[0].Text != "first paragraph\n\nsecond paragraph" {
		t.Errorf("expected the full text in one message, got %q", calls[0].Text)
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
	// The last *content-bearing* call (send/edit) must contain the full
	// accumulated text — this is what the flush-on-agent_end guarantees.
	// The very last call may be an endstream which carries no text.
	var lastContentful transportCall
	for _, c := range calls {
		if c.Action == "send" || c.Action == "edit" {
			lastContentful = c
		}
	}
	if !strings.Contains(lastContentful.Text, "hello world agent") {
		t.Errorf("final text should be the full accumulated text, got %q", lastContentful.Text)
	}
	// And the very last call should be EndStream so the cardkit-style
	// transports get a chance to clean up server state.
	if calls[len(calls)-1].Action != "endstream" {
		t.Errorf("expected final action to be endstream, got %q", calls[len(calls)-1].Action)
	}
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

func TestBridge_FiltersThinkingAndToolcallDeltas(t *testing.T) {
	// Regression for the "We" bug: with the agent emitting thinking_delta /
	// toolcall_delta events before the final text_delta, the bridge used to
	// forward the agent's internal monologue and JSON-args fragments to IM.
	// Result: users saw a single word ("We") then nothing while the bot
	// silently churned through reasoning. This test pins the contract that
	// only text_delta reaches the transport.
	tr := newFakeTransport(transport.Capabilities{SupportsMessageEdit: true, MaxMessageLength: 0})
	b := New(tr, "c1")

	events := make(chan hostclient.AgentEvent, 32)
	// 1. Thinking phase — should NOT produce IM messages
	events <- thinkingDelta("We need to ")
	events <- thinkingDelta("call the dir_tree tool")
	// 2. Tool call phase — also hidden
	events <- toolcallDelta("{\"path\":")
	events <- toolcallDelta("\"/foo\"}")
	events <- plainEvent(hostclient.AgentEventTypeToolExecutionStart)
	events <- plainEvent(hostclient.AgentEventTypeToolExecutionEnd)
	// 3. Real text response
	events <- textDelta("项目根目录: ")
	events <- textDelta("cmd, docs, internal")
	events <- plainEvent(hostclient.AgentEventTypeAgentEnd)
	close(events)

	if err := b.Run(context.Background(), events); err != nil {
		t.Fatal(err)
	}

	calls := tr.snapshot()
	combined := ""
	for _, c := range calls {
		combined += c.Text + "\n"
	}

	// Must NOT contain any thinking content
	for _, banned := range []string{"We need", "dir_tree", "{\"path", "/foo"} {
		if strings.Contains(combined, banned) {
			t.Errorf("bridge leaked internal content %q to IM:\n%s", banned, combined)
		}
	}
	// Must contain the actual text answer
	for _, want := range []string{"项目根目录", "cmd, docs, internal"} {
		if !strings.Contains(combined, want) {
			t.Errorf("bridge dropped real text %q\ngot:\n%s", want, combined)
		}
	}
}

func TestBridge_ReturnsOnAgentEndEvenIfChannelStaysOpen(t *testing.T) {
	// Regression: Run used to wait for events to close, but the channel
	// only closes when the subprocess dies. Real coding-agent --mode rpc
	// stays alive across turns, so the bridge MUST return on agent_end
	// or the per-conversation goroutine deadlocks and the user can only
	// ever exchange one message.
	tr := newFakeTransport(transport.Capabilities{SupportsMessageEdit: false, MaxMessageLength: 1000})
	b := New(tr, "c1")

	events := make(chan hostclient.AgentEvent, 8)
	events <- textDelta("hi")
	events <- plainEvent(hostclient.AgentEventTypeAgentEnd)
	// Deliberately do NOT close(events) — simulates a long-lived subprocess.

	done := make(chan error, 1)
	go func() { done <- b.Run(context.Background(), events) }()

	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("Run returned error: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Run did not return after agent_end with channel still open — multi-turn conversations would deadlock")
	}

	calls := tr.snapshot()
	if len(calls) != 1 || calls[0].Text != "hi" {
		t.Errorf("expected single send 'hi', got %+v", calls)
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

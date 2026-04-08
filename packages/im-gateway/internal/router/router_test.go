package router

import (
	"context"
	"encoding/json"
	"strings"
	"sync"
	"testing"
	"time"

	"vetta-im-gateway/internal/command"
	"vetta-im-gateway/internal/hostclient"
	"vetta-im-gateway/internal/projects"
	"vetta-im-gateway/internal/state"
	"vetta-im-gateway/internal/transport"
)

// =============================================================================
// fakes
// =============================================================================

type fakeProjects struct {
	list []projects.Project
}

func (f *fakeProjects) List(_ context.Context) ([]projects.Project, error) {
	out := make([]projects.Project, len(f.list))
	copy(out, f.list)
	return out, nil
}
func (f *fakeProjects) Resolve(_ context.Context, name string) (*projects.Project, error) {
	for i := range f.list {
		if f.list[i].Name == name {
			p := f.list[i]
			return &p, nil
		}
	}
	return nil, projects.ErrProjectNotFound
}

type fakeStore struct {
	mu      sync.Mutex
	entries map[string]state.SessionEntry
}

func newFakeStore() *fakeStore { return &fakeStore{entries: make(map[string]state.SessionEntry)} }

func (s *fakeStore) Load(_ context.Context) (state.RouterState, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := state.RouterState{Version: state.CurrentVersion, Sessions: make(map[string]state.SessionEntry)}
	for k, v := range s.entries {
		out.Sessions[k] = v
	}
	return out, nil
}
func (s *fakeStore) Save(_ context.Context, _ state.RouterState) error { return nil }
func (s *fakeStore) GetSession(_ context.Context, userID, projectID string) (state.SessionEntry, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	e, ok := s.entries[state.SessionKey(userID, projectID)]
	return e, ok, nil
}
func (s *fakeStore) SetSession(_ context.Context, e state.SessionEntry) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.entries[state.SessionKey(e.UserID, e.ProjectID)] = e
	return nil
}

// fakeTransport captures sends so tests can assert.
type fakeTransport struct {
	caps   transport.Capabilities
	mu     sync.Mutex
	sends  []sendRecord
	nextID int
}

type sendRecord struct {
	ChatID string
	Text   string
}

func newFakeTransport() *fakeTransport {
	return &fakeTransport{
		caps: transport.Capabilities{
			SupportsMessageEdit: false,
			MaxMessageLength:    1000,
		},
	}
}

func (t *fakeTransport) Name() string                         { return "fake" }
func (t *fakeTransport) Capabilities() transport.Capabilities { return t.caps }
func (t *fakeTransport) Start(_ context.Context, _ transport.MessageHandler) error {
	return nil
}
func (t *fakeTransport) Stop() error { return nil }
func (t *fakeTransport) SendMessage(_ context.Context, chatID string, msg transport.OutboundMessage) (string, error) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.nextID++
	t.sends = append(t.sends, sendRecord{ChatID: chatID, Text: msg.Text})
	return "m" + itoa(t.nextID), nil
}
func (t *fakeTransport) EditMessage(_ context.Context, _, _ string, _ transport.OutboundMessage) error {
	return nil
}
func (t *fakeTransport) DeleteMessage(_ context.Context, _, _ string) error { return nil }
func (t *fakeTransport) ShowTyping(_ context.Context, _ string) error       { return nil }

func (t *fakeTransport) snapshot() []sendRecord {
	t.mu.Lock()
	defer t.mu.Unlock()
	out := make([]sendRecord, len(t.sends))
	copy(out, t.sends)
	return out
}

func itoa(n int) string {
	s := ""
	for n > 0 {
		s = string('0'+rune(n%10)) + s
		n /= 10
	}
	if s == "" {
		s = "0"
	}
	return s
}

func TestRouter_PlainPromptForwardsToAgent(t *testing.T) {
	tr := newFakeTransport()
	st := newFakeStore()
	prj := &fakeProjects{list: []projects.Project{
		{ID: "id-foo", Name: "foo", Path: "/code/foo"},
	}}
	// Pretend the user already used /use foo
	_ = st.SetSession(context.Background(), state.SessionEntry{
		UserID: "u1", ProjectID: "id-foo", SessionPath: "/sessions/foo.jsonl",
	})

	pool := hostclient.NewProcessPool(&streamingFakeClient{reply: "hi"}, 4)
	r := New(tr, command.NewRouter(), st, prj, pool)
	defer r.Shutdown()

	if err := r.HandleInbound(context.Background(), transport.InboundMessage{
		Platform: "fake", ChatID: "c1", UserID: "u1", MessageID: "m1", Text: "hello agent",
	}); err != nil {
		t.Fatal(err)
	}

	// Wait for the bridge to drain
	waitForSend(t, tr, 1, 2*time.Second)

	got := tr.snapshot()
	if len(got) == 0 {
		t.Fatal("expected at least one outbound message")
	}
	last := got[len(got)-1]
	if !strings.Contains(last.Text, "hi") || !strings.Contains(last.Text, "hello agent") {
		t.Errorf("expected agent reply containing prompt echo, got %q", last.Text)
	}
}

func TestRouter_NoProjectSelected_AskUser(t *testing.T) {
	tr := newFakeTransport()
	st := newFakeStore()
	prj := &fakeProjects{list: []projects.Project{
		{ID: "id-foo", Name: "foo", Path: "/code/foo"},
	}}
	pool := hostclient.NewProcessPool(&streamingFakeClient{}, 4)
	r := New(tr, command.NewRouter(), st, prj, pool)
	defer r.Shutdown()

	_ = r.HandleInbound(context.Background(), transport.InboundMessage{
		Platform: "fake", ChatID: "c1", UserID: "u1", Text: "hello",
	})
	waitForSend(t, tr, 1, 2*time.Second)

	got := tr.snapshot()
	if !strings.Contains(got[0].Text, "No project selected") {
		t.Errorf("got %q", got[0].Text)
	}
}

func TestRouter_CommandHandledLocally(t *testing.T) {
	tr := newFakeTransport()
	st := newFakeStore()
	prj := &fakeProjects{list: []projects.Project{
		{ID: "id-foo", Name: "foo", Path: "/code/foo"},
	}}
	pool := hostclient.NewProcessPool(&streamingFakeClient{}, 4)
	r := New(tr, command.NewRouter(), st, prj, pool)
	defer r.Shutdown()

	_ = r.HandleInbound(context.Background(), transport.InboundMessage{
		Platform: "fake", ChatID: "c1", UserID: "u1", Text: "/help",
	})
	waitForSend(t, tr, 1, 2*time.Second)

	got := tr.snapshot()
	if !strings.Contains(got[0].Text, "/help") {
		t.Errorf("expected help text, got %q", got[0].Text)
	}
}

func TestRouter_MultiUserParallelism(t *testing.T) {
	tr := newFakeTransport()
	st := newFakeStore()
	prj := &fakeProjects{list: []projects.Project{
		{ID: "id-foo", Name: "foo", Path: "/code/foo"},
	}}
	for _, u := range []string{"u1", "u2"} {
		_ = st.SetSession(context.Background(), state.SessionEntry{
			UserID: u, ProjectID: "id-foo", SessionPath: "/sessions/" + u + ".jsonl",
		})
	}
	pool := hostclient.NewProcessPool(&streamingFakeClient{reply: "ok"}, 4)
	r := New(tr, command.NewRouter(), st, prj, pool)
	defer r.Shutdown()

	for _, u := range []string{"u1", "u2"} {
		_ = r.HandleInbound(context.Background(), transport.InboundMessage{
			Platform: "fake", ChatID: "c-" + u, UserID: u, Text: "hi",
		})
	}
	waitForSend(t, tr, 2, 3*time.Second)

	got := tr.snapshot()
	chats := map[string]int{}
	for _, s := range got {
		chats[s.ChatID]++
	}
	if chats["c-u1"] == 0 || chats["c-u2"] == 0 {
		t.Errorf("both users should receive a reply, got %v", chats)
	}
}

// streamingFakeClient hands out a fresh streamingFakeSession on every Acquire.
type streamingFakeClient struct {
	reply string
}

func (c *streamingFakeClient) OpenSession(_ context.Context, _ string, sessionPath string) (hostclient.HostSession, error) {
	return &streamingFakeSession{
		path:   sessionPath,
		events: make(chan hostclient.AgentEvent, 16),
		reply:  c.reply,
	}, nil
}

type streamingFakeSession struct {
	path   string
	events chan hostclient.AgentEvent
	reply  string
}

func (s *streamingFakeSession) Send(_ context.Context, cmd hostclient.Command) (hostclient.Response, error) {
	if cmd.Type == hostclient.CommandTypePrompt {
		text := s.reply
		if text == "" {
			text = "echo:"
		}
		prompt, _ := cmd.Data["message"].(string)
		go func() {
			delta, _ := json.Marshal(map[string]any{
				"type": hostclient.AgentEventTypeMessageUpdate,
				"assistantMessageEvent": map[string]any{
					"type":  "text_delta",
					"delta": text + " " + prompt,
				},
			})
			end, _ := json.Marshal(map[string]any{"type": hostclient.AgentEventTypeAgentEnd})
			s.events <- hostclient.AgentEvent{Type: hostclient.AgentEventTypeMessageUpdate, Raw: delta}
			s.events <- hostclient.AgentEvent{Type: hostclient.AgentEventTypeAgentEnd, Raw: end}
			close(s.events)
		}()
		return hostclient.Response{Success: true}, nil
	}
	if cmd.Type == hostclient.CommandTypeGetState {
		return hostclient.Response{Success: true, Data: map[string]any{"sessionFile": s.path}}, nil
	}
	return hostclient.Response{Success: true}, nil
}
func (s *streamingFakeSession) Events() <-chan hostclient.AgentEvent { return s.events }
func (s *streamingFakeSession) SessionPath() string                  { return s.path }
func (s *streamingFakeSession) Close() error                         { return nil }

func waitForSend(t *testing.T, tr *fakeTransport, n int, timeout time.Duration) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if len(tr.snapshot()) >= n {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %d sends, got %d", n, len(tr.snapshot()))
}

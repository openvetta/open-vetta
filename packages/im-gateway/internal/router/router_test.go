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
func (t *fakeTransport) EndStream(_ context.Context, _, _ string) error     { return nil }

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

func TestRouter_UseThenPromptResolvesEmptySessionPath(t *testing.T) {
	// Regression: /use stores an empty SessionPath when the user picks a
	// project for the first time. findCurrentProject must still surface
	// that project, and forwardToAgent must persist the agent's real
	// sessionFile after the first prompt so subsequent prompts reuse it.
	tr := newFakeTransport()
	st := newFakeStore()
	prj := &fakeProjects{list: []projects.Project{
		{ID: "id-foo", Name: "foo", Path: "/code/foo"},
	}}
	// Simulate /use foo: empty SessionPath, current UpdatedAt
	_ = st.SetSession(context.Background(), state.SessionEntry{
		UserID: "u1", ProjectID: "id-foo", SessionPath: "",
	})

	pool := hostclient.NewProcessPool(&streamingFakeClient{reply: "ok"}, 4)
	r := New(tr, command.NewRouter(), st, prj, pool)
	defer r.Shutdown()

	if err := r.HandleInbound(context.Background(), transport.InboundMessage{
		Platform: "fake", ChatID: "c1", UserID: "u1", MessageID: "m1", Text: "hello",
	}); err != nil {
		t.Fatal(err)
	}
	waitForSend(t, tr, 1, 2*time.Second)

	got := tr.snapshot()
	if len(got) == 0 {
		t.Fatal("expected agent reply, got nothing")
	}
	if strings.Contains(got[0].Text, "No project selected") {
		t.Errorf("router lost track of /use'd project after empty SessionPath: %q", got[0].Text)
	}

	// State should now have the resolved sessionPath written back.
	entry, ok, _ := st.GetSession(context.Background(), "u1", "id-foo")
	if !ok {
		t.Fatal("entry disappeared")
	}
	if entry.SessionPath == "" {
		t.Error("forwardToAgent should have persisted the resolved sessionPath")
	}
}

func TestRouter_StaleSessionPathFromOtherProjectIsDropped(t *testing.T) {
	// Regression: a previous (buggy) run could persist a sessionPath rooted
	// in project A while the user was switching to project B. coding-agent
	// embeds the cwd in the session-file's parent directory name, so the
	// gateway can detect the mismatch by re-encoding the project's cwd and
	// comparing against the persisted path's parent. When they disagree we
	// must NOT reuse the stale file (it would replay an unrelated history
	// AND make the agent operate on the wrong directory). Instead we drop
	// it and let the agent create a fresh session for the current cwd.
	tr := newFakeTransport()
	st := newFakeStore()
	prj := &fakeProjects{list: []projects.Project{
		{ID: "id-tobacco", Name: "烟草", Path: "/Users/m4/Desktop/烟草"},
	}}
	// Stale entry: path rooted in im-gateway, project is 烟草.
	stalePath := "/Users/m4/.vetta/agent/sessions/--Users-m4-Documents-dev-opensource-vetta-mono-packages-im-gateway--/old.jsonl"
	_ = st.SetSession(context.Background(), state.SessionEntry{
		UserID: "u1", ProjectID: "id-tobacco", SessionPath: stalePath,
	})

	fc := &recordingFakeClient{reply: "ok"}
	pool := hostclient.NewProcessPool(fc, 4)
	r := New(tr, command.NewRouter(), st, prj, pool)
	defer r.Shutdown()

	if err := r.HandleInbound(context.Background(), transport.InboundMessage{
		Platform: "fake", ChatID: "c1", UserID: "u1", Text: "hello",
	}); err != nil {
		t.Fatal(err)
	}
	waitForSend(t, tr, 1, 2*time.Second)

	// The router must have called OpenSession with an EMPTY sessionPath,
	// not the stale one.
	fc.mu.Lock()
	defer fc.mu.Unlock()
	if len(fc.opens) == 0 {
		t.Fatal("expected at least one OpenSession call")
	}
	if got := fc.opens[0].sessionPath; got != "" {
		t.Errorf("router reused stale sessionPath %q; expected empty so a fresh session is created", got)
	}
	if got := fc.opens[0].cwd; got != "/Users/m4/Desktop/烟草" {
		t.Errorf("OpenSession cwd: %q", got)
	}

	// And the writeback should have replaced the stale entry with the
	// resolved (synthesized) path from the new session.
	entry, _, _ := st.GetSession(context.Background(), "u1", "id-tobacco")
	if entry.SessionPath == stalePath || entry.SessionPath == "" {
		t.Errorf("stale entry should be replaced with resolved path, got %q", entry.SessionPath)
	}
}

func TestEncodeCwdFolder(t *testing.T) {
	// Pinned against coding-agent's getDefaultSessionDir(): the encoding
	// is `--<cwd-with-leading-slash-stripped, /\\: → ->--`. If the upstream
	// scheme changes, this test fails and forces us to update both sides.
	cases := map[string]string{
		"/Users/m4/Desktop/烟草": "--Users-m4-Desktop-烟草--",
		"/code/foo":             "--code-foo--",
		"/a/b:c/d":              "--a-b-c-d--",
	}
	for in, want := range cases {
		if got := encodeCwdFolder(in); got != want {
			t.Errorf("encodeCwdFolder(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestSessionPathMatchesCwd(t *testing.T) {
	cwd := "/Users/m4/Desktop/烟草"
	good := "/Users/m4/.vetta/agent/sessions/--Users-m4-Desktop-烟草--/foo.jsonl"
	bad := "/Users/m4/.vetta/agent/sessions/--Users-m4-Documents-dev-opensource-vetta-mono-packages-im-gateway--/foo.jsonl"
	if !sessionPathMatchesCwd(good, cwd) {
		t.Error("good path should match")
	}
	if sessionPathMatchesCwd(bad, cwd) {
		t.Error("bad path should NOT match")
	}
	if !sessionPathMatchesCwd("", cwd) {
		t.Error("empty sessionPath is a no-opinion case and must not be rejected")
	}
}

// recordingFakeClient is like streamingFakeClient but also records every
// OpenSession invocation so tests can assert on what the router actually
// passed (cwd, sessionPath).
type recordingFakeClient struct {
	reply string
	mu    sync.Mutex
	opens []openCall
}

type openCall struct {
	cwd         string
	sessionPath string
}

func (c *recordingFakeClient) OpenSession(_ context.Context, cwd string, sessionPath string) (hostclient.HostSession, error) {
	c.mu.Lock()
	c.opens = append(c.opens, openCall{cwd: cwd, sessionPath: sessionPath})
	c.mu.Unlock()
	resolved := sessionPath
	if resolved == "" {
		resolved = "/sessions/synthesized/fake.jsonl"
	}
	return &streamingFakeSession{
		path:   resolved,
		events: make(chan hostclient.AgentEvent, 16),
		reply:  c.reply,
	}, nil
}

func TestRouter_PlainPromptForwardsToAgent(t *testing.T) {
	tr := newFakeTransport()
	st := newFakeStore()
	prj := &fakeProjects{list: []projects.Project{
		{ID: "id-foo", Name: "foo", Path: "/code/foo"},
	}}
	// Pretend the user already used /use foo. The persisted sessionPath
	// must live under the encoded-cwd folder; otherwise the stale-entry
	// validator drops it.
	_ = st.SetSession(context.Background(), state.SessionEntry{
		UserID: "u1", ProjectID: "id-foo", SessionPath: "/sessions/--code-foo--/foo.jsonl",
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
	// Persisted sessionPaths must live under the encoded-cwd folder so the
	// stale-entry validator (sessionPathMatchesCwd) does not drop them.
	for _, u := range []string{"u1", "u2"} {
		_ = st.SetSession(context.Background(), state.SessionEntry{
			UserID:      u,
			ProjectID:   "id-foo",
			SessionPath: "/sessions/--code-foo--/" + u + ".jsonl",
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
	resolved := sessionPath
	if resolved == "" {
		// Simulate the real local hostclient: when the caller passes an
		// empty path, the agent invents a fresh session file and returns
		// it via the handshake's get_state. SessionPath() should report
		// the resolved value.
		resolved = "/sessions/synthesized/" + sessionPath + "fake.jsonl"
	}
	return &streamingFakeSession{
		path:   resolved,
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

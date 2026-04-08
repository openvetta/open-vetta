package command

import (
	"context"
	"errors"
	"maps"
	"strings"
	"testing"

	"vetta-im-gateway/internal/hostclient"
	"vetta-im-gateway/internal/projects"
	"vetta-im-gateway/internal/state"
)

// fakeProjects implements projects.ProjectDirectory in-memory.
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

// fakeStore is a minimal in-memory state.Store implementation.
type fakeStore struct {
	entries map[string]state.SessionEntry
}

func newFakeStore() *fakeStore { return &fakeStore{entries: make(map[string]state.SessionEntry)} }

func (s *fakeStore) Load(_ context.Context) (state.RouterState, error) {
	out := state.RouterState{Version: state.CurrentVersion, Sessions: make(map[string]state.SessionEntry)}
	maps.Copy(out.Sessions, s.entries)
	return out, nil
}

func (s *fakeStore) Save(_ context.Context, st state.RouterState) error {
	s.entries = make(map[string]state.SessionEntry)
	maps.Copy(s.entries, st.Sessions)
	return nil
}

func (s *fakeStore) GetSession(_ context.Context, userID, projectID string) (state.SessionEntry, bool, error) {
	e, ok := s.entries[state.SessionKey(userID, projectID)]
	return e, ok, nil
}

func (s *fakeStore) SetSession(_ context.Context, e state.SessionEntry) error {
	s.entries[state.SessionKey(e.UserID, e.ProjectID)] = e
	return nil
}

// fakePool / fakeSession implement HostPool / hostclient.HostSession.
type fakePool struct {
	openErr     error
	openedPaths []string
	stats       hostclient.Stats
}

func (p *fakePool) Acquire(_ context.Context, _ string, sessionPath string) (*hostclient.Acquired, error) {
	if p.openErr != nil {
		return nil, p.openErr
	}
	p.openedPaths = append(p.openedPaths, sessionPath)
	return &hostclient.Acquired{Session: &fakeSess{path: sessionPath}}, nil
}

func (p *fakePool) Stats() hostclient.Stats { return p.stats }

type fakeSess struct {
	path string
}

func (s *fakeSess) Send(_ context.Context, cmd hostclient.Command) (hostclient.Response, error) {
	switch cmd.Type {
	case hostclient.CommandTypeGetState:
		return hostclient.Response{
			Success: true,
			Data:    map[string]any{"sessionFile": "/sessions/u1/proj-foo.jsonl"},
		}, nil
	}
	return hostclient.Response{Success: true}, nil
}
func (s *fakeSess) Events() <-chan hostclient.AgentEvent { ch := make(chan hostclient.AgentEvent); close(ch); return ch }
func (s *fakeSess) SessionPath() string                  { return s.path }
func (s *fakeSess) Close() error                         { return nil }

func defaultEnv() Env {
	return Env{
		UserID: "u1",
		ChatID: "c1",
		Projects: &fakeProjects{
			list: []projects.Project{
				{ID: "id-foo", Name: "foo", Path: "/code/foo"},
				{ID: "id-bar", Name: "bar", Path: "/code/bar"},
			},
		},
		State:    newFakeStore(),
		HostPool: &fakePool{},
	}
}

func TestDispatch_NotACommand(t *testing.T) {
	r := NewRouter()
	res, err := r.Dispatch(context.Background(), defaultEnv(), "hello world")
	if err != nil {
		t.Fatal(err)
	}
	if !res.NotACommand {
		t.Error("plain text should be NotACommand")
	}
}

func TestDispatch_UnknownCommand(t *testing.T) {
	r := NewRouter()
	res, err := r.Dispatch(context.Background(), defaultEnv(), "/nope")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(res.Reply.Text, "unknown command") {
		t.Errorf("expected unknown-command reply, got %q", res.Reply.Text)
	}
}

func TestDispatch_Help(t *testing.T) {
	r := NewRouter()
	res, _ := r.Dispatch(context.Background(), defaultEnv(), "/help")
	for _, want := range []string{"/projects", "/use", "/new", "/whoami", "/help"} {
		if !strings.Contains(res.Reply.Text, want) {
			t.Errorf("/help should mention %s, got:\n%s", want, res.Reply.Text)
		}
	}
}

func TestDispatch_Projects_Empty(t *testing.T) {
	r := NewRouter()
	env := defaultEnv()
	env.Projects = &fakeProjects{} // empty list
	res, _ := r.Dispatch(context.Background(), env, "/projects")
	if !strings.Contains(res.Reply.Text, "No projects") {
		t.Errorf("got %q", res.Reply.Text)
	}
}

func TestDispatch_Projects_ListsAndMarksCurrent(t *testing.T) {
	r := NewRouter()
	env := defaultEnv()
	// Pretend the user is currently using foo
	_ = env.State.SetSession(context.Background(), state.SessionEntry{
		UserID: "u1", ProjectID: "id-foo", SessionPath: "/sessions/foo.jsonl",
	})
	res, _ := r.Dispatch(context.Background(), env, "/projects")
	if !strings.Contains(res.Reply.Text, "* foo") {
		t.Errorf("current project should be marked with *, got:\n%s", res.Reply.Text)
	}
	if !strings.Contains(res.Reply.Text, "  bar") {
		t.Errorf("non-current project should not be marked, got:\n%s", res.Reply.Text)
	}
}

func TestDispatch_Use_NotFound(t *testing.T) {
	r := NewRouter()
	res, _ := r.Dispatch(context.Background(), defaultEnv(), "/use ghost")
	if !strings.Contains(res.Reply.Text, "not found") {
		t.Errorf("got %q", res.Reply.Text)
	}
}

func TestDispatch_Use_NoArg(t *testing.T) {
	r := NewRouter()
	res, _ := r.Dispatch(context.Background(), defaultEnv(), "/use")
	if !strings.Contains(res.Reply.Text, "Usage") {
		t.Errorf("got %q", res.Reply.Text)
	}
}

func TestDispatch_Use_Success(t *testing.T) {
	r := NewRouter()
	env := defaultEnv()
	res, _ := r.Dispatch(context.Background(), env, "/use foo")
	if !strings.Contains(res.Reply.Text, "Switched to project") {
		t.Errorf("got %q", res.Reply.Text)
	}
	if !res.Mutated {
		t.Error("Use should set Mutated=true")
	}
}

func TestDispatch_Use_LockedSession(t *testing.T) {
	r := NewRouter()
	env := defaultEnv()
	// Seed state with a sessionPath so /use will probe via hostpool
	_ = env.State.SetSession(context.Background(), state.SessionEntry{
		UserID: "u1", ProjectID: "id-foo", SessionPath: "/sessions/foo.jsonl",
	})
	env.HostPool = &fakePool{
		openErr: &hostclient.ErrSessionLocked{
			LockPath: "/sessions/foo.jsonl.lock",
			Holder: hostclient.LockHolder{
				PID: 12345, Hostname: "macbook", OpenedAt: "2024-01-01T00:00:00Z",
			},
		},
	}
	res, _ := r.Dispatch(context.Background(), env, "/use foo")
	if !strings.Contains(res.Reply.Text, "currently open elsewhere") {
		t.Errorf("expected lock-conflict explanation, got %q", res.Reply.Text)
	}
	if !strings.Contains(res.Reply.Text, "12345") {
		t.Errorf("reply should include holder pid, got %q", res.Reply.Text)
	}
}

func TestDispatch_Use_OtherErrorPropagates(t *testing.T) {
	r := NewRouter()
	env := defaultEnv()
	_ = env.State.SetSession(context.Background(), state.SessionEntry{
		UserID: "u1", ProjectID: "id-foo", SessionPath: "/sessions/foo.jsonl",
	})
	env.HostPool = &fakePool{openErr: errors.New("boom")}
	res, _ := r.Dispatch(context.Background(), env, "/use foo")
	if !strings.Contains(res.Reply.Text, "Could not open") {
		t.Errorf("got %q", res.Reply.Text)
	}
}

func TestDispatch_New_NoProjectSelected(t *testing.T) {
	r := NewRouter()
	res, _ := r.Dispatch(context.Background(), defaultEnv(), "/new")
	if !strings.Contains(res.Reply.Text, "No project selected") {
		t.Errorf("got %q", res.Reply.Text)
	}
}

func TestDispatch_New_PersistsSessionPath(t *testing.T) {
	r := NewRouter()
	env := defaultEnv()
	_ = env.State.SetSession(context.Background(), state.SessionEntry{
		UserID: "u1", ProjectID: "id-foo", SessionPath: "/old/path.jsonl",
	})
	res, _ := r.Dispatch(context.Background(), env, "/new")
	if !strings.Contains(res.Reply.Text, "New session started") {
		t.Errorf("got %q", res.Reply.Text)
	}
	entry, ok, _ := env.State.GetSession(context.Background(), "u1", "id-foo")
	if !ok {
		t.Fatal("expected session entry to exist")
	}
	// fakeSess returns "/sessions/u1/proj-foo.jsonl" from get_state
	if entry.SessionPath != "/sessions/u1/proj-foo.jsonl" {
		t.Errorf("session path should be updated from get_state response, got %q", entry.SessionPath)
	}
}

func TestDispatch_Whoami_NoProject(t *testing.T) {
	r := NewRouter()
	res, _ := r.Dispatch(context.Background(), defaultEnv(), "/whoami")
	if !strings.Contains(res.Reply.Text, "(none") {
		t.Errorf("got %q", res.Reply.Text)
	}
}

func TestDispatch_Whoami_WithProject(t *testing.T) {
	r := NewRouter()
	env := defaultEnv()
	_ = env.State.SetSession(context.Background(), state.SessionEntry{
		UserID: "u1", ProjectID: "id-foo", SessionPath: "/sessions/foo.jsonl",
	})
	res, _ := r.Dispatch(context.Background(), env, "/whoami")
	for _, want := range []string{"User: u1", "Project: foo", "/sessions/foo.jsonl"} {
		if !strings.Contains(res.Reply.Text, want) {
			t.Errorf("/whoami should contain %q, got:\n%s", want, res.Reply.Text)
		}
	}
}

func TestSplitArgs_BasicAndQuoted(t *testing.T) {
	cases := map[string][]string{
		"foo":               {"foo"},
		"foo bar":           {"foo", "bar"},
		`use "my project"`:  {"use", "my project"},
		"  trim  ":          {"trim"},
		"":                  nil,
	}
	for in, want := range cases {
		got := splitArgs(in)
		if len(got) != len(want) {
			t.Errorf("splitArgs(%q) length: got %d want %d", in, len(got), len(want))
			continue
		}
		for i := range got {
			if got[i] != want[i] {
				t.Errorf("splitArgs(%q)[%d] = %q, want %q", in, i, got[i], want[i])
			}
		}
	}
}

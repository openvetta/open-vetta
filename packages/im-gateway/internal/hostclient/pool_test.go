package hostclient

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
)

// fakeClient implements HostClient for pool tests. Keeps track of how many
// times each path was opened so tests can verify reuse vs. fresh open.
type fakeClient struct {
	mu        sync.Mutex
	opens     map[string]int
	failOn    map[string]error // OpenSession returns this error for the given path
	sessions  map[string]*fakeSession
}

func newFakeClient() *fakeClient {
	return &fakeClient{
		opens:    make(map[string]int),
		failOn:   make(map[string]error),
		sessions: make(map[string]*fakeSession),
	}
}

func (f *fakeClient) OpenSession(_ context.Context, _ string, sessionPath string) (HostSession, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.opens[sessionPath]++
	if err, ok := f.failOn[sessionPath]; ok {
		return nil, err
	}
	s := &fakeSession{path: sessionPath, events: make(chan AgentEvent, 1)}
	f.sessions[sessionPath] = s
	return s, nil
}

func (f *fakeClient) opensFor(path string) int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.opens[path]
}

type fakeSession struct {
	path     string
	events   chan AgentEvent
	closed   atomic.Bool
	closeErr error
}

func (s *fakeSession) Send(_ context.Context, _ Command) (Response, error) {
	return Response{Success: true}, nil
}
func (s *fakeSession) Events() <-chan AgentEvent { return s.events }
func (s *fakeSession) SessionPath() string       { return s.path }
func (s *fakeSession) Close() error {
	if s.closed.Swap(true) {
		return nil
	}
	close(s.events)
	return s.closeErr
}

func TestProcessPool_ReusesExistingSession(t *testing.T) {
	c := newFakeClient()
	pool := NewProcessPool(c, 4)

	a, err := pool.Acquire(context.Background(), "/cwd", "/sessions/foo.jsonl")
	if err != nil {
		t.Fatal(err)
	}
	a.Release()

	b, err := pool.Acquire(context.Background(), "/cwd", "/sessions/foo.jsonl")
	if err != nil {
		t.Fatal(err)
	}
	b.Release()

	if got := c.opensFor("/sessions/foo.jsonl"); got != 1 {
		t.Errorf("expected 1 open, got %d", got)
	}
}

func TestProcessPool_DifferentPathsOpenSeparately(t *testing.T) {
	c := newFakeClient()
	pool := NewProcessPool(c, 4)

	a, _ := pool.Acquire(context.Background(), "/cwd", "/sessions/foo.jsonl")
	b, _ := pool.Acquire(context.Background(), "/cwd", "/sessions/bar.jsonl")
	defer a.Release()
	defer b.Release()

	if c.opensFor("/sessions/foo.jsonl") != 1 || c.opensFor("/sessions/bar.jsonl") != 1 {
		t.Errorf("each unique path should open exactly once: %v", c.opens)
	}
	if pool.Stats().Size != 2 {
		t.Errorf("expected pool size 2, got %d", pool.Stats().Size)
	}
}

func TestProcessPool_LRUEvictionWhenFull(t *testing.T) {
	c := newFakeClient()
	pool := NewProcessPool(c, 2)

	a, _ := pool.Acquire(context.Background(), "/cwd", "/foo.jsonl")
	a.Release()
	b, _ := pool.Acquire(context.Background(), "/cwd", "/bar.jsonl")
	b.Release()
	// foo is now LRU. Acquiring baz should evict foo.
	d, err := pool.Acquire(context.Background(), "/cwd", "/baz.jsonl")
	if err != nil {
		t.Fatal(err)
	}
	d.Release()

	if pool.Stats().Size != 2 {
		t.Errorf("pool size should still be 2, got %d", pool.Stats().Size)
	}
	// foo should have been closed.
	c.mu.Lock()
	fooSess := c.sessions["/foo.jsonl"]
	c.mu.Unlock()
	if fooSess == nil || !fooSess.closed.Load() {
		t.Error("evicted foo session should have been closed")
	}
}

func TestProcessPool_DoesNotEvictInFlight(t *testing.T) {
	c := newFakeClient()
	pool := NewProcessPool(c, 2)

	// foo and bar both held with in-flight=1
	a, _ := pool.Acquire(context.Background(), "/cwd", "/foo.jsonl")
	b, _ := pool.Acquire(context.Background(), "/cwd", "/bar.jsonl")
	defer a.Release()
	defer b.Release()

	// baz acquire must fail because no one is idle.
	_, err := pool.Acquire(context.Background(), "/cwd", "/baz.jsonl")
	if err == nil {
		t.Fatal("expected error: pool full + no idle")
	}
}

func TestProcessPool_BumpsLRUOnReuse(t *testing.T) {
	c := newFakeClient()
	pool := NewProcessPool(c, 2)

	a, _ := pool.Acquire(context.Background(), "/cwd", "/foo.jsonl")
	a.Release()
	b, _ := pool.Acquire(context.Background(), "/cwd", "/bar.jsonl")
	b.Release()

	// Reuse foo — now bar should be LRU instead of foo.
	a2, _ := pool.Acquire(context.Background(), "/cwd", "/foo.jsonl")
	a2.Release()

	// Acquiring baz should evict bar (now LRU) not foo.
	d, _ := pool.Acquire(context.Background(), "/cwd", "/baz.jsonl")
	defer d.Release()

	c.mu.Lock()
	fooClosed := c.sessions["/foo.jsonl"].closed.Load()
	barClosed := c.sessions["/bar.jsonl"].closed.Load()
	c.mu.Unlock()

	if fooClosed {
		t.Error("foo should NOT have been evicted (was MRU after reuse)")
	}
	if !barClosed {
		t.Error("bar should have been evicted (LRU)")
	}
}

func TestProcessPool_OpenSessionError(t *testing.T) {
	c := newFakeClient()
	c.failOn["/bad.jsonl"] = errors.New("kaboom")
	pool := NewProcessPool(c, 2)

	_, err := pool.Acquire(context.Background(), "/cwd", "/bad.jsonl")
	if err == nil || err.Error() != "kaboom" {
		t.Errorf("expected kaboom, got %v", err)
	}
	if pool.Stats().Size != 0 {
		t.Errorf("failed open should not leave a pool entry; size=%d", pool.Stats().Size)
	}
}

func TestProcessPool_Shutdown_ClosesAll(t *testing.T) {
	c := newFakeClient()
	pool := NewProcessPool(c, 4)

	a, _ := pool.Acquire(context.Background(), "/cwd", "/a.jsonl")
	b, _ := pool.Acquire(context.Background(), "/cwd", "/b.jsonl")
	a.Release()
	b.Release()

	if err := pool.Shutdown(context.Background()); err != nil {
		t.Fatalf("Shutdown: %v", err)
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	for path, s := range c.sessions {
		if !s.closed.Load() {
			t.Errorf("session %s not closed after Shutdown", path)
		}
	}

	// Acquire after Shutdown should fail.
	if _, err := pool.Acquire(context.Background(), "/cwd", "/c.jsonl"); err == nil {
		t.Error("Acquire should fail after Shutdown")
	}
}

func TestProcessPool_ConcurrentAcquireSamePath(t *testing.T) {
	c := newFakeClient()
	pool := NewProcessPool(c, 4)

	const N = 20
	var wg sync.WaitGroup
	wg.Add(N)
	for range N {
		go func() {
			defer wg.Done()
			a, err := pool.Acquire(context.Background(), "/cwd", "/foo.jsonl")
			if err != nil {
				t.Errorf("Acquire: %v", err)
				return
			}
			defer a.Release()
		}()
	}
	wg.Wait()

	// Note: with the current race-resolution policy (the second-arrived
	// open is closed and the first-arrived is reused), this may produce
	// MORE than 1 open under contention but only 1 entry in the pool.
	if pool.Stats().Size != 1 {
		t.Errorf("expected exactly 1 pool entry for the same path, got %d", pool.Stats().Size)
	}
}

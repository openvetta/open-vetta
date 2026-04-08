package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"vetta-im-gateway/internal/hostproto"
	"vetta-im-gateway/internal/transport"
)

// stubTransport is a no-op transport that just blocks Start() until ctx
// is cancelled. Used to exercise the host runtime without touching
// network. Calls to Stop unblock Start by returning context.Canceled.
type stubTransport struct {
	name string
	// Configurable error to return from Start. nil → block until ctx done.
	startErr error
}

func newStubTransport(name string) *stubTransport { return &stubTransport{name: name} }

func (s *stubTransport) Name() string                      { return s.name }
func (s *stubTransport) Capabilities() transport.Capabilities { return transport.Capabilities{} }
func (s *stubTransport) Start(ctx context.Context, _ transport.MessageHandler) error {
	if s.startErr != nil {
		return s.startErr
	}
	<-ctx.Done()
	return ctx.Err()
}
func (s *stubTransport) Stop() error { return nil }
func (s *stubTransport) SendMessage(_ context.Context, _ string, _ transport.OutboundMessage) (string, error) {
	return "", nil
}
func (s *stubTransport) EditMessage(_ context.Context, _, _ string, _ transport.OutboundMessage) error {
	return nil
}
func (s *stubTransport) DeleteMessage(_ context.Context, _, _ string) error { return nil }
func (s *stubTransport) ShowTyping(_ context.Context, _ string) error       { return nil }

// stubBuilder returns a stubTransport ignoring the config (allows tests
// to bypass the feishu credential validation).
func stubBuilder(_ *hostproto.FeishuConfig) (transport.Transport, error) {
	return newStubTransport("stub"), nil
}

// captureWriter is an io.Writer that records every Write under a mutex
// so test goroutines can read it back.
type captureWriter struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (c *captureWriter) Write(p []byte) (int, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.buf.Write(p)
}

func (c *captureWriter) Bytes() []byte {
	c.mu.Lock()
	defer c.mu.Unlock()
	out := make([]byte, c.buf.Len())
	copy(out, c.buf.Bytes())
	return out
}

func (c *captureWriter) Lines() []map[string]any {
	raw := c.Bytes()
	lines := bytes.Split(bytes.TrimRight(raw, "\n"), []byte("\n"))
	out := make([]map[string]any, 0, len(lines))
	for _, l := range lines {
		if len(l) == 0 {
			continue
		}
		var m map[string]any
		if err := json.Unmarshal(l, &m); err == nil {
			out = append(out, m)
		}
	}
	return out
}

// waitForType polls the captureWriter for an event of the given type.
func waitForType(t *testing.T, w *captureWriter, typ string, timeout time.Duration) map[string]any {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		for _, ev := range w.Lines() {
			if ev["type"] == typ {
				return ev
			}
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timeout waiting for event type=%q. captured:\n%s", typ, w.Bytes())
	return nil
}

// pipeReader is a thread-safe in-memory reader with blocking Read.
// Lifted shape from integration_test.go's pipeBuffer; reused here so the
// host runtime sees the same "blocks until data" behavior as a real pipe.
type pipeReader struct {
	mu      sync.Mutex
	buf     bytes.Buffer
	readPos int
	closed  bool
}

func newPipeReader() *pipeReader { return &pipeReader{} }

func (p *pipeReader) Write(b []byte) (int, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.buf.Write(b)
}

func (p *pipeReader) Close() error {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.closed = true
	return nil
}

func (p *pipeReader) Read(b []byte) (int, error) {
	for {
		p.mu.Lock()
		if p.readPos < p.buf.Len() {
			data := p.buf.Bytes()[p.readPos:]
			n := copy(b, data)
			p.readPos += n
			p.mu.Unlock()
			return n, nil
		}
		closed := p.closed
		p.mu.Unlock()
		if closed {
			return 0, errEOF
		}
		time.Sleep(5 * time.Millisecond)
	}
}

var errEOF = errors.New("EOF")

// TestHost_InitTimeout asserts the sidecar exits non-zero when the parent
// fails to send an init frame within the timeout.
func TestHost_InitTimeout(t *testing.T) {
	// pipeReader that we never write to → simulates parent that never
	// sends an init frame. Use a short timeout to keep the test fast.
	in := newPipeReader()
	out := &captureWriter{}

	done := make(chan int, 1)
	go func() {
		done <- runHostWithIO(hostOptions{
			stdin:          in,
			stdout:         out,
			buildTransport: stubBuilder,
			initTimeout:    150 * time.Millisecond,
		})
	}()

	select {
	case code := <-done:
		if code == 0 {
			t.Fatalf("expected non-zero exit code on init timeout, got 0")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("runHostWithIO did not return after init timeout")
	}
}

// TestHost_InitReadyShutdown exercises the full init → ready → shutdown
// handshake using a stub transport.
func TestHost_InitReadyShutdown(t *testing.T) {
	in := newPipeReader()
	out := &captureWriter{}

	done := make(chan int, 1)
	go func() {
		done <- runHostWithIO(hostOptions{
			stdin:          in,
			stdout:         out,
			buildTransport: stubBuilder,
			initTimeout:    2 * time.Second,
			shutdownGrace:  500 * time.Millisecond,
		})
	}()

	// Send init frame.
	initFrame := hostproto.InitFrame{
		Type: hostproto.TypeInit,
		Feishu: &hostproto.FeishuConfig{
			AppID:     "stub-app",
			AppSecret: "stub-secret",
		},
		Projects: []hostproto.ProjectEntry{{Path: "/tmp/example"}},
		State:    nil,
	}
	data, err := hostproto.EncodeFrame(initFrame)
	if err != nil {
		t.Fatalf("encode init: %v", err)
	}
	in.Write(data)

	// Wait for ready event.
	ready := waitForType(t, out, hostproto.TypeReady, 2*time.Second)
	if ready["transport"] != "stub" {
		t.Errorf("ready transport = %v, want stub", ready["transport"])
	}

	// Wait for online status.
	waitForType(t, out, hostproto.TypeStatus, time.Second)

	// Send shutdown frame.
	sd, _ := hostproto.EncodeFrame(hostproto.ShutdownFrame{Type: hostproto.TypeShutdown})
	in.Write(sd)

	select {
	case code := <-done:
		if code != 0 {
			t.Errorf("exit code on shutdown = %d, want 0", code)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("runHostWithIO did not return after shutdown frame")
	}
}

// TestHost_StdinEOFShutdown asserts that closing stdin is equivalent to a
// shutdown frame.
func TestHost_StdinEOFShutdown(t *testing.T) {
	in := newPipeReader()
	out := &captureWriter{}

	done := make(chan int, 1)
	go func() {
		done <- runHostWithIO(hostOptions{
			stdin:          in,
			stdout:         out,
			buildTransport: stubBuilder,
			initTimeout:    2 * time.Second,
			shutdownGrace:  500 * time.Millisecond,
		})
	}()

	data, _ := hostproto.EncodeFrame(hostproto.InitFrame{
		Type:     hostproto.TypeInit,
		Feishu:   &hostproto.FeishuConfig{AppID: "x", AppSecret: "y"},
		Projects: []hostproto.ProjectEntry{},
	})
	in.Write(data)

	waitForType(t, out, hostproto.TypeReady, 2*time.Second)

	// Close stdin → EOF.
	in.Close()

	select {
	case code := <-done:
		if code != 0 {
			t.Errorf("exit code on EOF = %d, want 0", code)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("runHostWithIO did not return after stdin EOF")
	}
}

// TestHost_ProjectsUpdate asserts the projects_update frame is processed.
func TestHost_ProjectsUpdate(t *testing.T) {
	in := newPipeReader()
	out := &captureWriter{}

	done := make(chan int, 1)
	go func() {
		done <- runHostWithIO(hostOptions{
			stdin:          in,
			stdout:         out,
			buildTransport: stubBuilder,
			initTimeout:    2 * time.Second,
			shutdownGrace:  500 * time.Millisecond,
		})
	}()

	initData, _ := hostproto.EncodeFrame(hostproto.InitFrame{
		Type:     hostproto.TypeInit,
		Feishu:   &hostproto.FeishuConfig{AppID: "x", AppSecret: "y"},
		Projects: []hostproto.ProjectEntry{},
	})
	in.Write(initData)
	waitForType(t, out, hostproto.TypeReady, 2*time.Second)

	upd, _ := hostproto.EncodeFrame(hostproto.ProjectsUpdateFrame{
		Type: hostproto.TypeProjectsUpdate,
		Projects: []hostproto.ProjectEntry{
			{Path: "/tmp/foo"},
			{Path: "/tmp/bar", Name: "Bar"},
		},
	})
	in.Write(upd)

	// Verify the host emitted a "projects updated" log line.
	deadline := time.Now().Add(2 * time.Second)
	found := false
	for time.Now().Before(deadline) && !found {
		for _, ev := range out.Lines() {
			if ev["type"] != hostproto.TypeLog {
				continue
			}
			if msg, ok := ev["msg"].(string); ok && strings.Contains(msg, "projects updated") {
				found = true
				break
			}
		}
		time.Sleep(10 * time.Millisecond)
	}
	if !found {
		t.Errorf("did not see projects updated log; output:\n%s", out.Bytes())
	}

	in.Close()
	<-done
}

// TestHost_BadInitFrameType verifies that the first non-init frame causes
// a non-zero exit.
func TestHost_BadInitFrameType(t *testing.T) {
	in := newPipeReader()
	out := &captureWriter{}

	done := make(chan int, 1)
	go func() {
		done <- runHostWithIO(hostOptions{
			stdin:          in,
			stdout:         out,
			buildTransport: stubBuilder,
			initTimeout:    2 * time.Second,
		})
	}()

	// Send a shutdown frame as the very first frame; this should be
	// rejected (init must come first).
	sd, _ := hostproto.EncodeFrame(hostproto.ShutdownFrame{Type: hostproto.TypeShutdown})
	in.Write(sd)

	select {
	case code := <-done:
		if code == 0 {
			t.Errorf("expected non-zero exit when first frame is not init")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("runHostWithIO did not return")
	}
}

package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"time"

	"vetta-im-gateway/internal/command"
	"vetta-im-gateway/internal/hostclient"
	hclocal "vetta-im-gateway/internal/hostclient/local"
	"vetta-im-gateway/internal/hostproto"
	"vetta-im-gateway/internal/projects"
	"vetta-im-gateway/internal/router"
	"vetta-im-gateway/internal/state"
	"vetta-im-gateway/internal/transport"
	"vetta-im-gateway/internal/transport/feishu"
)

// transportBuilder constructs a transport.Transport from a feishu config.
// Production uses buildHostTransport (real feishu); tests inject a mock.
type transportBuilder func(*hostproto.FeishuConfig) (transport.Transport, error)

// hostOptions configures runHostWithIO. Used so tests can inject mock IO
// streams and a stub transport builder.
type hostOptions struct {
	stdin            io.Reader
	stdout           io.Writer
	buildTransport   transportBuilder
	initTimeout      time.Duration
	shutdownGrace    time.Duration
}

// runHost is the entry point for the embedded host mode. The sidecar reads
// configuration from stdin (NDJSON hostproto frames) and writes events back
// to stdout, never touching the filesystem for config / credentials / state.
//
// Lifecycle:
//
//	parent spawns sidecar
//	parent → child: init frame (within initTimeout)
//	child  → parent: ready event
//	... runtime: parent may send config_update / projects_update / shutdown ...
//	stdin EOF or shutdown frame → graceful close → exit 0
//
// Returns the process exit code.
func runHost(_ []string) int {
	return runHostWithIO(hostOptions{
		stdin:          os.Stdin,
		stdout:         os.Stdout,
		buildTransport: buildHostTransport,
	})
}

// runHostWithIO is the testable core of the host command. All side
// effects funnel through the supplied options.
func runHostWithIO(opts hostOptions) int {
	if opts.initTimeout == 0 {
		opts.initTimeout = 10 * time.Second
	}
	if opts.shutdownGrace == 0 {
		opts.shutdownGrace = 5 * time.Second
	}
	if opts.buildTransport == nil {
		opts.buildTransport = buildHostTransport
	}
	initTimeout := opts.initTimeout
	shutdownGrace := opts.shutdownGrace

	out := hostproto.NewWriter(opts.stdout)
	rdr := hostproto.NewReader(opts.stdin)
	rctx, rcancel := context.WithCancel(context.Background())
	defer rcancel()
	go rdr.Run(rctx)

	emitLog := func(level, msg string, fields map[string]any) {
		_ = out.WriteFrame(hostproto.LogEvent{
			Type:   hostproto.TypeLog,
			Level:  level,
			Msg:    msg,
			Fields: fields,
			Time:   time.Now().UTC(),
		})
	}
	emitStatus := func(status, lastErr string) {
		_ = out.WriteFrame(hostproto.StatusEvent{
			Type:      hostproto.TypeStatus,
			Transport: status,
			LastError: lastErr,
			Time:      time.Now().UTC(),
		})
	}

	// 1. Wait for init frame (or stdin EOF / timeout).
	initFrame, err := waitForInit(rdr, initTimeout)
	if err != nil {
		fmt.Fprintf(os.Stderr, "im-gateway host: %v\n", err)
		return 1
	}

	// 2. Build runtime components.
	projectDir := projects.NewInjectedDirectory()
	projectDir.Replace(projectsFromFrames(initFrame.Projects))

	// State store with patch hook → forward to parent as state_patch events.
	stateStore := state.NewMemoryStore(func(entry state.SessionEntry) {
		_ = out.WriteFrame(hostproto.StatePatchEvent{
			Type:        hostproto.TypeStatePatch,
			UserID:      entry.UserID,
			ProjectID:   entry.ProjectID,
			SessionPath: entry.SessionPath,
			UpdatedAt:   entry.UpdatedAt,
		})
	})
	stateStore.Replace(stateFromFrames(initFrame.State))

	hostClient := hclocal.New(hclocal.Options{})
	pool := hostclient.NewProcessPool(hostClient, 0)

	// 3. Build transport from injected feishu config.
	tr, err := opts.buildTransport(initFrame.Feishu)
	if err != nil {
		emitLog("error", "build transport", map[string]any{"err": err.Error()})
		fmt.Fprintf(os.Stderr, "im-gateway host: %v\n", err)
		_ = pool.Shutdown(context.Background())
		return 1
	}

	r := router.New(tr, command.NewRouter(), stateStore, projectDir, pool)

	// 4. Start transport in background.
	tCtx, tCancel := context.WithCancel(context.Background())
	transportDone := make(chan error, 1)
	go func() {
		emitStatus(hostproto.TransportStatusConnecting, "")
		err := tr.Start(tCtx, r)
		transportDone <- err
	}()

	// 5. Emit ready.
	if err := out.WriteFrame(hostproto.ReadyEvent{
		Type:      hostproto.TypeReady,
		Version:   version,
		Transport: tr.Name(),
	}); err != nil {
		emitLog("error", "write ready", map[string]any{"err": err.Error()})
	}
	emitStatus(hostproto.TransportStatusOnline, "")
	emitLog("info", "im-gateway host ready",
		map[string]any{
			"transport": tr.Name(),
			"version":   version,
			"projects":  len(initFrame.Projects),
			"state":     len(initFrame.State),
		})

	// 6. Main loop: handle inbound control frames until EOF / shutdown /
	// transport failure.
	shutdownReason := "stdin closed"
	var trErr error
	hostState := &hostRuntime{
		out:        out,
		stateStore: stateStore,
		projectDir: projectDir,
		emitLog:    emitLog,
		emitStatus: emitStatus,
	}

loop:
	for {
		select {
		case frame, ok := <-rdr.Frames():
			if !ok {
				// EOF == implicit shutdown.
				break loop
			}
			restart, stop := hostState.handleFrame(frame, tr, r, pool)
			if stop {
				shutdownReason = "shutdown frame"
				break loop
			}
			if restart != nil {
				// Restart transport with new credentials.
				newTr, restartErr := restartTransport(tCancel, transportDone, restart, hostState, r, &tCtx, &tCancel, opts.buildTransport)
				if restartErr != nil {
					emitLog("error", "restart transport", map[string]any{"err": restartErr.Error()})
					emitStatus(hostproto.TransportStatusError, restartErr.Error())
					continue
				}
				tr = newTr
				// Spawn the new transport's goroutine.
				transportDone = make(chan error, 1)
				go func(t transport.Transport, ctx context.Context, done chan error) {
					emitStatus(hostproto.TransportStatusConnecting, "")
					done <- t.Start(ctx, r)
				}(tr, tCtx, transportDone)
				emitStatus(hostproto.TransportStatusOnline, "")
				emitLog("info", "transport reconnected", map[string]any{"transport": tr.Name()})
			}
		case err := <-rdr.Err():
			emitLog("error", "stdin reader error", map[string]any{"err": err.Error()})
			shutdownReason = "stdin error"
			break loop
		case err := <-transportDone:
			trErr = err
			if err != nil && !errors.Is(err, context.Canceled) {
				emitLog("error", "transport stopped with error", map[string]any{"err": err.Error()})
				emitStatus(hostproto.TransportStatusError, err.Error())
			} else {
				emitStatus(hostproto.TransportStatusOffline, "")
			}
			shutdownReason = "transport stopped"
			break loop
		}
	}

	// 7. Graceful shutdown sequence.
	emitLog("info", "shutting down", map[string]any{"reason": shutdownReason})
	tCancel()
	_ = tr.Stop()
	r.Shutdown()

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), shutdownGrace)
	defer shutdownCancel()
	if err := pool.Shutdown(shutdownCtx); err != nil {
		emitLog("warn", "pool shutdown", map[string]any{"err": err.Error()})
	}

	// Drain transport goroutine if still running.
	if transportDone != nil {
		select {
		case <-transportDone:
		case <-time.After(shutdownGrace):
		}
	}

	if trErr != nil && !errors.Is(trErr, context.Canceled) {
		return 1
	}
	return 0
}

// hostRuntime bundles helpers shared by frame handlers so the main loop
// stays readable.
type hostRuntime struct {
	out        *hostproto.Writer
	stateStore *state.MemoryStore
	projectDir *projects.InjectedDirectory
	emitLog    func(level, msg string, fields map[string]any)
	emitStatus func(status, lastErr string)
}

// handleFrame processes one control frame. Returns (newConfigForRestart,
// stop) where:
//   - newConfigForRestart non-nil → caller should rebuild the transport
//   - stop true                  → caller should exit the loop
func (h *hostRuntime) handleFrame(frame any, _ transport.Transport, _ *router.Router, _ *hostclient.ProcessPool) (*hostproto.FeishuConfig, bool) {
	switch f := frame.(type) {
	case *hostproto.InitFrame:
		// Late init: ignore (already processed). Log a warning.
		h.emitLog("warn", "ignoring duplicate init frame", nil)
		return nil, false

	case *hostproto.ConfigUpdateFrame:
		if f.Feishu == nil {
			h.emitLog("warn", "config_update with empty feishu, ignored", nil)
			return nil, false
		}
		return f.Feishu, false

	case *hostproto.ProjectsUpdateFrame:
		h.projectDir.Replace(projectsFromFrames(f.Projects))
		h.emitLog("info", "projects updated", map[string]any{"count": len(f.Projects)})
		return nil, false

	case *hostproto.ShutdownFrame:
		return nil, true

	default:
		h.emitLog("warn", "unknown frame", map[string]any{"type": fmt.Sprintf("%T", frame)})
		return nil, false
	}
}

// waitForInit blocks until the first frame arrives or the timeout fires.
// The first frame must be an InitFrame; anything else is an error.
func waitForInit(rdr *hostproto.Reader, timeout time.Duration) (*hostproto.InitFrame, error) {
	select {
	case frame, ok := <-rdr.Frames():
		if !ok {
			return nil, errors.New("stdin closed before init frame")
		}
		init, ok := frame.(*hostproto.InitFrame)
		if !ok {
			return nil, fmt.Errorf("first frame must be init, got %T", frame)
		}
		return init, nil
	case err := <-rdr.Err():
		return nil, fmt.Errorf("read init: %w", err)
	case <-time.After(timeout):
		return nil, fmt.Errorf("init frame timeout after %s", timeout)
	}
}

// buildHostTransport constructs the IM transport from injected config.
// Empty FeishuConfig falls back to the mock transport so the sidecar still
// boots; this is useful for early development before real credentials are
// available. The parent is expected to keep the sidecar in this state only
// transiently.
func buildHostTransport(cfg *hostproto.FeishuConfig) (transport.Transport, error) {
	if cfg == nil || cfg.AppID == "" || cfg.AppSecret == "" {
		return nil, errors.New("feishu config missing AppID/AppSecret")
	}
	return feishu.New(feishu.Options{
		AppID:     cfg.AppID,
		AppSecret: cfg.AppSecret,
		Domain:    cfg.BaseURL,
	})
}

// restartTransport tears down the old transport and constructs a new one
// with the supplied feishu config. Updates the shared context vars in
// place via the supplied pointers.
func restartTransport(
	tCancel context.CancelFunc,
	prevDone chan error,
	cfg *hostproto.FeishuConfig,
	h *hostRuntime,
	_ *router.Router,
	tCtx *context.Context,
	tCancelOut *context.CancelFunc,
	build transportBuilder,
) (transport.Transport, error) {
	// Cancel old transport and wait briefly.
	tCancel()
	if prevDone != nil {
		select {
		case <-prevDone:
		case <-time.After(2 * time.Second):
			h.emitLog("warn", "previous transport did not stop in 2s", nil)
		}
	}
	// New context for the new transport.
	newCtx, newCancel := context.WithCancel(context.Background())
	*tCtx = newCtx
	*tCancelOut = newCancel
	if build == nil {
		build = buildHostTransport
	}
	return build(cfg)
}

// projectsFromFrames converts hostproto wire entries into the internal
// projects.Project shape. Path is the only required field; ID is derived
// downstream if missing.
func projectsFromFrames(in []hostproto.ProjectEntry) []projects.Project {
	out := make([]projects.Project, 0, len(in))
	for _, e := range in {
		out = append(out, projects.Project{
			ID:   e.ID,
			Name: e.Name,
			Path: e.Path,
		})
	}
	return out
}

// stateFromFrames converts wire entries into RouterState for MemoryStore.
func stateFromFrames(in []hostproto.SessionStateEntry) state.RouterState {
	out := state.RouterState{
		Version:  state.CurrentVersion,
		Sessions: make(map[string]state.SessionEntry, len(in)),
	}
	for _, e := range in {
		updated := e.UpdatedAt
		if updated.IsZero() {
			updated = time.Now().UTC()
		}
		out.Sessions[state.SessionKey(e.UserID, e.ProjectID)] = state.SessionEntry{
			UserID:      e.UserID,
			ProjectID:   e.ProjectID,
			SessionPath: e.SessionPath,
			UpdatedAt:   updated,
		}
	}
	return out
}


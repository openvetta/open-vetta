package router

import (
	"context"
	"fmt"
	"log/slog"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"vetta-im-gateway/internal/bridge"
	"vetta-im-gateway/internal/command"
	"vetta-im-gateway/internal/hostclient"
	"vetta-im-gateway/internal/projects"
	"vetta-im-gateway/internal/state"
	"vetta-im-gateway/internal/transport"
)

// Router is the gateway's central message dispatcher. It implements
// transport.MessageHandler so transports can hand it inbound messages
// directly. The router decides whether each message is a slash-command
// (delegated to command.Router) or a normal prompt (forwarded to the
// agent via hostclient + bridge).
//
// Per-(user, project) goroutine: each unique conversation gets its own
// processing goroutine, so messages from the same user in the same
// project are handled in arrival order without holding a global lock.
// Messages from different conversations run in parallel.
type Router struct {
	tr        transport.Transport
	commands  *command.Router
	state     state.Store
	projects  projects.ProjectDirectory
	pool      *hostclient.ProcessPool

	mu        sync.Mutex
	queues    map[string]chan transport.InboundMessage
	closed    bool

	wg sync.WaitGroup
}

// New constructs a Router. None of the arguments may be nil.
func New(
	tr transport.Transport,
	commands *command.Router,
	st state.Store,
	prj projects.ProjectDirectory,
	pool *hostclient.ProcessPool,
) *Router {
	return &Router{
		tr:       tr,
		commands: commands,
		state:    st,
		projects: prj,
		pool:     pool,
		queues:   make(map[string]chan transport.InboundMessage),
	}
}

// Compile-time interface conformance.
var _ transport.MessageHandler = (*Router)(nil)

// HandleInbound enqueues the message onto the per-conversation goroutine.
// Returns immediately; processing is asynchronous.
func (r *Router) HandleInbound(ctx context.Context, msg transport.InboundMessage) error {
	r.mu.Lock()
	if r.closed {
		r.mu.Unlock()
		return fmt.Errorf("router: shut down")
	}

	key := convKey(msg.UserID, msg.ChatID)
	q, ok := r.queues[key]
	if !ok {
		q = make(chan transport.InboundMessage, 32)
		r.queues[key] = q
		r.wg.Add(1)
		go r.processConversation(ctx, q)
	}
	r.mu.Unlock()

	select {
	case q <- msg:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// Shutdown closes all per-conversation queues and waits for the workers
// to drain. Safe to call multiple times.
func (r *Router) Shutdown() {
	r.mu.Lock()
	if r.closed {
		r.mu.Unlock()
		return
	}
	r.closed = true
	for _, q := range r.queues {
		close(q)
	}
	r.queues = nil
	r.mu.Unlock()
	r.wg.Wait()
}

func convKey(userID, chatID string) string {
	return userID + "::" + chatID
}

// processConversation drains one queue serially. Each message goes
// through command.Router first; if it's not a command, the router
// forwards it to the agent via the host pool and runs a Bridge.
func (r *Router) processConversation(ctx context.Context, queue chan transport.InboundMessage) {
	defer r.wg.Done()
	for msg := range queue {
		if err := r.handleOne(ctx, msg); err != nil {
			r.replyError(ctx, msg.ChatID, err)
		}
	}
}

func (r *Router) handleOne(ctx context.Context, msg transport.InboundMessage) error {
	env := command.Env{
		UserID:   msg.UserID,
		ChatID:   msg.ChatID,
		Projects: r.projects,
		State:    r.state,
		HostPool: r.pool,
	}

	res, err := r.commands.Dispatch(ctx, env, msg.Text)
	if err != nil {
		return err
	}
	if res.Reply.Text != "" || len(res.Reply.Blocks) > 0 {
		if _, err := r.tr.SendMessage(ctx, msg.ChatID, res.Reply); err != nil {
			return err
		}
	}
	if !res.NotACommand {
		// It was a command and has already been handled.
		return nil
	}

	// Not a command — forward to the agent.
	return r.forwardToAgent(ctx, msg)
}

// forwardToAgent looks up the user's current (project, session), acquires
// a HostSession from the pool, sends a prompt, and runs a Bridge to
// translate the agent's events back to IM messages.
func (r *Router) forwardToAgent(ctx context.Context, msg transport.InboundMessage) error {
	current, ok, err := r.findCurrentProject(ctx, msg.UserID)
	if err != nil {
		return err
	}
	if !ok {
		_, _ = r.tr.SendMessage(ctx, msg.ChatID, transport.OutboundMessage{
			Text: "No project selected. Use /projects then /use <name>.",
		})
		return nil
	}

	entry, _, _ := r.state.GetSession(ctx, msg.UserID, current.ID)

	// Defensive: validate the persisted sessionPath actually belongs to
	// this project's cwd. coding-agent stores each session under
	// ~/.vetta/agent/sessions/<encoded-cwd>/ where encoded-cwd is derived
	// deterministically from the cwd. If the persisted path's parent dir
	// does not match the expected encoding, we are looking at a stale
	// entry left over from a previous (buggy) run that bound this user
	// to a session file rooted in a different project. Reusing it would
	// make the agent operate on the wrong directory AND replay an
	// unrelated conversation history, so we drop it and start fresh.
	if entry.SessionPath != "" && !sessionPathMatchesCwd(entry.SessionPath, current.Path) {
		slog.Warn("router: stale session entry; sessionPath does not belong to project cwd, starting fresh",
			"userID", msg.UserID,
			"projectID", current.ID,
			"projectPath", current.Path,
			"staleSessionPath", entry.SessionPath,
		)
		entry.SessionPath = ""
	}

	acq, err := r.pool.Acquire(ctx, current.Path, entry.SessionPath)
	if err != nil {
		return fmt.Errorf("acquire session: %w", err)
	}
	defer acq.Release()

	// First-message-after-/use case: the state entry was created with an
	// empty SessionPath (because /use just records the user's selection,
	// it doesn't spawn an agent). The agent has now told us its real
	// session file via the handshake's get_state response. Persist that
	// path so subsequent messages reuse the same .jsonl, and so future
	// /projects displays the conversation under the right project.
	if entry.SessionPath == "" {
		if real := acq.Session.SessionPath(); real != "" {
			_ = r.state.SetSession(ctx, state.SessionEntry{
				UserID:      msg.UserID,
				ProjectID:   current.ID,
				SessionPath: real,
			})
		}
	}

	if _, err := acq.Session.Send(ctx, hostclient.Command{
		Type: hostclient.CommandTypePrompt,
		Data: map[string]any{"message": msg.Text},
	}); err != nil {
		return fmt.Errorf("send prompt: %w", err)
	}

	br := bridge.New(r.tr, msg.ChatID)
	return br.Run(ctx, acq.Session.Events())
}

// findCurrentProject discovers which project (if any) the user has
// /use'd. The state store has at most one entry per (user, project),
// and SetSession updates UpdatedAt every time, so the "current" project
// is the entry with the most recent UpdatedAt for this user.
//
// We deliberately do NOT require SessionPath to be non-empty: a freshly
// /use'd project starts with an empty path, and forwardToAgent populates
// it lazily on the first prompt via the agent's get_state response.
//
// In a future revision we may add an explicit "currentProject" field per
// user to avoid the linear scan over the project list.
func (r *Router) findCurrentProject(ctx context.Context, userID string) (*projects.Project, bool, error) {
	all, err := r.projects.List(ctx)
	if err != nil {
		return nil, false, err
	}
	var current *projects.Project
	var bestTime time.Time
	for i := range all {
		entry, ok, _ := r.state.GetSession(ctx, userID, all[i].ID)
		if !ok {
			continue
		}
		if current == nil || entry.UpdatedAt.After(bestTime) {
			bestTime = entry.UpdatedAt
			p := all[i]
			current = &p
		}
	}
	return current, current != nil, nil
}

// encodeCwdFolder mirrors coding-agent's getDefaultSessionDir() encoding so
// the gateway can recognize whether a persisted sessionPath was created for
// a given cwd. The TS source (packages/coding-agent/src/core/session-manager.ts)
// computes:
//
//	const safePath = `--${cwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
//
// We replicate it byte-for-byte. If the encoding ever changes upstream this
// validator will start over-rejecting and the test below will fail loudly.
func encodeCwdFolder(cwd string) string {
	s := strings.TrimLeft(cwd, "/\\")
	s = strings.Map(func(r rune) rune {
		switch r {
		case '/', '\\', ':':
			return '-'
		}
		return r
	}, s)
	return "--" + s + "--"
}

// sessionPathMatchesCwd reports whether sessionPath lives in the directory
// coding-agent would have created for cwd. Empty sessionPath is treated as
// "no opinion" → true (caller already handles the empty case).
func sessionPathMatchesCwd(sessionPath, cwd string) bool {
	if sessionPath == "" || cwd == "" {
		return true
	}
	parent := filepath.Base(filepath.Dir(sessionPath))
	return parent == encodeCwdFolder(cwd)
}

func (r *Router) replyError(ctx context.Context, chatID string, err error) {
	_, _ = r.tr.SendMessage(ctx, chatID, transport.OutboundMessage{
		Text: fmt.Sprintf("error: %v", err),
	})
}

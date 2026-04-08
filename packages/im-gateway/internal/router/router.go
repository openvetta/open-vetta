package router

import (
	"context"
	"fmt"
	"sync"

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

	acq, err := r.pool.Acquire(ctx, current.Path, entry.SessionPath)
	if err != nil {
		return fmt.Errorf("acquire session: %w", err)
	}
	defer acq.Release()

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
// /use'd. The state store has at most one entry per (user, project), so
// the "current" project is whichever one has a non-empty SessionPath. We
// scan the project list to find a match.
//
// In a future revision we will store an explicit "currentProject" field
// per user instead of inferring; for now this avoids a state-schema bump.
func (r *Router) findCurrentProject(ctx context.Context, userID string) (*projects.Project, bool, error) {
	all, err := r.projects.List(ctx)
	if err != nil {
		return nil, false, err
	}
	for i := range all {
		p := all[i]
		if entry, ok, _ := r.state.GetSession(ctx, userID, p.ID); ok && entry.SessionPath != "" {
			return &p, true, nil
		}
	}
	return nil, false, nil
}

func (r *Router) replyError(ctx context.Context, chatID string, err error) {
	_, _ = r.tr.SendMessage(ctx, chatID, transport.OutboundMessage{
		Text: fmt.Sprintf("error: %v", err),
	})
}

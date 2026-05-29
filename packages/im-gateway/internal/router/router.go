package router

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"vetta-im-gateway/internal/bridge"
	"vetta-im-gateway/internal/command"
	"vetta-im-gateway/internal/hostclient"
	"vetta-im-gateway/internal/state"
	"vetta-im-gateway/internal/transport"
)

// Router is the gateway's central message dispatcher. It implements
// transport.MessageHandler so transports can hand it inbound messages
// directly. The router decides whether each message is a slash-command
// (delegated to command.Router) or a normal prompt (forwarded to the
// agent via hostclient + bridge).
//
// All sessions live in conversationCwd (desktop-app's virtual "对话"
// project). Per-(user, chatID) goroutine: each unique conversation gets
// its own processing goroutine, so messages from the same user in the
// same chat are handled in arrival order without holding a global lock.
// Messages from different conversations run in parallel.
type Router struct {
	tr              transport.Transport
	commands        *command.Router
	state           state.Store
	pool            *hostclient.ProcessPool
	conversationCwd string
	// datedCwd, when true, runs each agent in a per-day subdirectory
	// <conversationCwd>/<YYYY-MM-DD>/ (the dated work log, ADR-0009) instead of
	// the conversation root. Set via SetDatedCwd by the embedded host runtime.
	datedCwd bool

	mu     sync.Mutex
	queues map[string]chan transport.InboundMessage
	closed bool

	wg sync.WaitGroup
}

// New constructs a Router. None of the arguments may be nil; conversationCwd
// must be an absolute path (the cwd of desktop-app's default "对话" project).
func New(
	tr transport.Transport,
	commands *command.Router,
	st state.Store,
	pool *hostclient.ProcessPool,
	conversationCwd string,
) *Router {
	return &Router{
		tr:              tr,
		commands:        commands,
		state:           st,
		pool:            pool,
		conversationCwd: conversationCwd,
		queues:          make(map[string]chan transport.InboundMessage),
	}
}

// Compile-time interface conformance.
var _ transport.MessageHandler = (*Router)(nil)

// SetTransport replaces the transport used for outbound sends. Used by
// the host runtime when the wechat bind flow completes (or any other
// in-process transport swap) so the router's reply path targets the new
// transport rather than the placeholder it was constructed with.
//
// Reads of r.tr go through getTransport so they share the same mutex
// (concurrent writes would otherwise race the per-conversation
// goroutines that call SendMessage).
func (r *Router) SetTransport(tr transport.Transport) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.closed {
		return
	}
	r.tr = tr
}

// getTransport returns the current transport under lock. Per-conversation
// goroutines use this for every outbound SendMessage call so a concurrent
// SetTransport from the host runtime is race-free.
func (r *Router) getTransport() transport.Transport {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.tr
}

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
		UserID:          msg.UserID,
		ChatID:          msg.ChatID,
		ConversationCwd: r.conversationCwd,
		State:           r.state,
		HostPool:        r.pool,
	}

	res, err := r.commands.Dispatch(ctx, env, msg.Text)
	if err != nil {
		return err
	}
	if res.Reply.Text != "" || len(res.Reply.Blocks) > 0 {
		if _, err := r.getTransport().SendMessage(ctx, msg.ChatID, res.Reply); err != nil {
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

// forwardToAgent looks up the (user, chat)'s existing session (if any),
// acquires a HostSession from the pool rooted in conversationCwd, sends
// a prompt, and runs a Bridge to translate the agent's events back to
// IM messages.
func (r *Router) forwardToAgent(ctx context.Context, msg transport.InboundMessage) error {
	entry, _, _ := r.state.GetSession(ctx, msg.UserID, msg.ChatID)

	cwd, err := r.agentCwd()
	if err != nil {
		return err
	}

	acq, err := r.pool.Acquire(ctx, cwd, entry.SessionPath)
	if err != nil {
		return fmt.Errorf("acquire session: %w", err)
	}
	defer acq.Release()

	// First-message case: persist the sessionPath the agent generated so
	// subsequent messages in this chat reuse the same .jsonl.
	if entry.SessionPath == "" {
		if real := acq.Session.SessionPath(); real != "" {
			_ = r.state.SetSession(ctx, state.SessionEntry{
				UserID:      msg.UserID,
				ChatID:      msg.ChatID,
				SessionPath: real,
			})
		}
	}

	if _, err := acq.Session.Send(ctx, hostclient.Command{
		Type: hostclient.CommandTypePrompt,
		Data: map[string]any{"message": buildPromptMessage(msg)},
	}); err != nil {
		return fmt.Errorf("send prompt: %w", err)
	}

	br := bridge.New(r.tr, msg.ChatID)
	// host_request → host_response reverse RPC. The bridge invokes this
	// when the agent's `im_send_attachment` tool fires; we route the
	// command back to the same coding-agent subprocess via the session's
	// stdin. SendNoReply because the agent never echoes a `response`
	// frame for host_response — registering a pending entry would leak.
	session := acq.Session
	br.SetHostResponder(func(rctx context.Context, cmd hostclient.Command) error {
		return session.SendNoReply(rctx, cmd)
	})
	// memory-mode rollover (ADR-0009): when the agent rolls the session into a
	// fresh .jsonl, repoint this chat's routing state at the new path so the
	// next message resumes the rolled-over session, not the archived one.
	br.SetPathChangeHandler(func(newPath string) {
		_ = r.state.SetSession(ctx, state.SessionEntry{
			UserID:      msg.UserID,
			ChatID:      msg.ChatID,
			SessionPath: newPath,
		})
	})
	return br.Run(ctx, acq.Session.Events())
}

// SetDatedCwd toggles per-day run directories (ADR-0009). Called by the
// embedded host runtime for the Claw conversation; left off for standalone
// dev mode and tests.
func (r *Router) SetDatedCwd(enabled bool) { r.datedCwd = enabled }

// agentCwd returns the working directory to spawn the agent in. With datedCwd
// off it's the conversation root (legacy behaviour). With it on it's today's
// date subdirectory <conversationCwd>/<YYYY-MM-DD>/ (created if missing),
// matching the inbox layout so inbound media, artifacts, and JOURNAL.md share
// one per-day directory.
func (r *Router) agentCwd() (string, error) {
	if !r.datedCwd {
		return r.conversationCwd, nil
	}
	cwd := filepath.Join(r.conversationCwd, time.Now().Format("2006-01-02"))
	if err := os.MkdirAll(cwd, 0o755); err != nil {
		return "", fmt.Errorf("create dated cwd: %w", err)
	}
	return cwd, nil
}

// buildPromptMessage assembles the text the agent sees. Mirrors desktop-app's
// `mentionedFile` convention: each attachment becomes an `@<absolute-path>`
// line prepended to the user's text. Agent reads each path via its own Read
// tool — `resizeImageBuffer` handles image sizing automatically, see ADR-0006.
//
// Returns msg.Text unchanged when no attachments are present so plain text
// flows behave identically to before.
func buildPromptMessage(msg transport.InboundMessage) string {
	if len(msg.Attachments) == 0 {
		return msg.Text
	}
	var b strings.Builder
	for _, a := range msg.Attachments {
		if a.URL == "" {
			continue
		}
		b.WriteString("@")
		b.WriteString(a.URL)
		b.WriteString("\n")
	}
	b.WriteString(msg.Text)
	return b.String()
}

func (r *Router) replyError(ctx context.Context, chatID string, err error) {
	_, _ = r.getTransport().SendMessage(ctx, chatID, transport.OutboundMessage{
		Text: fmt.Sprintf("error: %v", err),
	})
}

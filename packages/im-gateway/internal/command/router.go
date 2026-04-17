package command

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"vetta-im-gateway/internal/hostclient"
	"vetta-im-gateway/internal/projects"
	"vetta-im-gateway/internal/state"
	"vetta-im-gateway/internal/transport"
)

// Result is what a Handler returns. Reply, if non-empty, is the message
// the gateway should deliver back to the user. Mutated, if true, signals
// that the routing table changed and the caller should persist any
// derived in-memory state. NotACommand is true when the message did not
// look like a command at all (parser fell through) — the caller should
// then forward the message to the agent bridge.
type Result struct {
	Reply       transport.OutboundMessage
	Mutated     bool
	NotACommand bool
}

// Handler executes one slash command.
type Handler interface {
	Name() string
	Help() string
	Run(ctx context.Context, env Env, args []string) (Result, error)
}

// Env carries dependencies the handlers need. Constructed once per
// gateway lifetime; passed by value into each Run call so handlers can
// access without coupling to a global.
type Env struct {
	UserID   string // platform user id (e.g. feishu open_id)
	ChatID   string
	Projects projects.ProjectDirectory
	State    state.Store
	HostPool HostPool
	HostBin  string // for /whoami diagnostic only
}

// HostPool is the subset of hostclient.ProcessPool the command layer needs.
// Defined as an interface so command tests can use a fake.
type HostPool interface {
	Acquire(ctx context.Context, cwd, sessionPath string) (*hostclient.Acquired, error)
	Stats() hostclient.Stats
}

// Router is the entry point. Construct via NewRouter and call Dispatch
// for every inbound message before falling through to the agent bridge.
type Router struct {
	handlers map[string]Handler
}

// NewRouter constructs a router pre-populated with the first-milestone
// command set: /projects /use /new /whoami /help.
func NewRouter() *Router {
	r := &Router{handlers: make(map[string]Handler)}
	r.Register(&projectsCmd{})
	r.Register(&useCmd{})
	r.Register(&newCmd{})
	r.Register(&whoamiCmd{})
	r.Register(&helpCmd{router: r})
	return r
}

// Register adds a handler. Handler.Name() determines the slash-command
// keyword. Re-registering an existing name overwrites it.
func (r *Router) Register(h Handler) {
	r.handlers[h.Name()] = h
}

// Dispatch parses text and runs the matching handler. If text doesn't
// look like a command, returns Result{NotACommand: true} so the caller
// can forward to the bridge.
//
// The leading "/" is required; mention prefixes (@bot) are stripped by
// the transport before reaching here.
func (r *Router) Dispatch(ctx context.Context, env Env, text string) (Result, error) {
	text = strings.TrimSpace(text)
	if !strings.HasPrefix(text, "/") {
		return Result{NotACommand: true}, nil
	}
	parts := splitArgs(text[1:])
	if len(parts) == 0 {
		return Result{NotACommand: true}, nil
	}
	name, args := parts[0], parts[1:]
	h, ok := r.handlers[name]
	if !ok {
		return reply(fmt.Sprintf("未知命令 `/%s`，使用 `/help` 查看可用命令。", name)), nil
	}
	return h.Run(ctx, env, args)
}

// splitArgs is a tiny argv splitter that respects single quotes for cases
// like /new "my session". Not a full shell parser; supports double-quoted
// strings only and treats backslash literally.
func splitArgs(s string) []string {
	var out []string
	var cur strings.Builder
	inQuote := false
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c == '"':
			inQuote = !inQuote
		case c == ' ' && !inQuote:
			if cur.Len() > 0 {
				out = append(out, cur.String())
				cur.Reset()
			}
		default:
			cur.WriteByte(c)
		}
	}
	if cur.Len() > 0 {
		out = append(out, cur.String())
	}
	return out
}

// reply is a tiny convenience for plain-text replies.
func reply(text string) Result {
	return Result{Reply: transport.OutboundMessage{Text: text}}
}

// =============================================================================
// /projects
// =============================================================================

type projectsCmd struct{}

func (projectsCmd) Name() string { return "projects" }
func (projectsCmd) Help() string { return "`/projects` — 查看项目列表" }

func (projectsCmd) Run(ctx context.Context, env Env, _ []string) (Result, error) {
	all, err := env.Projects.List(ctx)
	if err != nil {
		return Result{}, fmt.Errorf("list projects: %w", err)
	}
	if len(all) == 0 {
		return reply("**没有可用项目**\n\n请在桌面端添加项目，或编辑 `~/.vetta/desktop-config.json`。"), nil
	}

	current := currentProjectID(ctx, env)

	sort.Slice(all, func(i, j int) bool { return all[i].Name < all[j].Name })

	var b strings.Builder
	b.WriteString("**可用项目**\n\n")
	for _, p := range all {
		if p.ID == current {
			fmt.Fprintf(&b, "- **%s** *(当前)*\n", p.Name)
		} else {
			fmt.Fprintf(&b, "- %s\n", p.Name)
		}
	}
	b.WriteString("\n使用 `/use <名称>` 切换项目。")
	return reply(b.String()), nil
}

func currentProjectID(ctx context.Context, env Env) string {
	if env.State == nil {
		return ""
	}
	var currentID string
	var bestTime time.Time
	for _, p := range listAllOrEmpty(ctx, env) {
		entry, ok, _ := env.State.GetSession(ctx, env.UserID, p.ID)
		if !ok {
			continue
		}
		if currentID == "" || entry.UpdatedAt.After(bestTime) {
			currentID = p.ID
			bestTime = entry.UpdatedAt
		}
	}
	return currentID
}

func listAllOrEmpty(ctx context.Context, env Env) []projects.Project {
	if env.Projects == nil {
		return nil
	}
	all, err := env.Projects.List(ctx)
	if err != nil {
		return nil
	}
	return all
}

// =============================================================================
// /use <name>
// =============================================================================

type useCmd struct{}

func (useCmd) Name() string { return "use" }
func (useCmd) Help() string { return "`/use <名称>` — 切换到指定项目" }

func (useCmd) Run(ctx context.Context, env Env, args []string) (Result, error) {
	if len(args) == 0 {
		return reply("**用法**：`/use <项目名>`"), nil
	}
	name := args[0]

	p, err := env.Projects.Resolve(ctx, name)
	if err != nil {
		if errors.Is(err, projects.ErrProjectNotFound) {
			return reply(fmt.Sprintf("找不到项目 **%q**，可以用 `/projects` 查看可用项目。", name)), nil
		}
		return reply(fmt.Sprintf("无法解析项目 **%q**：%v", name, err)), nil
	}

	// Check whether we already have a session for (user, project). If yes,
	// reuse its sessionPath. Otherwise let the agent create a fresh one
	// (sessionPath empty == new session).
	sessionPath := ""
	if existing, ok, err := env.State.GetSession(ctx, env.UserID, p.ID); err == nil && ok {
		sessionPath = existing.SessionPath
	}

	// Probe whether the target session is already locked by another
	// process (e.g. desktop-app has it open). We do this by attempting to
	// open the session via the pool — if it succeeds we immediately
	// release; if it fails with ErrSessionLocked we tell the user.
	if sessionPath != "" {
		acq, err := env.HostPool.Acquire(ctx, p.Path, sessionPath)
		if err != nil {
			var lockErr *hostclient.ErrSessionLocked
			if errors.As(err, &lockErr) {
				return reply(fmt.Sprintf(
					"项目 **%q** 的会话当前正在其他位置打开（pid `%d`，主机 `%s`）。\n\n"+
						"请在桌面端关闭它，或使用 `/new` 开启新会话。",
					p.Name, lockErr.Holder.PID, lockErr.Holder.Hostname,
				)), nil
			}
			return reply(fmt.Sprintf("无法打开项目 **%q** 的会话：%v", p.Name, err)), nil
		}
		acq.Release()
	}

	// Persist the routing entry. SessionPath is whatever we had (could be
	// empty for a fresh project the user just selected); the next prompt
	// will populate it via new_session if needed.
	if err := env.State.SetSession(ctx, state.SessionEntry{
		UserID:      env.UserID,
		ProjectID:   p.ID,
		SessionPath: sessionPath,
	}); err != nil {
		return Result{}, fmt.Errorf("save state: %w", err)
	}

	return Result{
		Reply:   transport.OutboundMessage{Text: fmt.Sprintf("已切换到项目 **%s**", p.Name)},
		Mutated: true,
	}, nil
}

// =============================================================================
// /new [name]
// =============================================================================

type newCmd struct{}

func (newCmd) Name() string { return "new" }
func (newCmd) Help() string { return "`/new [名称]` — 在当前项目下开启新会话" }

func (newCmd) Run(ctx context.Context, env Env, args []string) (Result, error) {
	currentID := currentProjectID(ctx, env)
	if currentID == "" {
		return reply("**未选择项目**\n\n请先用 `/projects` 查看项目列表，再用 `/use <名称>` 选择。"), nil
	}

	// Find the project's cwd from the directory.
	var cwd, displayName string
	for _, p := range listAllOrEmpty(ctx, env) {
		if p.ID == currentID {
			cwd = p.Path
			displayName = p.Name
			break
		}
	}
	if cwd == "" {
		return reply("当前项目已从桌面配置中移除。"), nil
	}

	// Acquire a session with empty sessionPath — the local hostclient
	// passes that to coding-agent which creates a fresh .jsonl. After
	// handshake we ask the agent for its session file path via get_state
	// and persist that into the routing table. NOTE: in the current
	// hostclient implementation OpenSession requires a sessionPath; we
	// instead spawn with empty path semantics handled by the upstream
	// rpc-mode default. For Milestone D we approximate by passing
	// "" — the local client sends --session "" which coding-agent
	// interprets as "new session in cwd". A follow-up will harden this
	// once we have integration testing in place.
	acq, err := env.HostPool.Acquire(ctx, cwd, "")
	if err != nil {
		return reply(fmt.Sprintf("无法启动新会话：%v", err)), nil
	}
	defer acq.Release()

	// Optional: ask the agent to set the session name if user provided one
	if len(args) > 0 {
		_, _ = acq.Session.Send(ctx, hostclient.Command{
			Type: hostclient.CommandTypeSetSessionName,
			Data: map[string]any{"name": args[0]},
		})
	}

	// Resolve the actual session file path the agent created and persist it.
	resp, err := acq.Session.Send(ctx, hostclient.Command{Type: hostclient.CommandTypeGetState})
	if err == nil && resp.Success {
		if path, _ := resp.Data["sessionFile"].(string); path != "" {
			_ = env.State.SetSession(ctx, state.SessionEntry{
				UserID:      env.UserID,
				ProjectID:   currentID,
				SessionPath: path,
			})
		}
	}

	suffix := ""
	if len(args) > 0 {
		suffix = " *(" + args[0] + ")*"
	}
	return Result{
		Reply:   transport.OutboundMessage{Text: fmt.Sprintf("已在 **%s** 中开启新会话%s", displayName, suffix)},
		Mutated: true,
	}, nil
}

// =============================================================================
// /whoami
// =============================================================================

type whoamiCmd struct{}

func (whoamiCmd) Name() string { return "whoami" }
func (whoamiCmd) Help() string {
	return "`/whoami` — 查看当前用户、项目、会话与连接池状态"
}

func (whoamiCmd) Run(ctx context.Context, env Env, _ []string) (Result, error) {
	var b strings.Builder
	b.WriteString("**当前状态**\n\n")
	fmt.Fprintf(&b, "- **用户**：`%s`\n", env.UserID)

	currentID := currentProjectID(ctx, env)
	if currentID == "" {
		b.WriteString("- **项目**：*(未选择，使用 `/use` 切换)*\n")
	} else {
		for _, p := range listAllOrEmpty(ctx, env) {
			if p.ID == currentID {
				fmt.Fprintf(&b, "- **项目**：%s （`%s`）\n", p.Name, p.Path)
				if entry, ok, _ := env.State.GetSession(ctx, env.UserID, p.ID); ok {
					fmt.Fprintf(&b, "- **会话**：`%s`\n", entry.SessionPath)
				}
				break
			}
		}
	}

	if env.HostPool != nil {
		st := env.HostPool.Stats()
		fmt.Fprintf(&b, "- **连接池**：%d/%d 会话，%d 进行中\n", st.Size, st.MaxSize, st.InFlight)
	}
	return reply(strings.TrimRight(b.String(), "\n")), nil
}

// =============================================================================
// /help
// =============================================================================

type helpCmd struct {
	router *Router
}

func (helpCmd) Name() string { return "help" }
func (helpCmd) Help() string { return "`/help` — 显示本帮助" }

func (h helpCmd) Run(_ context.Context, _ Env, _ []string) (Result, error) {
	names := make([]string, 0, len(h.router.handlers))
	for n := range h.router.handlers {
		names = append(names, n)
	}
	sort.Strings(names)

	var b strings.Builder
	b.WriteString("**可用命令**\n\n")
	for _, n := range names {
		fmt.Fprintf(&b, "- %s\n", h.router.handlers[n].Help())
	}
	return reply(strings.TrimRight(b.String(), "\n")), nil
}

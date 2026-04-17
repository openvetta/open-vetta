package projects

import (
	"context"
	"path/filepath"
	"sync"
)

// InjectedDirectory is the host-mode implementation of ProjectDirectory:
// the project list is provided externally (by the parent process via the
// hostproto init / projects_update frames) and replaced atomically.
//
// Unlike DesktopConfigDirectory which re-reads a JSON file on every call,
// the parent is the source of truth here, so List/Resolve operate on an
// in-memory snapshot guarded by an RWMutex.
type InjectedDirectory struct {
	mu       sync.RWMutex
	projects []Project
}

// NewInjectedDirectory returns an empty directory. Call Replace before use
// (host mode does this on receipt of the init frame).
func NewInjectedDirectory() *InjectedDirectory {
	return &InjectedDirectory{}
}

// Replace atomically swaps the entire project list. Each input entry must
// at minimum have a Path; missing IDs are derived from the path the same
// way DesktopConfigDirectory does, so routing keys remain stable across
// implementations.
func (d *InjectedDirectory) Replace(in []Project) {
	out := make([]Project, 0, len(in))
	for _, p := range in {
		if p.Path == "" {
			continue
		}
		if p.ID == "" {
			p.ID = projectIDForPath(p.Path)
		}
		if p.Name == "" {
			p.Name = filepath.Base(p.Path)
		}
		out = append(out, p)
	}
	d.mu.Lock()
	d.projects = out
	d.mu.Unlock()
}

// List returns a copy of the current project list.
func (d *InjectedDirectory) List(_ context.Context) ([]Project, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()
	out := make([]Project, len(d.projects))
	copy(out, d.projects)
	return out, nil
}

// Resolve performs the same name-then-basename matching strategy as
// DesktopConfigDirectory but operates on the in-memory list. The behavior
// is intentionally identical so command/router code does not need to know
// which directory implementation it is talking to.
func (d *InjectedDirectory) Resolve(_ context.Context, name string) (*Project, error) {
	if name == "" {
		return nil, ErrProjectNotFound
	}
	d.mu.RLock()
	defer d.mu.RUnlock()

	// Phase 1: explicit Name match (only entries whose Name was set on the
	// wire — not the auto-filled basename — to keep precedence consistent
	// with desktop_config.go).
	var explicit []Project
	for _, p := range d.projects {
		if p.Name != "" && p.Name == name && filepath.Base(p.Path) != p.Name {
			explicit = append(explicit, p)
		}
	}
	if len(explicit) == 1 {
		out := explicit[0]
		return &out, nil
	}

	// Phase 2: any match by Name (covers basename auto-fill).
	var any []Project
	for _, p := range d.projects {
		if p.Name == name {
			any = append(any, p)
		}
	}
	switch len(any) {
	case 0:
		return nil, ErrProjectNotFound
	case 1:
		out := any[0]
		return &out, nil
	default:
		// Ambiguous; return the first match. The caller's UX should
		// already enforce uniqueness via the desktop-app project list.
		out := any[0]
		return &out, nil
	}
}

var _ ProjectDirectory = (*InjectedDirectory)(nil)

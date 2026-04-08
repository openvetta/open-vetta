package projects

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

// desktopConfigShape mirrors the projects-relevant subset of the JSON written
// by desktop-app at ~/.vetta/desktop-config.json. Other fields the desktop
// app maintains (workspacePath, archivedProjects) are not consumed by the
// gateway and are deliberately ignored — that file is owned by desktop-app,
// we are a read-only consumer.
type desktopConfigShape struct {
	Projects []desktopProjectEntry `json:"projects"`
}

type desktopProjectEntry struct {
	Path string `json:"path"`
	Name string `json:"name,omitempty"`
}

// DesktopConfigDirectory implements ProjectDirectory by reading the
// user-pinned project list from desktop-app's config file. The file is
// re-read on every List/Resolve call so changes made in desktop-app
// (adding / renaming / archiving a project) are visible immediately
// without restarting the gateway.
//
// desktop-app already writes this file atomically (commit b78dec5 added
// the atomicWriteJSON util to packages/desktop-app/src/main/utils/), so
// concurrent reads will always see a complete, well-formed JSON blob.
type DesktopConfigDirectory struct {
	path string
}

// NewDesktopConfigDirectory returns a directory pointing at the given
// desktop-config.json path. Caller is responsible for resolving ~ and
// providing an absolute path; config.LoadConfig already does this.
func NewDesktopConfigDirectory(path string) *DesktopConfigDirectory {
	return &DesktopConfigDirectory{path: path}
}

// List returns all projects from the desktop config. A missing file is not
// an error — it returns an empty slice, which the /projects command
// renders as "no projects found, add some in the desktop app".
func (d *DesktopConfigDirectory) List(_ context.Context) ([]Project, error) {
	cfg, err := readDesktopConfig(d.path)
	if err != nil {
		return nil, err
	}
	out := make([]Project, 0, len(cfg.Projects))
	for _, e := range cfg.Projects {
		if e.Path == "" {
			continue
		}
		out = append(out, toProject(e))
	}
	return out, nil
}

// Resolve looks up a project by user-visible name. Match strategy, in order:
//
//  1. Phase 1 — exact match against the *explicitly configured* Name.
//     Multiple matches → ambiguous error.
//  2. Phase 2 — exact match against filepath.Base(Path), considering only
//     entries that have no explicit name. Multiple matches → ambiguous error.
//
// Doing matching against raw entries (rather than the post-processed
// Project list, which auto-fills Name from basename) is what makes "explicit
// name takes precedence over basename" actually work: an entry that already
// has an explicit name is no longer reachable by typing its basename.
//
// Returns ErrProjectNotFound when nothing matches.
func (d *DesktopConfigDirectory) Resolve(_ context.Context, name string) (*Project, error) {
	if name == "" {
		return nil, ErrProjectNotFound
	}
	cfg, err := readDesktopConfig(d.path)
	if err != nil {
		return nil, err
	}

	// Phase 1: explicit Name match.
	var explicit []desktopProjectEntry
	for _, e := range cfg.Projects {
		if e.Path == "" {
			continue
		}
		if e.Name == name {
			explicit = append(explicit, e)
		}
	}
	switch len(explicit) {
	case 1:
		p := toProject(explicit[0])
		return &p, nil
	case 0:
		// fall through to phase 2
	default:
		return nil, fmt.Errorf("project name %q is ambiguous (%d matches); rename one in the desktop app", name, len(explicit))
	}

	// Phase 2: basename match against entries with no explicit name.
	var byBasename []desktopProjectEntry
	for _, e := range cfg.Projects {
		if e.Path == "" || e.Name != "" {
			continue
		}
		if filepath.Base(e.Path) == name {
			byBasename = append(byBasename, e)
		}
	}
	switch len(byBasename) {
	case 0:
		return nil, ErrProjectNotFound
	case 1:
		p := toProject(byBasename[0])
		return &p, nil
	default:
		return nil, fmt.Errorf("project name %q is ambiguous (%d matches by basename); rename one in the desktop app", name, len(byBasename))
	}
}

// toProject converts an on-disk entry to the public Project type. Derives
// a stable ID from the absolute path so renaming the user-visible Name in
// desktop-app does not break (user, project) routing entries.
func toProject(e desktopProjectEntry) Project {
	p := Project{
		Path: e.Path,
		Name: e.Name,
		ID:   projectIDForPath(e.Path),
	}
	if p.Name == "" {
		p.Name = filepath.Base(e.Path)
	}
	return p
}

// projectIDForPath derives a stable internal ID from a project's absolute
// path. Using a hash means the ID is opaque, fixed-length, and unaffected
// by name changes — exactly the property we need for routing keys.
func projectIDForPath(path string) string {
	abs, err := filepath.Abs(path)
	if err != nil {
		abs = path
	}
	sum := sha256.Sum256([]byte(abs))
	return hex.EncodeToString(sum[:8]) // 16 hex chars; collision risk negligible at the user-projects scale
}

func readDesktopConfig(path string) (desktopConfigShape, error) {
	var cfg desktopConfigShape
	raw, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return cfg, nil // empty list, not an error
		}
		return cfg, fmt.Errorf("read desktop config %s: %w", path, err)
	}
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return cfg, fmt.Errorf("parse desktop config %s: %w", path, err)
	}
	return cfg, nil
}

// Compile-time check.
var _ ProjectDirectory = (*DesktopConfigDirectory)(nil)

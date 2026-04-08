package projects

import (
	"context"
	"errors"
)

// Project is one entry the user has pinned in the desktop app's project list
// (or, in the future, an entry from a server-side registry). The ID is a
// stable identifier the gateway uses internally; the Name is what the user
// sees in `/projects` output.
type Project struct {
	// ID is the stable internal identifier. The DesktopConfigDirectory
	// implementation derives it from the absolute project path so that
	// renames don't break (im_user, project) routing entries.
	ID string

	// Name is the user-visible label. Falls back to filepath.Base(Path) when
	// the desktop config does not provide an explicit name.
	Name string

	// Path is the absolute working directory the agent should use when
	// driving sessions for this project.
	Path string
}

// ProjectDirectory is the source of truth for "what projects can this user
// pick from". The gateway calls List() on every /projects command (so newly
// added desktop projects show up immediately) and Resolve() on /use.
//
// Implementations:
//
//   - DesktopConfigDirectory: reads ~/.vetta/desktop-config.json (the file
//     desktop-app maintains). This is the only implementation in the first
//     milestone.
//   - Future: ServerProjectDirectory for the enterprise mode, populated by
//     a central registry.
type ProjectDirectory interface {
	// List returns all projects available to the current user, in display
	// order. Returns an empty slice (not an error) when no projects exist.
	List(ctx context.Context) ([]Project, error)

	// Resolve looks up a project by its user-visible name. The lookup
	// strategy is implementation-defined but should match what the user
	// sees in List() — exact name match first, basename fallback if no
	// conflict.
	//
	// Returns ErrProjectNotFound if no project matches.
	Resolve(ctx context.Context, name string) (*Project, error)
}

// ErrProjectNotFound is returned by Resolve when no project matches.
var ErrProjectNotFound = errors.New("project not found")

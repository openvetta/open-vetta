package state

import (
	"context"
	"time"
)

// Schema version. Bump when RouterState fields change in an incompatible way
// and add a migration path in Store.Load.
const CurrentVersion = 1

// RouterState is the gateway's persistent routing table — a flat map from
// (im_user, project) to the agent session that should handle messages for
// that pair.
//
// Note: this state intentionally does NOT contain any conversation content.
// The agent's session manager owns the .jsonl files; the gateway only
// remembers which file belongs to which user/project pair, so it can
// reattach after restart.
type RouterState struct {
	Version  int                     `json:"version"`
	Sessions map[string]SessionEntry `json:"sessions"` // key = SessionKey(userID, projectID)
}

// SessionEntry is one mapping from (user, project) to a concrete session
// file. Persisted in state.json under a key derived from the user and
// project IDs.
type SessionEntry struct {
	UserID      string    `json:"userId"`
	ProjectID   string    `json:"projectId"`
	SessionPath string    `json:"sessionPath"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

// Store is the persistence interface for RouterState. The default
// implementation writes to ~/.vetta/im-gateway/state.json using the standard
// write-temp + fsync + rename atomic-write pattern, mirroring the convention
// already established in desktop-app's atomic-write util and SessionManager's
// lockfile module.
type Store interface {
	// Load reads the persisted state from disk. Returns an empty RouterState
	// (not an error) if the file does not exist — this is the first-run
	// case. Malformed files return an error.
	Load(ctx context.Context) (RouterState, error)

	// Save atomically writes the entire state to disk. Concurrent Save calls
	// are serialized internally so callers don't need to take their own
	// mutex.
	Save(ctx context.Context, state RouterState) error

	// GetSession looks up the current session entry for a (user, project)
	// pair. Returns false if no entry exists.
	GetSession(ctx context.Context, userID, projectID string) (SessionEntry, bool, error)

	// SetSession upserts a session entry and persists the new state.
	SetSession(ctx context.Context, entry SessionEntry) error
}

// SessionKey is the canonical key used to index Sessions in RouterState.
// Exported so tests and migration tools can use it.
func SessionKey(userID, projectID string) string {
	return userID + "::" + projectID
}

package hostproto

import (
	"encoding/json"
	"fmt"
	"time"
)

// Frame type discriminators. Strings are the wire format.
const (
	// Inbound (parent → child)
	TypeInit            = "init"
	TypeConfigUpdate    = "config_update"
	TypeProjectsUpdate  = "projects_update"
	TypeShutdown        = "shutdown"

	// Outbound (child → parent)
	TypeReady      = "ready"
	TypeLog        = "log"
	TypeStatus     = "status"
	TypeStatePatch = "state_patch"
	TypeMetric     = "metric"
)

// Transport status values reported on TypeStatus events.
const (
	TransportStatusOffline    = "offline"
	TransportStatusConnecting = "connecting"
	TransportStatusOnline     = "online"
	TransportStatusError      = "error"
)

// FeishuConfig carries the credentials and options needed to spin up a
// feishu transport. Mirrors the configuration the parent persists in its
// own credential store.
type FeishuConfig struct {
	AppID             string `json:"appId"`
	AppSecret         string `json:"appSecret"`
	VerificationToken string `json:"verificationToken,omitempty"`
	EncryptKey        string `json:"encryptKey,omitempty"`
	BaseURL           string `json:"baseUrl,omitempty"`
}

// ProjectEntry mirrors projects.Project but uses JSON tags for the wire
// format. Kept separate from internal types so the protocol stays free of
// internal package imports.
type ProjectEntry struct {
	ID   string `json:"id,omitempty"`
	Name string `json:"name,omitempty"`
	Path string `json:"path"`
}

// SessionStateEntry mirrors a single (user, project) routing entry.
type SessionStateEntry struct {
	UserID      string    `json:"userId"`
	ProjectID   string    `json:"projectId"`
	SessionPath string    `json:"sessionPath,omitempty"`
	UpdatedAt   time.Time `json:"updatedAt,omitzero"`
}

// InitFrame is the first frame the parent must send after spawn. The sidecar
// blocks for up to 10s waiting for it; absence triggers a non-zero exit.
type InitFrame struct {
	Type     string              `json:"type"` // always TypeInit
	Feishu   *FeishuConfig       `json:"feishu,omitempty"`
	Projects []ProjectEntry      `json:"projects"`
	State    []SessionStateEntry `json:"state"`
	LogLevel string              `json:"logLevel,omitempty"` // debug|info|warn|error
}

// ConfigUpdateFrame replaces the active feishu credentials. Triggers a
// transport reconnect because the long-connection client cannot swap creds
// in flight.
type ConfigUpdateFrame struct {
	Type   string        `json:"type"` // always TypeConfigUpdate
	Feishu *FeishuConfig `json:"feishu,omitempty"`
}

// ProjectsUpdateFrame replaces the in-memory project list without a
// reconnect.
type ProjectsUpdateFrame struct {
	Type     string         `json:"type"` // always TypeProjectsUpdate
	Projects []ProjectEntry `json:"projects"`
}

// ShutdownFrame requests graceful shutdown. Equivalent semantics to closing
// stdin.
type ShutdownFrame struct {
	Type string `json:"type"` // always TypeShutdown
}

// ReadyEvent is the first frame the sidecar emits after init succeeds and
// the transport has been started. Indicates the parent may begin sending
// runtime updates.
type ReadyEvent struct {
	Type      string `json:"type"` // always TypeReady
	Version   string `json:"version"`
	Transport string `json:"transport"`
}

// LogEvent is a structured log line. Replaces file-based logging in host
// mode; the parent forwards these to its own log buffer / file sink.
type LogEvent struct {
	Type   string         `json:"type"` // always TypeLog
	Level  string         `json:"level"`
	Msg    string         `json:"msg"`
	Fields map[string]any `json:"fields,omitempty"`
	Time   time.Time      `json:"time"`
}

// StatusEvent reports transport connectivity. Sent on every state change.
type StatusEvent struct {
	Type      string    `json:"type"` // always TypeStatus
	Transport string    `json:"transport"`
	LastError string    `json:"lastError,omitempty"`
	Time      time.Time `json:"time"`
}

// StatePatchEvent reports a routing-table mutation. Parent persists the
// patch to its own state file.
type StatePatchEvent struct {
	Type      string    `json:"type"` // always TypeStatePatch
	UserID    string    `json:"userId"`
	ProjectID string    `json:"projectId"`
	// SessionPath empty means "delete this entry". Non-empty means upsert.
	SessionPath string    `json:"sessionPath"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

// MetricEvent is a generic numeric metric (active session count, etc).
type MetricEvent struct {
	Type  string  `json:"type"` // always TypeMetric
	Name  string  `json:"name"`
	Value float64 `json:"value"`
}

// envelope is a minimal probe used to discriminate inbound frames before
// dispatching to the typed decoder.
type envelope struct {
	Type string `json:"type"`
}

// DecodeInbound parses one line of NDJSON into the appropriate inbound
// frame variant. Returns a typed pointer (*InitFrame, *ConfigUpdateFrame,
// *ProjectsUpdateFrame, *ShutdownFrame) or an error.
func DecodeInbound(line []byte) (any, error) {
	var env envelope
	if err := json.Unmarshal(line, &env); err != nil {
		return nil, fmt.Errorf("hostproto: parse envelope: %w", err)
	}
	switch env.Type {
	case TypeInit:
		var f InitFrame
		if err := json.Unmarshal(line, &f); err != nil {
			return nil, fmt.Errorf("hostproto: parse init: %w", err)
		}
		return &f, nil
	case TypeConfigUpdate:
		var f ConfigUpdateFrame
		if err := json.Unmarshal(line, &f); err != nil {
			return nil, fmt.Errorf("hostproto: parse config_update: %w", err)
		}
		return &f, nil
	case TypeProjectsUpdate:
		var f ProjectsUpdateFrame
		if err := json.Unmarshal(line, &f); err != nil {
			return nil, fmt.Errorf("hostproto: parse projects_update: %w", err)
		}
		return &f, nil
	case TypeShutdown:
		var f ShutdownFrame
		if err := json.Unmarshal(line, &f); err != nil {
			return nil, fmt.Errorf("hostproto: parse shutdown: %w", err)
		}
		return &f, nil
	case "":
		return nil, fmt.Errorf("hostproto: missing type field")
	default:
		return nil, fmt.Errorf("hostproto: unknown inbound type %q", env.Type)
	}
}

// EncodeFrame marshals an outbound event into a single-line JSON byte slice
// terminated by '\n'. The "type" tag must already be set on the value.
func EncodeFrame(v any) ([]byte, error) {
	data, err := json.Marshal(v)
	if err != nil {
		return nil, fmt.Errorf("hostproto: marshal: %w", err)
	}
	return append(data, '\n'), nil
}

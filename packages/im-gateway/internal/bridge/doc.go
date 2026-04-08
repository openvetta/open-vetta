// Package bridge translates agent event streams into IM messages.
//
// # Boundary rules
//
//   - This package MUST NOT import any IM platform SDK. It uses the
//     transport interface and consults Capabilities() to decide between
//     edit-in-place streaming vs new-message-per-chunk streaming.
//   - This package consumes hostclient.AgentEvent values; new event types
//     defined upstream in coding-agent's rpc protocol are forwarded
//     transparently. Bridge code only reacts to events whose semantics it
//     understands; unknown events are logged and dropped.
//   - Throttling and chunking belong here, not in the transport.
//
// # Streaming model
//
// For transports declaring SupportsMessageEdit=true the bridge sends one
// initial empty message, then edits it (with throttling, default 800ms)
// as text deltas arrive. For transports without edit support the bridge
// buffers content until either a paragraph boundary or a max-length
// threshold is reached, then sends a new message.
//
// Tool execution events (tool_execution_start / tool_execution_end) force
// a flush so the user can see progress between long-running tools.
package bridge

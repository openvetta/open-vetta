package transport

import "context"

// Transport is the interface every IM platform implementation must satisfy.
//
// Implementations live under internal/transport/<platform>/. Implementations
// MUST NOT leak platform SDK types through this interface — every method
// signature deals only with the normalized types defined in types.go.
//
// Lifecycle:
//
//	t := feishu.New(cfg)         // construct
//	t.Start(ctx, handler)        // connect, begin receiving messages
//	... handler.HandleInbound called for each message ...
//	t.SendMessage(ctx, ...)      // call as needed for replies
//	t.Stop()                     // graceful shutdown
//
// Start is expected to block while the transport is running, returning only
// when the connection is permanently lost or Stop() has been called. The
// caller typically runs Start in its own goroutine.
type Transport interface {
	// Name returns the transport's identifier (e.g. "feishu", "mock").
	// Used for logging and the InboundMessage.Platform field.
	Name() string

	// Capabilities returns the platform's feature flags. The bridge consults
	// this to decide how to deliver streaming output. Implementations should
	// return a stable value — Capabilities() may be called many times.
	Capabilities() Capabilities

	// Start connects to the platform and begins delivering inbound messages
	// to the handler. Returns when the context is cancelled, Stop() is
	// called, or an unrecoverable error occurs.
	Start(ctx context.Context, handler MessageHandler) error

	// Stop closes the connection. Safe to call multiple times. Concurrent
	// SendMessage / EditMessage calls in flight should be allowed to finish
	// or be aborted cleanly; implementations decide.
	Stop() error

	// SendMessage sends a new message to the chat. Returns the platform's
	// message ID so the caller can later edit or delete it.
	SendMessage(ctx context.Context, chatID string, msg OutboundMessage) (messageID string, err error)

	// EditMessage replaces the content of a previously sent message.
	// Implementations whose Capabilities.SupportsMessageEdit is false should
	// return an error; the bridge consults Capabilities first and never calls
	// this on transports that don't support it.
	EditMessage(ctx context.Context, chatID, messageID string, msg OutboundMessage) error

	// DeleteMessage removes a previously sent message. Optional; transports
	// without delete support should return an error and the bridge will skip
	// any cleanup paths that depend on it.
	DeleteMessage(ctx context.Context, chatID, messageID string) error

	// ShowTyping signals that the bot is composing a reply. Implementations
	// for platforms without typing indicators may no-op and return nil.
	ShowTyping(ctx context.Context, chatID string) error
}

package router

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	"vetta-im-gateway/internal/command"
	"vetta-im-gateway/internal/hostclient"
	"vetta-im-gateway/internal/state"
	"vetta-im-gateway/internal/transport"
)

func newDeliveryTestRouter(t *testing.T, store *fakeStore) (*Router, *fakeTransport) {
	t.Helper()
	fakeTr := newFakeTransport()
	pool := hostclient.NewProcessPool(&streamingFakeClient{reply: "ok"}, 4)
	deliveryRouter := New(fakeTr, command.NewRouter(), store, pool, testCwd)
	t.Cleanup(deliveryRouter.Shutdown)
	return deliveryRouter, fakeTr
}

func TestDeliverAutomationResult_SendsToMostRecentChat(t *testing.T) {
	store := newFakeStore()
	store.entries[state.SessionKey("u1", "routed")] = state.SessionEntry{UserID: "u1", ChatID: "routed", SessionPath: "/s.jsonl"}
	deliveryRouter, fakeTr := newDeliveryTestRouter(t, store)

	for _, chatID := range []string{"first", "latest"} {
		if err := deliveryRouter.HandleInbound(context.Background(), transport.InboundMessage{
			Platform: "fake", ChatID: chatID, UserID: "u1", Text: "/help",
		}); err != nil {
			t.Fatal(err)
		}
	}
	waitForSend(t, fakeTr, 2, 2*time.Second)

	if err := deliveryRouter.DeliverAutomationResult(context.Background(), "daily brief"); err != nil {
		t.Fatalf("deliver: %v", err)
	}
	sends := fakeTr.snapshot()
	delivered := sends[len(sends)-1]
	if delivered.ChatID != "latest" || delivered.Text != "daily brief" {
		t.Fatalf("delivered %+v, want text to chat latest", delivered)
	}
}

func TestDeliverAutomationResult_FallsBackToTheOnlyRoutedChat(t *testing.T) {
	store := newFakeStore()
	store.entries[state.SessionKey("u1", "c1")] = state.SessionEntry{UserID: "u1", ChatID: "c1", SessionPath: "/s.jsonl"}
	deliveryRouter, fakeTr := newDeliveryTestRouter(t, store)

	if err := deliveryRouter.DeliverAutomationResult(context.Background(), "daily brief"); err != nil {
		t.Fatalf("deliver: %v", err)
	}
	sends := fakeTr.snapshot()
	if len(sends) != 1 || sends[0].ChatID != "c1" {
		t.Fatalf("sends = %+v, want one send to c1", sends)
	}
}

func TestDeliverAutomationResult_SplitsTextAtTheChannelLimit(t *testing.T) {
	store := newFakeStore()
	store.entries[state.SessionKey("u1", "c1")] = state.SessionEntry{UserID: "u1", ChatID: "c1", SessionPath: "/s.jsonl"}
	deliveryRouter, fakeTr := newDeliveryTestRouter(t, store)
	longLine := strings.Repeat("长", 500)
	text := "晨间简报 成功\n\n" + longLine

	if err := deliveryRouter.DeliverAutomationResult(context.Background(), text); err != nil {
		t.Fatalf("deliver: %v", err)
	}
	sends := fakeTr.snapshot()
	if len(sends) != 3 {
		t.Fatalf("sends = %d, want 3 parts for a 1000-byte limit", len(sends))
	}
	var rebuilt strings.Builder
	for _, send := range sends {
		if len(send.Text) > fakeTr.caps.MaxMessageLength || !utf8.ValidString(send.Text) {
			t.Fatalf("part of %d bytes is over the limit or splits a character", len(send.Text))
		}
		rebuilt.WriteString(send.Text)
	}
	if sends[0].Text != "晨间简报 成功" || rebuilt.String() != "晨间简报 成功"+longLine {
		t.Fatalf("parts do not rebuild the text: first part %q", sends[0].Text)
	}
}

func TestDeliverAutomationResult_NeedsAChatWhenRoutesAreAmbiguousOrEmpty(t *testing.T) {
	ambiguous := newFakeStore()
	ambiguous.entries[state.SessionKey("u1", "c1")] = state.SessionEntry{UserID: "u1", ChatID: "c1"}
	ambiguous.entries[state.SessionKey("u2", "c2")] = state.SessionEntry{UserID: "u2", ChatID: "c2"}

	for name, store := range map[string]*fakeStore{"ambiguous": ambiguous, "empty": newFakeStore()} {
		t.Run(name, func(t *testing.T) {
			deliveryRouter, fakeTr := newDeliveryTestRouter(t, store)
			err := deliveryRouter.DeliverAutomationResult(context.Background(), "daily brief")
			if !errors.Is(err, ErrNoDeliveryChat) {
				t.Fatalf("err = %v, want ErrNoDeliveryChat", err)
			}
			if sends := fakeTr.snapshot(); len(sends) != 0 {
				t.Fatalf("unexpected sends %+v", sends)
			}
		})
	}
}

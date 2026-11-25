package router

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"
	"unicode/utf8"

	"vetta-im-gateway/internal/command"
	"vetta-im-gateway/internal/hostclient"
	"vetta-im-gateway/internal/transport"
)

func newDeliveryTestRouter(t *testing.T) (*Router, *fakeTransport) {
	t.Helper()
	fakeTr := newFakeTransport()
	pool := hostclient.NewProcessPool(&streamingFakeClient{reply: "ok"}, 4)
	deliveryRouter := New(fakeTr, command.NewRouter(), newFakeStore(), pool, testCwd)
	t.Cleanup(deliveryRouter.Shutdown)
	return deliveryRouter, fakeTr
}

type proposedChat struct {
	chatID   string
	userID   string
	explicit bool
}

// recordProposals installs a delivery-chat hook that records every call.
func recordProposals(deliveryRouter *Router) func() []proposedChat {
	var mu sync.Mutex
	var proposals []proposedChat
	deliveryRouter.SetDeliveryChatHandler(func(chatID, userID string, explicit bool) {
		mu.Lock()
		defer mu.Unlock()
		proposals = append(proposals, proposedChat{chatID: chatID, userID: userID, explicit: explicit})
	})
	return func() []proposedChat {
		mu.Lock()
		defer mu.Unlock()
		return append([]proposedChat(nil), proposals...)
	}
}

func TestDeliverAutomationResult_SendsToTheRequestedChat(t *testing.T) {
	deliveryRouter, fakeTr := newDeliveryTestRouter(t)

	if err := deliveryRouter.DeliverAutomationResult(context.Background(), "c1", "daily brief"); err != nil {
		t.Fatalf("deliver: %v", err)
	}
	sends := fakeTr.snapshot()
	if len(sends) != 1 || sends[0].ChatID != "c1" || sends[0].Text != "daily brief" {
		t.Fatalf("sends = %+v, want one send to c1", sends)
	}
}

func TestDeliverAutomationResult_NeedsAChat(t *testing.T) {
	deliveryRouter, fakeTr := newDeliveryTestRouter(t)

	err := deliveryRouter.DeliverAutomationResult(context.Background(), "", "daily brief")
	if !errors.Is(err, ErrNoDeliveryChat) {
		t.Fatalf("err = %v, want ErrNoDeliveryChat", err)
	}
	if sends := fakeTr.snapshot(); len(sends) != 0 {
		t.Fatalf("unexpected sends %+v", sends)
	}
}

func TestDeliverAutomationResult_SplitsTextAtTheChannelLimit(t *testing.T) {
	deliveryRouter, fakeTr := newDeliveryTestRouter(t)
	longLine := strings.Repeat("长", 500)
	text := "晨间简报 成功\n\n" + longLine

	if err := deliveryRouter.DeliverAutomationResult(context.Background(), "c1", text); err != nil {
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

func TestDeliveryChat_OnlyPrivateMessagesAreProposed(t *testing.T) {
	deliveryRouter, fakeTr := newDeliveryTestRouter(t)
	proposals := recordProposals(deliveryRouter)

	inbound := []transport.InboundMessage{
		{Platform: "fake", ChatID: "group", UserID: "stranger", Text: "/help"},
		{Platform: "fake", ChatID: "dm", UserID: "u1", Text: "/help", Private: true},
		{Platform: "fake", ChatID: "dm", UserID: "u1", Text: "/help", Private: true},
		{Platform: "fake", ChatID: "dm-button", UserID: "u1", Text: "approve", ActionID: "a1", Private: true},
	}
	for _, msg := range inbound {
		if err := deliveryRouter.HandleInbound(context.Background(), msg); err != nil {
			t.Fatal(err)
		}
	}
	waitForSend(t, fakeTr, 3, 2*time.Second)

	want := proposedChat{chatID: "dm", userID: "u1"}
	got := proposals()
	if len(got) != 2 || got[0] != want || got[1] != want {
		t.Fatalf("proposals = %+v, want an implicit proposal for each dm message", got)
	}
}

func TestDeliveryChat_NotifyCommandProposesTheChatExplicitly(t *testing.T) {
	deliveryRouter, fakeTr := newDeliveryTestRouter(t)
	proposals := recordProposals(deliveryRouter)

	if err := deliveryRouter.HandleInbound(context.Background(), transport.InboundMessage{
		Platform: "fake", ChatID: "group", UserID: "u1", Text: "/notify",
	}); err != nil {
		t.Fatal(err)
	}
	waitForSend(t, fakeTr, 1, 2*time.Second)

	got := proposals()
	if len(got) != 1 || got[0] != (proposedChat{chatID: "group", userID: "u1", explicit: true}) {
		t.Fatalf("proposals = %+v, want one explicit proposal for group", got)
	}
	if reply := fakeTr.snapshot()[0].Text; !strings.Contains(reply, "自动化") {
		t.Fatalf("reply = %q, want a confirmation", reply)
	}
}

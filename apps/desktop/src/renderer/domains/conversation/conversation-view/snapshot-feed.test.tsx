// @vitest-environment jsdom

import { createConversationUserMessage } from "@shared/conversation";
import type { ChatConversationItem } from "@shared/store/chat-atoms";
import { renderHook } from "@testing-library/react";
import { createStore, Provider, useAtomValue } from "jotai";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { useSnapshotConversationFeed } from "./snapshot-feed";

const workspace = { id: "w", cwd: "/w" } as never;

function useFeedWithItems(props: { key: string; messages: readonly ChatConversationItem[]; isStreaming: boolean }) {
	const feed = useSnapshotConversationFeed({ ...props, workspace });
	return { feed, items: useAtomValue(feed.items), streaming: useAtomValue(feed.streaming) };
}

describe("useSnapshotConversationFeed", () => {
	it("keeps one feed object while its messages and streaming state change", () => {
		const store = createStore();
		const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
		const first = [createConversationUserMessage({ id: "a", text: "first" })];
		const { result, rerender } = renderHook(useFeedWithItems, {
			wrapper,
			initialProps: { key: "team", messages: first, isStreaming: false },
		});
		const feed = result.current.feed;

		const second = [...first, createConversationUserMessage({ id: "b", text: "second" })];
		rerender({ key: "team", messages: second, isStreaming: true });

		expect(result.current.feed).toBe(feed);
		expect(result.current.items).toBe(second);
		expect(result.current.streaming).toBe(true);
	});

	it("starts a new feed for another list", () => {
		const messages = [createConversationUserMessage({ id: "a", text: "first" })];
		const { result, rerender } = renderHook(useFeedWithItems, {
			initialProps: { key: "one", messages, isStreaming: false },
		});
		const feed = result.current.feed;
		rerender({ key: "two", messages, isStreaming: false });
		expect(result.current.feed).not.toBe(feed);
		expect(result.current.items).toBe(messages);
	});
});

import type { ConversationParticipantViewModel } from "@shared/conversation";
import type { ChatConversationItem } from "@shared/store/chat-atoms";
import type { ActivityWorkspace } from "@shared/workspace/activity-workspace";
import { atom, useStore } from "jotai";
import { useLayoutEffect, useMemo } from "react";
import { type ConversationFeed, createConversationFeed } from "./feed";

export interface SnapshotConversationFeedInput {
	/** Scope of view state and the list identity, e.g. a transcript path or a Team feed key. */
	readonly key: string | null;
	readonly messages: readonly ChatConversationItem[];
	readonly isStreaming?: boolean;
	readonly workspace: ActivityWorkspace;
	readonly participants?: readonly ConversationParticipantViewModel[];
	readonly pendingLabel?: string;
	readonly openTeamMember?: (memberId: string) => void;
}

/**
 * A feed over messages the caller already holds (a transcript read from disk, a
 * Team timeline). It offers no session commands; a new message array replaces
 * the feed's items while the feed object itself stays the same.
 */
export function useSnapshotConversationFeed({
	key,
	messages,
	isStreaming = false,
	workspace,
	participants,
	pendingLabel,
	openTeamMember,
}: SnapshotConversationFeedInput): ConversationFeed {
	const store = useStore();
	// The feed must stay one object for the life of a list: rows read it from context, so a
	// new feed per message update would re-render every visible row on each streamed token.
	// The atoms are therefore created once per list identity and their values written below.
	// biome-ignore lint/correctness/useExhaustiveDependencies: seeded once per key, updated in the layout effect
	const items = useMemo(() => atom<readonly ChatConversationItem[]>(messages), [key]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: seeded once per key, updated in the layout effect
	const streaming = useMemo(() => atom(isStreaming), [key]);
	// Before paint, so the list never shows a frame of stale messages.
	useLayoutEffect(() => {
		store.set(items, messages);
	}, [store, items, messages]);
	useLayoutEffect(() => {
		store.set(streaming, isStreaming);
	}, [store, streaming, isStreaming]);
	return useMemo(
		() =>
			createConversationFeed({
				key,
				items,
				streaming,
				workspace,
				...(participants ? { participants } : {}),
				...(pendingLabel ? { pendingLabel } : {}),
				capabilities: openTeamMember ? { openTeamMember } : {},
			}),
		[key, items, streaming, workspace, participants, pendingLabel, openTeamMember],
	);
}

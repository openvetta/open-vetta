import type { PluginImageRef, PluginMessageSlotMessage, PluginMessageSlotToolCall } from "@vetta/plugin-sdk";
import { useAtomValue } from "jotai";
import { Component, type ErrorInfo, type ReactNode, useMemo } from "react";
import { chatMessagesAtom, pendingEditImageIdAtom, pluginMessageSlotsAtom } from "@shared/store/atoms";
import type { ChatMessage, ContentBlock } from "@shared/store/chat-atoms";

// Contract with coding-agent's generate_image / edit_image tools: image refs
// ride in the tool result text wrapped in these markers (the host drops tool
// `details`). Each ref carries a `rootId` (its edit-lineage root).
const IMAGE_REFS_OPEN = "<vetta-images>";
const IMAGE_REFS_CLOSE = "</vetta-images>";

/** Tool names that produce host image refs (text-to-image and image-to-image). */
function isImageTool(toolName: string): boolean {
	return toolName === "generate_image" || toolName === "edit_image";
}

class MessageSlotErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
	state = { failed: false };
	static getDerivedStateFromError(): { failed: boolean } {
		return { failed: true };
	}
	componentDidCatch(error: Error, info: ErrorInfo): void {
		console.error("Plugin message slot failed", error, info.componentStack);
	}
	render(): ReactNode {
		return this.state.failed ? null : this.props.children;
	}
}

/** True while an image tool call in this message is still running. */
function isGeneratingImage(blocks: ContentBlock[] | undefined): boolean {
	return blocks?.some((b) => b.type === "tool_call" && isImageTool(b.toolName) && b.status === "pending") ?? false;
}

/**
 * Source image id of an in-flight edit_image call in this message, if any — read
 * from the pending tool_call's args. Used so the edit skeleton anchors on the
 * source's lineage even after a session switch: the one-shot pendingEditImageId
 * atom is cleared on switch, but the tool_call block (and its args) is restored
 * from history, so this keeps working.
 */
function pendingEditSourceId(blocks: ContentBlock[] | undefined): string | undefined {
	for (const block of blocks ?? []) {
		if (block.type !== "tool_call" || block.toolName !== "edit_image" || block.status !== "pending") continue;
		const sid = block.args?.sourceImageId;
		if (typeof sid === "string" && sid.length > 0) return sid;
	}
	return undefined;
}

/** Parse image refs embedded by the image tools out of a message's blocks. */
function extractImageRefs(blocks: ContentBlock[] | undefined): PluginImageRef[] {
	if (!blocks) return [];
	const refs: PluginImageRef[] = [];
	for (const block of blocks) {
		if (block.type !== "tool_call" || !isImageTool(block.toolName)) continue;
		const text = block.result;
		if (!text) continue;
		const start = text.indexOf(IMAGE_REFS_OPEN);
		const end = text.indexOf(IMAGE_REFS_CLOSE);
		if (start < 0 || end < 0) continue;
		try {
			const parsed = JSON.parse(text.slice(start + IMAGE_REFS_OPEN.length, end)) as PluginImageRef[];
			if (Array.isArray(parsed)) refs.push(...parsed);
		} catch {
			// Ignore malformed markers.
		}
	}
	return refs;
}

function extractToolCalls(blocks: ContentBlock[] | undefined): PluginMessageSlotToolCall[] | undefined {
	if (!blocks) return undefined;
	const calls = blocks
		.filter((block) => block.type === "tool_call")
		.map((block) => ({
			toolCallId: block.toolCallId,
			toolName: block.toolName,
			args: block.args,
			status: block.status,
			result: block.result,
			isError: block.isError,
		}));
	return calls.length > 0 ? calls : undefined;
}

/**
 * Mounts plugin per-message slot components beneath a single message, stacked in
 * registration order. Host-side binds image fields onto the message handed to
 * each slot:
 *  - `imageRefs` — refs extracted from this turn's image tool result.
 *  - `imageGenerating` — an image tool is still running in this message.
 *  - `editingImageId` — when this in-flight turn is editing a specific image.
 *
 * Lineage dedup: a given edit-lineage (rootId) is shown by ONLY the latest
 * message producing it. Earlier messages with the same rootId get their
 * `imageRefs` stripped so their card self-hides (the swiper "moves down" to the
 * newest turn). The in-flight edit turn (no refs yet) claims its target's rootId
 * via `pendingEditImageId`, so the prior card hides immediately and the new card
 * renders the lineage with a leading skeleton.
 */
export function PluginMessageSlotsHost({ message }: { message: ChatMessage }): JSX.Element | null {
	const slots = useAtomValue(pluginMessageSlotsAtom);
	const messages = useAtomValue(chatMessagesAtom);
	const pendingEditId = useAtomValue(pendingEditImageIdAtom);

	// The most recent message with an image tool still running — the in-flight edit
	// turn, if any. Lets us mark it as editing the picked image so its card renders
	// the source's lineage + leading skeleton. Lineage DEDUP (showing a lineage only
	// under its latest turn) is done plugin-side via the backend lineage, so it works
	// regardless of whether the result marker carried a rootId (older images don't).
	const latestGeneratingId = useMemo<string | undefined>(() => {
		let id: string | undefined;
		for (const m of messages) if (isGeneratingImage(m.blocks)) id = m.id;
		return id;
	}, [messages]);

	// Synchronous lineage dedup: for each rootId, the LAST message (in list order)
	// that produced a ref carrying it owns the lineage. This MUST be done host-side
	// and synchronously — doing it plugin-side (via an async backend lineage fetch)
	// makes a superseded card mount at full height, then collapse to 0 once the
	// fetch resolves, which yanks the scroll position by one item (the "jump" users
	// see when scrolling up past an edited image). Refs without a rootId (legacy
	// images) can't be deduped here; the plugin still falls back to its own check.
	const latestOwnerByRoot = useMemo<Map<string, string>>(() => {
		const owner = new Map<string, string>();
		for (const m of messages) {
			for (const ref of extractImageRefs(m.blocks)) {
				if (ref.rootId) owner.set(ref.rootId, m.id);
			}
		}
		return owner;
	}, [messages]);

	const slotMessage = useMemo<PluginMessageSlotMessage>(() => {
		const generating = isGeneratingImage(message.blocks);
		const refs = extractImageRefs(message.blocks);
		// Strip refs whose lineage is owned by a later message so superseded turns
		// render empty from the first paint (no async height collapse / scroll jump).
		const visibleRefs = refs.filter((r) => !r.rootId || latestOwnerByRoot.get(r.rootId) === message.id);
		// Prefer the in-flight edit_image block's own source id (persists across
		// session switches); fall back to the one-shot atom for the brief window
		// before the tool_call block exists.
		const editSourceId = pendingEditSourceId(message.blocks);
		const isEditOwner = generating && !!pendingEditId && message.id === latestGeneratingId;
		return {
			id: message.id,
			role: message.role,
			text: message.text,
			timestamp: message.timestamp,
			toolCalls: extractToolCalls(message.blocks),
			imageRefs: visibleRefs.length > 0 ? visibleRefs : undefined,
			imageGenerating: generating,
			editingImageId: editSourceId ?? (isEditOwner ? (pendingEditId ?? undefined) : undefined),
		};
	}, [message, pendingEditId, latestGeneratingId, latestOwnerByRoot]);

	if (slots.length === 0) return null;

	return (
		<div className="flex flex-col gap-2" data-vetta-message-slots={message.id}>
			{slots.map((slot) => {
				const SlotComponent = slot.component;
				return (
					<MessageSlotErrorBoundary key={slot.slotId}>
						<SlotComponent message={slotMessage} />
					</MessageSlotErrorBoundary>
				);
			})}
		</div>
	);
}

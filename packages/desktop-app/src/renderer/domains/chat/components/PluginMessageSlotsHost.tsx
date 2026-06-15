import type { PluginImageRef, PluginMessageSlotMessage } from "@vetta/plugin-sdk";
import { useAtomValue } from "jotai";
import { Component, type ErrorInfo, type ReactNode, useMemo } from "react";
import { pluginMessageSlotsAtom } from "@shared/store/atoms";
import type { ChatMessage, ContentBlock } from "@shared/store/chat-atoms";

// Contract with coding-agent's generate_image tool: image refs ride in the
// tool result text wrapped in these markers (the host drops tool `details`).
const IMAGE_REFS_OPEN = "<vetta-images>";
const IMAGE_REFS_CLOSE = "</vetta-images>";

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

/** True while a generate_image tool call in this message is still running. */
function isGeneratingImage(blocks: ContentBlock[] | undefined): boolean {
	return blocks?.some((b) => b.type === "tool_call" && b.toolName === "generate_image" && b.status === "pending") ?? false;
}

/** Parse image refs embedded by the generate_image tool out of a message's blocks. */
function extractImageRefs(blocks: ContentBlock[] | undefined): PluginImageRef[] {
	if (!blocks) return [];
	const refs: PluginImageRef[] = [];
	for (const block of blocks) {
		if (block.type !== "tool_call" || block.toolName !== "generate_image") continue;
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

/**
 * Mounts plugin per-message slot components beneath a single message, stacked
 * in registration order. Host-side binds `imageRefs` (extracted from the turn's
 * generate_image tool result) onto the message handed to each slot.
 */
export function PluginMessageSlotsHost({ message }: { message: ChatMessage }): JSX.Element | null {
	const slots = useAtomValue(pluginMessageSlotsAtom);
	const slotMessage = useMemo<PluginMessageSlotMessage>(() => {
		const imageRefs = extractImageRefs(message.blocks);
		return {
			id: message.id,
			role: message.role,
			text: message.text,
			timestamp: message.timestamp,
			imageRefs: imageRefs.length > 0 ? imageRefs : undefined,
			imageGenerating: isGeneratingImage(message.blocks),
		};
	}, [message]);

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

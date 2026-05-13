import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { ImageContent, TextContent, ToolResultMessage, UserMessage } from "@mariozechner/pi-ai";

const IMAGE_OMITTED_PLACEHOLDER = "[earlier image omitted to conserve memory]";

type MessageWithImageContent = UserMessage | ToolResultMessage;

function carriesImageContent(msg: AgentMessage): msg is MessageWithImageContent {
	if (!msg || typeof msg !== "object") return false;
	const role = (msg as { role?: unknown }).role;
	if (role !== "user" && role !== "toolResult") return false;
	const content = (msg as { content?: unknown }).content;
	return Array.isArray(content);
}

/**
 * Keep at most `budget` most-recent images in the message stream.
 *
 * Older ImageContent items are replaced with a short text placeholder so the
 * model still sees a marker for the dropped attachment without paying its
 * visual-token cost. This prevents accumulated visual tokens from blowing past
 * the GPU memory budget of local/open-source VL models when a session reads
 * multiple images.
 *
 * Pass `budget <= 0` to disable the filter (all images are kept).
 */
export function applyImageBudget(messages: AgentMessage[], budget: number): AgentMessage[] {
	if (!Number.isFinite(budget) || budget <= 0) {
		return messages;
	}

	let remaining = budget;
	let mutated = false;
	const reversedResult: AgentMessage[] = [];

	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (!carriesImageContent(msg)) {
			reversedResult.push(msg);
			continue;
		}

		const content = msg.content as (TextContent | ImageContent)[];
		if (!content.some((c) => c.type === "image")) {
			reversedResult.push(msg);
			continue;
		}

		// Walk content backward so that within a single message we keep the
		// newest images and drop the oldest when budget runs out mid-message.
		let touched = false;
		const reversedContent: (TextContent | ImageContent)[] = [];
		for (let j = content.length - 1; j >= 0; j--) {
			const item = content[j];
			if (item.type === "image") {
				if (remaining > 0) {
					remaining--;
					reversedContent.push(item);
				} else {
					touched = true;
					reversedContent.push({ type: "text", text: IMAGE_OMITTED_PLACEHOLDER });
				}
			} else {
				reversedContent.push(item);
			}
		}

		if (touched) {
			mutated = true;
			reversedResult.push({ ...msg, content: reversedContent.reverse() });
		} else {
			reversedResult.push(msg);
		}
	}

	return mutated ? reversedResult.reverse() : messages;
}

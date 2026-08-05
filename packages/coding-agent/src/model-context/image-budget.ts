import type { AgentMessage } from "@vetta/agent-core";
import type { ImageContent, TextContent, ToolResultMessage, UserMessage } from "@vetta/ai";

const IMAGE_OMITTED_PLACEHOLDER = "[earlier image omitted to conserve memory]";

type MessageWithImageContent = UserMessage | ToolResultMessage;

function carriesImageContent(message: AgentMessage): message is MessageWithImageContent {
	if (!message || typeof message !== "object") return false;
	const role = (message as { role?: unknown }).role;
	if (role !== "user" && role !== "toolResult") return false;
	const content = (message as { content?: unknown }).content;
	return Array.isArray(content);
}

/** Keep recent seen images while always retaining images not yet observed by the model. */
export function applyImageBudget(messages: AgentMessage[], budget: number): AgentMessage[] {
	if (!Number.isFinite(budget) || budget <= 0) return messages;

	let lastAssistantIndex = -1;
	for (let index = messages.length - 1; index >= 0; index--) {
		if ((messages[index] as { role?: unknown }).role === "assistant") {
			lastAssistantIndex = index;
			break;
		}
	}

	let remaining = budget;
	let mutated = false;
	const reversedResult: AgentMessage[] = [];

	for (let index = messages.length - 1; index >= 0; index--) {
		const message = messages[index];
		if (index > lastAssistantIndex || !carriesImageContent(message)) {
			reversedResult.push(message);
			continue;
		}

		const content = message.content as (TextContent | ImageContent)[];
		if (!content.some((item) => item.type === "image")) {
			reversedResult.push(message);
			continue;
		}

		let touched = false;
		const reversedContent: (TextContent | ImageContent)[] = [];
		for (let contentIndex = content.length - 1; contentIndex >= 0; contentIndex--) {
			const item = content[contentIndex];
			if (item.type !== "image") {
				reversedContent.push(item);
				continue;
			}
			if (remaining > 0) {
				remaining -= 1;
				reversedContent.push(item);
			} else {
				touched = true;
				reversedContent.push({ type: "text", text: IMAGE_OMITTED_PLACEHOLDER });
			}
		}

		if (touched) {
			mutated = true;
			reversedResult.push({ ...message, content: reversedContent.reverse() });
		} else {
			reversedResult.push(message);
		}
	}

	return mutated ? reversedResult.reverse() : messages;
}

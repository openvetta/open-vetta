/**
 * Layer 1: Microcompact — lightweight tool result pruning.
 *
 * Clears old tool result and bash execution content to reduce context size
 * without calling the LLM. Runs as a pure function on every LLM call
 * via transformContext.
 */

import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { ToolResultMessage } from "@mariozechner/pi-ai";
import type { BashExecutionMessage } from "../messages.js";

export interface MicrocompactOptions {
	/** Always keep the N most recent compactable results intact. */
	keepRecent: number;
	/** Only clear results older than this (ms). 0 = skip time check, prune by count only. */
	maxAgeMs: number;
}

export const DEFAULT_MICROCOMPACT_OPTIONS: MicrocompactOptions = {
	keepRecent: 5,
	maxAgeMs: 60 * 60 * 1000, // 60 minutes
};

const CLEARED_MESSAGE = "[tool result cleared — old context]";

/** Roles whose content can be pruned. */
const COMPACTABLE_ROLES = new Set(["toolResult", "bashExecution"]);

/**
 * Microcompact: prune old tool results and bash outputs.
 *
 * Algorithm:
 * 1. Collect indices of compactable messages (toolResult / bashExecution).
 * 2. The last `keepRecent` are always protected.
 * 3. For unprotected messages, if `maxAgeMs > 0`, only clear those older
 *    than `now - maxAgeMs`. If `maxAgeMs === 0`, clear all unprotected.
 * 4. Return a new array with cleared messages (shallow copy; only touched
 *    messages are new objects).
 */
export function microcompact(
	messages: AgentMessage[],
	options: MicrocompactOptions = DEFAULT_MICROCOMPACT_OPTIONS,
): AgentMessage[] {
	// Collect indices of compactable messages
	const compactableIndices: number[] = [];
	for (let i = 0; i < messages.length; i++) {
		if (COMPACTABLE_ROLES.has(messages[i].role)) {
			compactableIndices.push(i);
		}
	}

	if (compactableIndices.length <= options.keepRecent) {
		return messages; // Nothing to clear
	}

	// Indices to potentially clear (oldest first, excluding protected tail)
	const clearCandidates = compactableIndices.slice(0, -options.keepRecent);

	const now = Date.now();
	const clearSet = new Set<number>();

	for (const idx of clearCandidates) {
		const msg = messages[idx];
		if (options.maxAgeMs > 0) {
			const ts = (msg as ToolResultMessage | BashExecutionMessage).timestamp;
			if (ts && now - ts >= options.maxAgeMs) {
				clearSet.add(idx);
			}
		} else {
			// maxAgeMs === 0: clear all unprotected
			clearSet.add(idx);
		}
	}

	if (clearSet.size === 0) {
		return messages;
	}

	// Build result with cleared messages
	const result = new Array<AgentMessage>(messages.length);
	for (let i = 0; i < messages.length; i++) {
		if (!clearSet.has(i)) {
			result[i] = messages[i];
			continue;
		}

		const msg = messages[i];
		if (msg.role === "toolResult") {
			const tr = msg as ToolResultMessage;
			// Skip if already cleared
			if (tr.content.length === 1 && tr.content[0].type === "text" && tr.content[0].text === CLEARED_MESSAGE) {
				result[i] = msg;
				continue;
			}
			result[i] = {
				...tr,
				content: [{ type: "text", text: CLEARED_MESSAGE }],
			};
		} else if (msg.role === "bashExecution") {
			const bash = msg as BashExecutionMessage;
			if (bash.output === CLEARED_MESSAGE) {
				result[i] = msg;
				continue;
			}
			result[i] = { ...bash, output: CLEARED_MESSAGE };
		} else {
			result[i] = msg;
		}
	}
	return result;
}

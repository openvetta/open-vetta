import type { ToolCallBlock } from "@shared/store/atoms";
import type { GroupBlock } from "./progressGroupModel";

export const WORK_ACTIVITY_PREVIEW_MAX_CHARACTERS = 80;
/** A live tool with no new phase or output past this point looks stuck, not busy. */
export const WORK_ACTIVITY_STALL_AFTER_MS = 45_000;

export type WorkGroupActivity =
	| { type: "tool"; block: ToolCallBlock; stalled: boolean }
	| { type: "thinking"; preview: string };

/** Collapse streamed prose into one stable-width line while retaining its latest content. */
export function compactWorkActivityText(text: string, maxCharacters = WORK_ACTIVITY_PREVIEW_MAX_CHARACTERS): string {
	const normalized = text.replace(/\s+/g, " ").trim();
	if (!normalized || maxCharacters <= 0) return "";
	const characters = Array.from(normalized);
	if (characters.length <= maxCharacters) return normalized;
	if (maxCharacters === 1) return "…";
	return `…${characters.slice(-(maxCharacters - 1)).join("")}`;
}

/**
 * Select the activity that best answers “what is the agent doing now?”.
 * A still-running tool wins over later settled calls because tool calls may execute concurrently.
 */
export function selectWorkGroupActivity(blocks: readonly GroupBlock[], now = Date.now()): WorkGroupActivity | null {
	for (let index = blocks.length - 1; index >= 0; index--) {
		const block = blocks[index];
		if (block.type === "tool_call" && block.status === "pending") {
			return { type: "tool", block, stalled: isToolActivityStalled(block, now) };
		}
	}

	for (let index = blocks.length - 1; index >= 0; index--) {
		const block = blocks[index];
		if (block.type === "tool_call") return { type: "tool", block, stalled: false };
		const preview = compactWorkActivityText(block.text);
		if (preview) return { type: "thinking", preview };
	}

	return null;
}

/** Last reported phase, or the tool start when the tool never reported one. */
export function toolActivityAnchorMs(block: ToolCallBlock): number | undefined {
	if (block.startedAt === undefined) return undefined;
	const lastPhase = block.phases?.at(-1);
	return lastPhase === undefined ? block.startedAt : block.startedAt + lastPhase.atMs;
}

export function isToolActivityStalled(block: ToolCallBlock, now = Date.now()): boolean {
	if (block.status !== "pending") return false;
	const anchor = toolActivityAnchorMs(block);
	if (anchor === undefined) return false;
	return now - anchor >= WORK_ACTIVITY_STALL_AFTER_MS;
}

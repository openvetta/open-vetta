import type { ContentBlock, TextBlock, ThinkingBlock, ToolCallBlock } from "@shared/store/atoms";

export type BlockSegment =
	| { type: "single"; block: ContentBlock }
	| { type: "tool_group"; blocks: (ToolCallBlock | ThinkingBlock)[] };

export interface AssistantFoldData {
	processBlocks: ContentBlock[];
	trailingBlocks: ContentBlock[];
	outputBlocks: TextBlock[];
	hiddenCount: number;
}

function blockKey(block: ContentBlock): string {
	switch (block.type) {
		case "tool_call":
			return `tc-${block.toolCallId}`;
		case "tool_result":
			return `tr-${block.toolCallId}`;
		case "text":
		case "thinking":
		case "error":
			return `${block.type}-${block.id}`;
	}
}

export function segmentKey(segment: BlockSegment): string {
	if (segment.type === "single") return blockKey(segment.block);
	return `group-${blockKey(segment.blocks[0])}`;
}

function isCustomToolUiBlock(block: ContentBlock, customToolNames: Set<string>): boolean {
	return block.type === "tool_call" && customToolNames.has(block.toolName);
}

export function groupBlocks(blocks: ContentBlock[], customToolNames: Set<string>): BlockSegment[] {
	const segments: BlockSegment[] = [];
	let batch: (ToolCallBlock | ThinkingBlock)[] = [];
	const flushBatch = (): void => {
		if (batch.length === 0) return;
		segments.push(
			batch.length === 1 ? { type: "single", block: batch[0] } : { type: "tool_group", blocks: [...batch] },
		);
		batch = [];
	};
	for (const block of blocks) {
		if (isCustomToolUiBlock(block, customToolNames)) {
			flushBatch();
			segments.push({ type: "single", block });
		} else if (block.type === "tool_call" || block.type === "thinking") {
			batch.push(block);
		} else if (block.type === "tool_result") {
		} else if (block.type === "text" && !block.text.trim() && batch.length > 0) {
		} else {
			flushBatch();
			segments.push({ type: "single", block });
		}
	}
	flushBatch();
	return segments;
}

export function findLastProcessBlockIndex(blocks: ContentBlock[], customToolNames: Set<string> = new Set()): number {
	for (let index = blocks.length - 1; index >= 0; index--) {
		const block = blocks[index];
		if (isCustomToolUiBlock(block, customToolNames)) continue;
		if (block.type === "tool_call" || block.type === "thinking") return index;
	}
	return -1;
}

export function getAssistantFoldData(blocks: ContentBlock[], customToolNames: Set<string>): AssistantFoldData | null {
	const lastProcessIndex = findLastProcessBlockIndex(blocks, customToolNames);
	if (lastProcessIndex === -1) return null;
	const outputBlocks = blocks
		.slice(lastProcessIndex + 1)
		.filter((block): block is TextBlock => block.type === "text" && block.text.trim().length > 0);
	if (outputBlocks.length === 0) return null;
	return {
		processBlocks: blocks.slice(0, lastProcessIndex + 1),
		trailingBlocks: blocks.slice(lastProcessIndex + 1),
		outputBlocks,
		hiddenCount: blocks.length - outputBlocks.length,
	};
}

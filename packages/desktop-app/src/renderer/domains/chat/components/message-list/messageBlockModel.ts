import type { ContentBlock, TextBlock, ThinkingBlock, ToolCallBlock } from "@shared/store/atoms";

/** Work 模式的阶段声明工具（display-only，见 docs/adr/0047）。 */
export const PROGRESS_TOOL_NAME = "progress";

export type BlockSegment =
	| { type: "single"; block: ContentBlock }
	| { type: "tool_group"; blocks: (ToolCallBlock | ThinkingBlock)[] }
	/** Work 模式的 progress 调用，在 coding 渲染下降级为一行轻量小标题分隔符。 */
	| { type: "progress_divider"; block: ToolCallBlock };

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
	if (segment.type === "progress_divider") return `pd-${segment.block.toolCallId}`;
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
		if (block.type === "tool_call" && block.toolName === PROGRESS_TOOL_NAME) {
			flushBatch();
			segments.push({ type: "progress_divider", block });
		} else if (isCustomToolUiBlock(block, customToolNames)) {
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

const SHORT_EPILOGUE_MAX_CHARS = 80;
const PRIMARY_ANSWER_MIN_CHARS = 160;

function hasStructuredAnswerContent(text: string): boolean {
	return /```|^\s{0,3}#{1,6}\s|^\s*[-*+]\s|^\s*\d+[.)]\s|\|.+\|/m.test(text);
}

function isShortEpilogueText(blocks: TextBlock[]): boolean {
	if (blocks.length !== 1) return false;
	const text = blocks[0].text.trim();
	return text.length > 0 && text.length <= SHORT_EPILOGUE_MAX_CHARS && !hasStructuredAnswerContent(text);
}

function isMaintenanceToolCall(block: ContentBlock): boolean {
	if (block.type !== "tool_call") return false;
	const toolName = block.toolName.toLowerCase();
	if (!toolName.includes("todo")) return false;
	return block.args.action === "update";
}

function findPreviousPrimaryAnswerIndex(blocks: ContentBlock[], beforeIndex: number): number {
	for (let index = beforeIndex - 1; index >= 0; index--) {
		const block = blocks[index];
		if (block.type === "tool_call" || block.type === "thinking") return -1;
		if (block.type !== "text") continue;
		if (block.text.trim().length >= PRIMARY_ANSWER_MIN_CHARS) return index;
	}
	return -1;
}

export function getAssistantFoldData(blocks: ContentBlock[], customToolNames: Set<string>): AssistantFoldData | null {
	const lastProcessIndex = findLastProcessBlockIndex(blocks, customToolNames);
	if (lastProcessIndex === -1) return null;
	const trailingTextBlocks = blocks
		.slice(lastProcessIndex + 1)
		.filter((block): block is TextBlock => block.type === "text" && block.text.trim().length > 0);
	if (trailingTextBlocks.length === 0) return null;

	const lastProcessBlock = blocks[lastProcessIndex];
	const primaryAnswerIndex =
		isMaintenanceToolCall(lastProcessBlock) && isShortEpilogueText(trailingTextBlocks)
			? findPreviousPrimaryAnswerIndex(blocks, lastProcessIndex)
			: -1;
	if (primaryAnswerIndex !== -1) {
		const primaryAnswerBlock = blocks[primaryAnswerIndex] as TextBlock;
		const outputBlocks = [primaryAnswerBlock, ...trailingTextBlocks];
		const outputBlockSet = new Set<ContentBlock>(outputBlocks);
		return {
			processBlocks: blocks.filter((block) => !outputBlockSet.has(block)),
			trailingBlocks: blocks.filter((block) => outputBlockSet.has(block)),
			outputBlocks,
			hiddenCount: blocks.length - outputBlocks.length,
		};
	}

	return {
		processBlocks: blocks.slice(0, lastProcessIndex + 1),
		trailingBlocks: blocks.slice(lastProcessIndex + 1),
		outputBlocks: trailingTextBlocks,
		hiddenCount: blocks.length - trailingTextBlocks.length,
	};
}

import type { ChatMessage, TextBlock } from "@shared/store/atoms";
import { activeSessionAtom, pluginToolCallSlotsAtom, promptPredictingAtom } from "@shared/store/atoms";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import {
	findLastProcessBlockIndex,
	getAssistantFoldData,
	groupBlocks,
} from "../components/message-list/messageBlockModel";
import type { AssistantMessageModel } from "../components/message-list/types";

interface AssistantMessageModelInput {
	expanded: boolean;
	exportMode: boolean;
	isStreaming: boolean;
	isTailMessage: boolean;
	message: ChatMessage;
}

export function useAssistantMessageModel({
	expanded,
	exportMode,
	isStreaming,
	isTailMessage,
	message,
}: AssistantMessageModelInput): AssistantMessageModel {
	const activeRuntimeId = useAtomValue(activeSessionAtom)?.runtimeId;
	const toolCallSlots = useAtomValue(pluginToolCallSlotsAtom);
	const predictingMap = useAtomValue(promptPredictingAtom);
	const customToolNames = useMemo(() => new Set(toolCallSlots.map((slot) => slot.toolName)), [toolCallSlots]);
	const isCurrentlyStreaming = isTailMessage && isStreaming;
	const foldData = useMemo(
		() => getAssistantFoldData(message.blocks ?? [], customToolNames),
		[message.blocks, customToolNames],
	);
	const visibleBlocks = useMemo(() => {
		if (exportMode && foldData) return foldData.trailingBlocks;
		if (!foldData || expanded || isCurrentlyStreaming) return message.blocks ?? [];
		return foldData.outputBlocks;
	}, [expanded, exportMode, foldData, isCurrentlyStreaming, message.blocks]);
	const segments = useMemo(() => groupBlocks(visibleBlocks, customToolNames), [visibleBlocks, customToolNames]);
	const exportProcessSegments = useMemo(
		() => (exportMode && foldData ? groupBlocks(foldData.processBlocks, customToolNames) : []),
		[customToolNames, exportMode, foldData],
	);
	const streamingTailIndex = useMemo(() => {
		if (!isCurrentlyStreaming) return -1;
		for (let index = segments.length - 1; index >= 0; index--) {
			const segment = segments[index];
			if (segment.type === "single" && segment.block.type === "text" && segment.block.text.length > 0) {
				return index;
			}
		}
		return -1;
	}, [segments, isCurrentlyStreaming]);
	const conclusionText = useMemo(() => {
		const blocks = message.blocks ?? [];
		if (blocks.length === 0) return (message.text ?? "").trim();
		const lastProcessIndex = findLastProcessBlockIndex(blocks, customToolNames);
		return blocks
			.slice(lastProcessIndex + 1)
			.filter((block): block is TextBlock => block.type === "text")
			.map((block) => block.text.trim())
			.filter(Boolean)
			.join("\n\n");
	}, [message, customToolNames]);

	return {
		conclusionText,
		exportProcessSegments,
		foldData,
		isCurrentlyStreaming,
		isPredicting:
			isTailMessage && !isCurrentlyStreaming && Boolean(activeRuntimeId && predictingMap[activeRuntimeId]),
		segments,
		showDuration: Boolean(message.durationSeconds && message.durationSeconds > 0) && !isCurrentlyStreaming,
		streamingTailIndex,
	};
}

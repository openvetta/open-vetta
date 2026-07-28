import { TextBlockView as ThemeTextBlockView } from "@vetta/theme-ui/chat";
import { memo } from "react";
import { useTextBlockModel } from "../../hooks/useTextBlockModel";

interface MarkdownContentProps {
	text: string;
	/** 仅当本 block 是「正在 streaming 消息」的最后一个 text block 时为 true，
	 * 启用分块渐现效果。 */
	isStreamingTail?: boolean;
	className?: string;
}

/**
 * Memo'd markdown renderer. Re-rendering is throttled upstream by rAF
 * delta batching in useSessionManager (~16fps), so we render directly
 * without internal debounce to avoid layout jumps during streaming.
 */
export const MarkdownContent = memo(function MarkdownContent({
	text,
	isStreamingTail = false,
	className,
}: MarkdownContentProps) {
	const model = useTextBlockModel();
	return (
		<ThemeTextBlockView
			text={text}
			isStreamingTail={isStreamingTail}
			className={className}
			{...model}
		/>
	);
});

export const TextBlockView = MarkdownContent;

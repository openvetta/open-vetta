import { useRendererMarkdownModel } from "@shared/hooks/useRendererMarkdownModel";
import type { InlineTokenSupport } from "@vetta-org/theme-ui/markdown";
import { MarkdownContent } from "@vetta-org/theme-ui/markdown";
import { memo } from "react";
import { useRendererMarkdownScope } from "./RendererMarkdownScope";

export interface RendererMarkdownContentProps {
	readonly text: string;
	readonly cwd?: string | null;
	readonly isStreamingTail?: boolean;
	readonly isMessageStreaming?: boolean;
	readonly exportMode?: boolean;
	readonly className?: string;
	readonly inlineTokens?: InlineTokenSupport;
}

/** Renderer adapter for the public props-driven markdown view. */
export const RendererMarkdownContent = memo(function RendererMarkdownContent(
	props: RendererMarkdownContentProps,
): JSX.Element {
	const model = useRendererMarkdownScope();
	if (model && props.cwd === undefined) {
		return (
			<MarkdownContent
				{...model}
				text={props.text}
				isStreamingTail={props.isStreamingTail}
				isMessageStreaming={props.isMessageStreaming}
				labels={props.exportMode ? { copy: model.labels.copy, copied: model.labels.copied } : model.labels}
				className={props.className}
				inlineTokens={props.inlineTokens}
			/>
		);
	}
	return <ConnectedMarkdownContent {...props} />;
});

function ConnectedMarkdownContent({
	text,
	cwd: cwdOverride,
	isStreamingTail = false,
	isMessageStreaming,
	exportMode = false,
	className,
	inlineTokens,
}: RendererMarkdownContentProps): JSX.Element {
	const model = useRendererMarkdownModel(cwdOverride);

	return (
		<MarkdownContent
			{...model}
			text={text}
			isStreamingTail={isStreamingTail}
			isMessageStreaming={isMessageStreaming}
			labels={exportMode ? { copy: model.labels.copy, copied: model.labels.copied } : model.labels}
			className={className}
			inlineTokens={inlineTokens}
		/>
	);
}

import type { ComponentType, ReactNode } from "react";
import { createContext, useContext } from "react";
import type { Components, ExtraProps, Options } from "react-markdown";

export type MarkdownElementProps = ExtraProps & { children?: ReactNode };

export interface HtmlAnswerLabels {
	readonly title: string;
	readonly preview: string;
	readonly source: string;
	readonly expand: string;
	readonly collapse: string;
	readonly waiting: string;
	readonly incomplete: string;
	readonly tooLarge: string;
	readonly safety: string;
	readonly copyFailed: string;
}

export interface MarkdownCodeBlockProps {
	code: string;
	lang: string;
	theme: "light" | "dark";
	labels: { copy: string; copied: string; html?: HtmlAnswerLabels };
	/** 流式尾块：代码仍可能增长时跳过 Shiki，只显示等宽纯文本。 */
	live?: boolean;
	/** Whether the original Markdown fence explicitly closes. */
	closed?: boolean;
	/** The whole text block is still arriving, including its stable fenced sections. */
	streaming?: boolean;
}

/** Definitions are immutable, local to a React subtree, and contain no host state. */
export interface MarkdownDefinition {
	readonly components?: Components;
	/** Custom hast elements emitted by a remark/rehype extension. */
	readonly elements?: Readonly<Record<string, ComponentType<MarkdownElementProps>>>;
	readonly codeBlock?: ComponentType<MarkdownCodeBlockProps>;
	readonly remarkPlugins?: Options["remarkPlugins"];
	readonly rehypePlugins?: Options["rehypePlugins"];
}

export const defaultMarkdown: MarkdownDefinition = Object.freeze({});

/** Renderer keys explicitly replace the base; syntax plugins run in declared order. */
export function extendMarkdown(base: MarkdownDefinition, extension: MarkdownDefinition): MarkdownDefinition {
	return Object.freeze({
		components: Object.freeze({ ...base.components, ...extension.components }),
		elements: Object.freeze({ ...base.elements, ...extension.elements }),
		codeBlock: extension.codeBlock ?? base.codeBlock,
		remarkPlugins: [...(base.remarkPlugins ?? []), ...(extension.remarkPlugins ?? [])],
		rehypePlugins: [...(base.rehypePlugins ?? []), ...(extension.rehypePlugins ?? [])],
	});
}

const MarkdownContext = createContext(defaultMarkdown);

/** Use extendMarkdown explicitly when inheriting a parent definition. */
export function MarkdownProvider({ definition, children }: { definition: MarkdownDefinition; children: ReactNode }) {
	return <MarkdownContext.Provider value={definition}>{children}</MarkdownContext.Provider>;
}

export function useMarkdownDefinition(): MarkdownDefinition {
	return useContext(MarkdownContext);
}

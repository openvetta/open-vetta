import { memo, useMemo } from "react";
import { useAtomValue } from "jotai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { resolvedThemeAtom } from "@shared/store/atoms";
import { SyntaxHighlightedCode } from "@shared/components/SyntaxHighlightedCode";

const remarkPlugins = [remarkGfm];

interface TextBlockProps {
	text: string;
}

/**
 * Memo'd markdown renderer. Re-rendering is throttled upstream by rAF
 * delta batching in useSessionManager (~16fps), so we render directly
 * without internal debounce to avoid layout jumps during streaming.
 */
export const TextBlockView = memo(function TextBlockView({ text }: TextBlockProps) {
	const theme = useAtomValue(resolvedThemeAtom);

	const components = useMemo<Components>(() => ({
		// Headings
		h1: ({ children }) => (
			<h1 className="mb-3 mt-4 text-[18px] font-bold leading-tight text-foreground">{children}</h1>
		),
		h2: ({ children }) => (
			<h2 className="mb-2 mt-3.5 text-[16px] font-bold leading-tight text-foreground">{children}</h2>
		),
		h3: ({ children }) => (
			<h3 className="mb-2 mt-3 text-[14px] font-semibold leading-tight text-foreground">{children}</h3>
		),
		h4: ({ children }) => (
			<h4 className="mb-1.5 mt-2.5 text-[13px] font-semibold text-foreground">{children}</h4>
		),

		// Paragraphs
		p: ({ children }) => (
			<p className="my-1.5 text-[13px] leading-[1.6] text-foreground">{children}</p>
		),

		// Lists
		ul: ({ children }) => (
			<ul className="md-bullet-list my-1.5 ml-4 space-y-0.5 text-[13px] leading-[1.6] text-foreground">{children}</ul>
		),
		ol: ({ children }) => (
			<ol className="my-1.5 ml-4 list-decimal space-y-0.5 text-[13px] leading-[1.6] text-foreground marker:text-primary">{children}</ol>
		),
		li: ({ children }) => <li className="pl-0.5">{children}</li>,

		// Code
		code: ({ className, children }) => {
			const isBlock = className?.startsWith("language-");
			if (isBlock) {
				const lang = className?.replace("language-", "") ?? "";
				const code = String(children).replace(/\n$/, "");
				return (
					<div className="my-2 overflow-hidden rounded-lg border border-border bg-muted">
						{lang && (
							<div className="border-b border-border px-3 py-1 text-[10px] font-medium text-muted-foreground/50">
								{lang}
							</div>
						)}
						<SyntaxHighlightedCode code={code} lang={lang} theme={theme} />
					</div>
				);
			}
			return (
				<code className="rounded bg-muted px-1 py-0.5 text-[12px] text-foreground">
					{children}
				</code>
			);
		},
		pre: ({ children }) => <>{children}</>,

		// Blockquote
		blockquote: ({ children }) => (
			<blockquote className="my-2 border-l-2 border-primary/10 pl-3 text-[13px] italic text-muted-foreground">
				{children}
			</blockquote>
		),

		// Table
		table: ({ children }) => (
			<div className="my-2 overflow-x-auto rounded-lg border border-border">
				<table className="w-full text-[12px]">{children}</table>
			</div>
		),
		thead: ({ children }) => (
			<thead className="border-b border-primary/30 bg-primary/15">{children}</thead>
		),
		th: ({ children }) => (
			<th className="px-3 py-1.5 text-left font-semibold text-primary">{children}</th>
		),
		td: ({ children }) => (
			<td className="border-t border-border px-3 py-1.5 text-foreground">{children}</td>
		),

		// Horizontal rule
		hr: () => <hr className="my-3 border-border" />,

		// Links
		a: ({ href, children }) => (
			<a href={href} className="text-chart-2 underline decoration-chart-2/30 hover:decoration-chart-2" target="_blank" rel="noopener noreferrer">
				{children}
			</a>
		),

		// Strong / em
		strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
		em: ({ children }) => <em className="italic">{children}</em>,
	}), [theme]);

	return (
		<div className="markdown-body break-words">
			<ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
				{text}
			</ReactMarkdown>
		</div>
	);
});

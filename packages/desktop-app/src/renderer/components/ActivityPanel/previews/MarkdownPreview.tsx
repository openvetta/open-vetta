import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

const components: Components = {
	h1: ({ children }) => (
		<h1 className="mb-3 mt-4 text-[18px] font-bold leading-tight text-[var(--text-1)]">{children}</h1>
	),
	h2: ({ children }) => (
		<h2 className="mb-2 mt-3.5 text-[16px] font-bold leading-tight text-[var(--text-1)]">{children}</h2>
	),
	h3: ({ children }) => (
		<h3 className="mb-2 mt-3 text-[14px] font-semibold leading-tight text-[var(--text-1)]">{children}</h3>
	),
	h4: ({ children }) => (
		<h4 className="mb-1.5 mt-2.5 text-[13px] font-semibold text-[var(--text-1)]">{children}</h4>
	),
	p: ({ children }) => (
		<p className="my-1.5 text-[13px] leading-[1.6] text-[var(--text-1)]">{children}</p>
	),
	ul: ({ children }) => (
		<ul className="my-1.5 ml-4 list-disc space-y-0.5 text-[13px] leading-[1.6] text-[var(--text-1)]">
			{children}
		</ul>
	),
	ol: ({ children }) => (
		<ol className="my-1.5 ml-4 list-decimal space-y-0.5 text-[13px] leading-[1.6] text-[var(--text-1)]">
			{children}
		</ol>
	),
	li: ({ children }) => <li className="pl-0.5">{children}</li>,
	code: ({ className, children }) => {
		const isBlock = className?.startsWith("language-");
		if (isBlock) {
			const lang = className?.replace("language-", "") ?? "";
			return (
				<div className="my-2 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--code-bg)]">
					{lang && (
						<div className="border-b border-[var(--border)] px-3 py-1 text-[10px] font-medium text-[var(--text-3)]">
							{lang}
						</div>
					)}
					<pre className="overflow-x-auto p-3">
						<code className="text-[12px] leading-[1.6] text-[var(--code-text)]">{children}</code>
					</pre>
				</div>
			);
		}
		return (
			<code className="rounded bg-[var(--code-inline-bg)] px-1 py-0.5 text-[12px] text-[var(--code-text)]">
				{children}
			</code>
		);
	},
	pre: ({ children }) => <>{children}</>,
	blockquote: ({ children }) => (
		<blockquote className="my-2 border-l-2 border-[var(--accent-dim)] pl-3 text-[13px] italic text-[var(--text-2)]">
			{children}
		</blockquote>
	),
	table: ({ children }) => (
		<div className="my-2 overflow-x-auto rounded-lg border border-[var(--border)]">
			<table className="w-full text-[12px]">{children}</table>
		</div>
	),
	thead: ({ children }) => (
		<thead className="border-b border-[var(--border)] bg-[var(--surface)]">{children}</thead>
	),
	th: ({ children }) => (
		<th className="px-3 py-1.5 text-left font-semibold text-[var(--text-2)]">{children}</th>
	),
	td: ({ children }) => (
		<td className="border-t border-[var(--border)] px-3 py-1.5 text-[var(--text-1)]">{children}</td>
	),
	hr: () => <hr className="my-3 border-[var(--border)]" />,
	a: ({ href, children }) => (
		<a
			href={href}
			className="text-[var(--md-link)] underline decoration-[var(--md-link)]/30 hover:decoration-[var(--md-link)]"
			target="_blank"
			rel="noopener noreferrer"
		>
			{children}
		</a>
	),
	strong: ({ children }) => <strong className="font-semibold text-[var(--text-1)]">{children}</strong>,
	em: ({ children }) => <em className="italic">{children}</em>,
};

interface MarkdownPreviewProps {
	content: string;
}

export function MarkdownPreview({ content }: MarkdownPreviewProps): JSX.Element {
	return (
		<div className="markdown-body break-words p-4">
			<ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
				{content}
			</ReactMarkdown>
		</div>
	);
}

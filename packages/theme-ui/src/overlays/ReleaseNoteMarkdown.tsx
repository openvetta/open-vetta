import type { JSX } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/** 更新日志的排版：标题、列表、行内代码要有层次和间距，不依赖宿主的 markdown 样式。 */
const releaseNoteComponents: Components = {
	h1: ({ children }) => <h1 className="mb-2 text-[14px] font-semibold text-foreground">{children}</h1>,
	h2: ({ children }) => (
		<h2 className="mb-1.5 mt-4 text-[13px] font-semibold text-foreground first:mt-0">{children}</h2>
	),
	h3: ({ children }) => <h3 className="mb-1 mt-3 text-[12.5px] font-semibold text-foreground">{children}</h3>,
	p: ({ children }) => <p className="my-1.5">{children}</p>,
	ul: ({ children }) => <ul className="my-1.5 list-disc space-y-1.5 pl-5">{children}</ul>,
	ol: ({ children }) => <ol className="my-1.5 list-decimal space-y-1.5 pl-5">{children}</ol>,
	li: ({ children }) => <li className="pl-0.5">{children}</li>,
	strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
	code: ({ children }) => (
		<code className="rounded bg-muted px-1 py-0.5 font-mono text-[11.5px] text-foreground">{children}</code>
	),
};

/** 更新日志的 Markdown 渲染：设置页预览与更新弹窗共用。 */
export function ReleaseNoteMarkdown({ children }: { readonly children: string }): JSX.Element {
	return (
		<ReactMarkdown remarkPlugins={[remarkGfm]} components={releaseNoteComponents}>
			{children}
		</ReactMarkdown>
	);
}

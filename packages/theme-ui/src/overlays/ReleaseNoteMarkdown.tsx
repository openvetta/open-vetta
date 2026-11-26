import type { JSX } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const EXTERNAL_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

function isExternalLink(href: string | undefined): href is string {
	if (!href) return false;
	try {
		return EXTERNAL_LINK_PROTOCOLS.has(new URL(href).protocol);
	} catch {
		return false;
	}
}

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
	// 普通 <a href> 会把整个主窗口导航到该网页且无法返回。外链改走 target=_blank，
	// 由主进程的 window-open handler 交给系统浏览器；其余（相对路径、锚点）只显示文字。
	a: ({ href, children }) =>
		isExternalLink(href) ? (
			<a
				href={href}
				target="_blank"
				rel="noopener noreferrer"
				className="text-primary underline decoration-primary/30 hover:decoration-primary"
			>
				{children}
			</a>
		) : (
			<span>{children}</span>
		),
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

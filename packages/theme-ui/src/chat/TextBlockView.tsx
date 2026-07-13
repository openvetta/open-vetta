import { memo, useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlockCopyButtonView } from "../shared/CodeBlockCopyButton";
import { SyntaxHighlightedCode } from "../shared/SyntaxHighlightedCode";

/** Minimal hast-like nodes for the streaming chunk rehype plugin. */
interface HastText {
	type: "text";
	value: string;
}
interface HastElement {
	type: "element";
	tagName: string;
	properties?: Record<string, unknown>;
	children: Array<HastText | HastElement>;
}
interface HastRoot {
	type: "root";
	children: Array<HastText | HastElement>;
}

/** 文件 / 链接 badge 的公共样式：半透明主题色底 + 主题色描边与文字。 */
const LINK_BADGE_CLASS =
	"inline-flex max-w-full items-center gap-1 rounded-md border border-primary/25 bg-primary/10 px-1.5 py-px align-middle text-[12px] font-medium text-primary no-underline transition-colors hover:bg-primary/20";

const remarkPlugins = [remarkGfm];

function resolveFileLinkPath(href: string | undefined): string | null {
	if (!href) return null;
	const decode = (raw: string): string => {
		try {
			return decodeURIComponent(raw);
		} catch {
			return raw;
		}
	};
	if (href.startsWith("file://")) {
		return decode(href.replace(/^file:\/\//, ""));
	}
	if (href.startsWith("/")) return decode(href);
	return null;
}

const STREAMING_CHUNK_SIZE = 10;

function rehypeStreamingChunks() {
	return (tree: HastRoot): void => {
		function visit(node: HastRoot | HastElement, inCode: boolean): void {
			const newChildren: Array<(typeof node.children)[number]> = [];
			for (const child of node.children) {
				if (child.type === "text" && !inCode) {
					const value = (child as HastText).value;
					for (let index = 0; index < value.length; ) {
						const spaceMatch = /^\s+/.exec(value.slice(index));
						if (spaceMatch) {
							newChildren.push({ type: "text", value: spaceMatch[0] } as HastText);
							index += spaceMatch[0].length;
							continue;
						}

						const end = getSliceEnd(value, index, STREAMING_CHUNK_SIZE);
						newChildren.push({
							type: "element",
							tagName: "span",
							properties: { className: ["streaming-chunk"] },
							children: [{ type: "text", value: value.slice(index, end) } as HastText],
						});
						index = end;
					}
				} else {
					newChildren.push(child);
					if (child.type === "element") {
						const tag = child.tagName;
						visit(child, inCode || tag === "code" || tag === "pre");
					}
				}
			}
			node.children = newChildren as typeof node.children;
		}

		visit(tree, false);
	};
}

const streamingRehypePlugins = [rehypeStreamingChunks];
const STREAM_REVEAL_INTERVAL_MS = 500;

function getSliceEnd(text: string, start: number, count: number): number {
	let end = Math.min(text.length, start + count);
	if (end < text.length) {
		const previous = text.charCodeAt(end - 1);
		const next = text.charCodeAt(end);
		if (previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) {
			end++;
		}
	}
	return end;
}

interface StreamingDisplayState {
	displayText: string;
	animateChunks: boolean;
}

function useStreamingDisplayText(text: string, active: boolean): StreamingDisplayState {
	const [displayText, setDisplayText] = useState(() => (active ? "" : text));
	const [animateChunks, setAnimateChunks] = useState(active);
	const displayRef = useRef(active ? "" : text);
	const targetRef = useRef(text);
	const rafRef = useRef<number | null>(null);
	const revealTimerRef = useRef<number | null>(null);
	const lastRevealRef = useRef<number | null>(null);
	const settleTimerRef = useRef<number | null>(null);
	const wasActiveRef = useRef(active);

	useEffect(() => {
		targetRef.current = text;

		function clearSettleTimer(): void {
			if (settleTimerRef.current !== null) {
				window.clearTimeout(settleTimerRef.current);
				settleTimerRef.current = null;
			}
		}

		function clearRevealTimer(): void {
			if (revealTimerRef.current !== null) {
				window.clearTimeout(revealTimerRef.current);
				revealTimerRef.current = null;
			}
		}

		function scheduleSettle(): void {
			clearSettleTimer();
			settleTimerRef.current = window.setTimeout(() => {
				setAnimateChunks(false);
				settleTimerRef.current = null;
			}, STREAM_REVEAL_INTERVAL_MS);
		}

		function scheduleReveal(delayMs: number): void {
			if (delayMs <= 0) {
				if (rafRef.current === null) {
					rafRef.current = requestAnimationFrame(tick);
				}
				return;
			}
			if (revealTimerRef.current !== null) return;
			revealTimerRef.current = window.setTimeout(() => {
				revealTimerRef.current = null;
				if (rafRef.current === null) {
					rafRef.current = requestAnimationFrame(tick);
				}
			}, delayMs);
		}

		if (!text.startsWith(displayRef.current)) {
			if (rafRef.current !== null) {
				cancelAnimationFrame(rafRef.current);
				rafRef.current = null;
			}
			clearRevealTimer();
			clearSettleTimer();
			setDisplayText(text);
			setAnimateChunks(false);
			displayRef.current = text;
			lastRevealRef.current = null;
			wasActiveRef.current = active;
			return;
		}

		function tick(timestamp: number): void {
			rafRef.current = null;
			const target = targetRef.current;
			const current = displayRef.current;
			const backlog = target.length - current.length;

			if (backlog <= 0) {
				lastRevealRef.current = timestamp;
				return;
			}

			const previousReveal = lastRevealRef.current;
			if (previousReveal !== null && timestamp - previousReveal < STREAM_REVEAL_INTERVAL_MS) {
				scheduleReveal(STREAM_REVEAL_INTERVAL_MS - (timestamp - previousReveal));
				return;
			}
			lastRevealRef.current = timestamp;

			const next = target;
			displayRef.current = next;
			setAnimateChunks(true);
			setDisplayText(next);

			if (!active) {
				scheduleSettle();
			}
		}

		if (active && !wasActiveRef.current && displayRef.current.length >= text.length) {
			clearSettleTimer();
			displayRef.current = "";
			setDisplayText("");
			lastRevealRef.current = null;
		}
		wasActiveRef.current = active;
		if (active) {
			clearRevealTimer();
			clearSettleTimer();
			setAnimateChunks(true);
		} else if (displayRef.current.length < text.length) {
			setAnimateChunks(true);
		} else {
			scheduleSettle();
		}

		if (rafRef.current === null && displayRef.current.length < text.length) {
			const previousReveal = lastRevealRef.current;
			const delayMs =
				previousReveal === null
					? 0
					: Math.max(0, STREAM_REVEAL_INTERVAL_MS - (performance.now() - previousReveal));
			scheduleReveal(delayMs);
		}

		return () => {
			if (rafRef.current !== null) {
				cancelAnimationFrame(rafRef.current);
				rafRef.current = null;
			}
			clearRevealTimer();
			clearSettleTimer();
		};
	}, [text, active]);

	return { displayText, animateChunks };
}

function cn(...parts: Array<string | false | null | undefined>): string {
	return parts.filter(Boolean).join(" ");
}

export interface TextBlockViewLabels {
	copy: string;
	copied: string;
}

export interface TextBlockViewProps {
	text: string;
	isStreamingTail?: boolean;
	className?: string;
	theme: "light" | "dark";
	labels: TextBlockViewLabels;
	getFileIconClass: (fileName: string) => string;
	onOpenFile: (path: string) => void;
	onOpenUrl: (url: string) => void;
}

function CodeBlockShell({
	lang,
	code,
	theme,
	labels,
}: {
	lang: string;
	code: string;
	theme: "light" | "dark";
	labels: TextBlockViewLabels;
}): JSX.Element {
	const [copied, setCopied] = useState(false);
	const timerRef = useRef<number | null>(null);

	useEffect(() => {
		return () => {
			if (timerRef.current !== null) window.clearTimeout(timerRef.current);
		};
	}, []);

	const onCopy = useCallback(() => {
		void navigator.clipboard.writeText(code).then(() => {
			setCopied(true);
			if (timerRef.current !== null) window.clearTimeout(timerRef.current);
			timerRef.current = window.setTimeout(() => setCopied(false), 1500);
		});
	}, [code]);

	return (
		<CodeBlockCopyButtonView copied={copied} onCopy={onCopy} labels={labels}>
			<div className="my-2 overflow-hidden rounded-lg border border-border bg-muted">
				{lang && (
					<div className="border-b border-border px-3 py-1 text-[10px] font-medium text-muted-foreground/50">
						{lang}
					</div>
				)}
				<SyntaxHighlightedCode code={code} lang={lang} theme={theme} />
			</div>
		</CodeBlockCopyButtonView>
	);
}

/**
 * Memo'd markdown renderer for chat text blocks. Host injects file/url handlers and theme.
 *
 * `components` 映射的函数引用必须在 streaming 期间保持稳定：React 把 components.p 等
 * 当成元素类型；引用一变就会整树 remount，`.streaming-chunk` 的 CSS 入场动画对已有
 * 文本整段重播，表现为 text block 高频闪烁。labels / 回调通过 ref 读取，不进 deps。
 */
export const TextBlockView = memo(function TextBlockView({
	text,
	isStreamingTail = false,
	className,
	theme,
	labels,
	getFileIconClass,
	onOpenFile,
	onOpenUrl,
}: TextBlockViewProps): JSX.Element {
	const { displayText, animateChunks } = useStreamingDisplayText(text, isStreamingTail);

	const labelsRef = useRef(labels);
	const getFileIconClassRef = useRef(getFileIconClass);
	const onOpenFileRef = useRef(onOpenFile);
	const onOpenUrlRef = useRef(onOpenUrl);
	labelsRef.current = labels;
	getFileIconClassRef.current = getFileIconClass;
	onOpenFileRef.current = onOpenFile;
	onOpenUrlRef.current = onOpenUrl;

	const components = useMemo<Components>(
		() => ({
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
			p: ({ children }) => <p className="my-1.5 text-[13px] leading-[1.6] text-foreground">{children}</p>,
			ul: ({ children }) => (
				<ul className="md-bullet-list my-1.5 ml-4 space-y-0.5 text-[13px] leading-[1.6] text-foreground">
					{children}
				</ul>
			),
			ol: ({ children }) => (
				<ol className="my-1.5 ml-4 list-decimal space-y-0.5 text-[13px] leading-[1.6] text-foreground marker:text-primary">
					{children}
				</ol>
			),
			li: ({ children }) => <li className="pl-0.5">{children}</li>,
			code: ({ className: codeClassName, children }) => {
				const raw = String(children);
				const isBlock = (codeClassName?.startsWith("language-") ?? false) || raw.includes("\n");
				if (isBlock) {
					const lang = codeClassName?.replace("language-", "") ?? "";
					const code = raw.replace(/\n$/, "");
					return (
						<CodeBlockShell lang={lang} code={code} theme={theme} labels={labelsRef.current} />
					);
				}
				return <code className="rounded bg-muted px-1 py-0.5 text-[12px] text-foreground">{children}</code>;
			},
			pre: ({ children }) => <>{children}</>,
			blockquote: ({ children }) => (
				<blockquote className="my-2 border-l-2 border-primary/10 pl-3 text-[13px] italic text-muted-foreground">
					{children}
				</blockquote>
			),
			table: ({ children }) => (
				<div className="my-2 overflow-x-auto rounded-lg border border-border">
					<table className="w-full text-[12px]">{children}</table>
				</div>
			),
			thead: ({ children }) => <thead className="border-b border-border bg-muted">{children}</thead>,
			th: ({ children }) => (
				<th className="px-3 py-1.5 text-left font-semibold text-muted-foreground">{children}</th>
			),
			td: ({ children }) => <td className="border-t border-border px-3 py-1.5 text-foreground">{children}</td>,
			hr: () => <hr className="my-3 border-border" />,
			a: ({ href, children }) => {
				const filePath = resolveFileLinkPath(href);
				if (filePath) {
					const fileName = filePath.split("/").pop() || filePath;
					return (
						<button
							type="button"
							title={filePath}
							className={cn(LINK_BADGE_CLASS, "cursor-pointer")}
							onClick={() => onOpenFileRef.current(filePath)}
						>
							<span
								className={cn(getFileIconClassRef.current(fileName), "h-3.5 w-3.5 shrink-0")}
							/>
							<span className="truncate">{children}</span>
						</button>
					);
				}
				if (href && /^https?:\/\//i.test(href)) {
					return (
						<a
							href={href}
							title={href}
							className={LINK_BADGE_CLASS}
							onClick={(e) => {
								e.preventDefault();
								onOpenUrlRef.current(href);
							}}
						>
							<span className="icon-[mdi--web] h-3.5 w-3.5 shrink-0" />
							<span className="truncate">{children}</span>
						</a>
					);
				}
				return (
					<a
						href={href}
						className="text-chart-2 underline decoration-chart-2/30 hover:decoration-chart-2"
						target="_blank"
						rel="noopener noreferrer"
					>
						{children}
					</a>
				);
			},
			strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
			em: ({ children }) => <em className="italic">{children}</em>,
		}),
		// theme 进 deps：代码块高亮主题变化时需要换组件树。其余 host 注入值走 ref。
		[theme],
	);

	return (
		<div className={cn("markdown-body break-words", animateChunks && "markdown-streaming-tail", className)}>
			<ReactMarkdown
				remarkPlugins={remarkPlugins}
				rehypePlugins={animateChunks ? streamingRehypePlugins : undefined}
				components={components}
			>
				{displayText}
			</ReactMarkdown>
		</div>
	);
});

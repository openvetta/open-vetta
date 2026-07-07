import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import type { Element as HastElement, ElementContent, Root as HastRoot, Text as HastText } from "hast";
import {
	activeSessionAtom,
	activityPanelOpenAtom,
	activityPanelTabByProjectAtom,
	openUrlInBrowserAtom,
	filePreviewAtom,
	openInlineFilePreviewAtom,
	resolvedThemeAtom,
} from "@shared/store/atoms";
import { SyntaxHighlightedCode } from "@shared/components/SyntaxHighlightedCode";
import { CodeBlockCopyButton } from "@shared/components/CodeBlockCopyButton";
import { cn } from "@shared/lib/utils";
import { useNarrowScreen } from "@shared/hooks/useNarrowScreen";
import { getFileIcon } from "../../../file-explorer/components/fileIcons";

/** 文件 / 链接 badge 的公共样式：半透明主题色底 + 主题色描边与文字。 */
const LINK_BADGE_CLASS =
	"inline-flex max-w-full items-center gap-1 rounded-md border border-primary/25 bg-primary/10 px-1.5 py-px align-middle text-[12px] font-medium text-primary no-underline transition-colors hover:bg-primary/20";

const remarkPlugins = [remarkGfm];

/**
 * 判断 markdown 链接是否指向本地文件（agent 以绝对路径或 file:// 形式输出）。
 * 命中则返回解析后的绝对路径，用于触发应用内文件预览；否则返回 null（按外链处理）。
 */
function resolveFileLinkPath(href: string | undefined): string | null {
	if (!href) return null;
	// react-markdown 会对链接目标做 percent-encoding（含中文/空格），统一解码还原真实路径。
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
	// 绝对 POSIX 路径（agent 提示词要求文件引用使用绝对路径）
	if (href.startsWith("/")) return decode(href);
	return null;
}

/** 判断绝对路径 target 是否落在目录 dir 内（含 dir 本身）。 */
function isPathWithinDir(dir: string, target: string): boolean {
	const stripTrailing = (p: string): string => p.replace(/\/+$/, "");
	const d = stripTrailing(dir);
	return target === d || target.startsWith(`${d}/`);
}

const STREAMING_CHUNK_SIZE = 10;

/**
 * rehype 插件：把渲染后的纯文本节点（不在 code/pre 内）切成稳定的 .streaming-chunk span。
 * CSS 给每个新 chunk 挂 mount-time fade-in 动画；旧 chunk 靠 React reconciliation
 * 复用 DOM、动画自然停在终态，新追加的 chunk 在出现位置就地淡入。
 */
function rehypeStreamingChunks() {
	return (tree: HastRoot): void => {
		function visit(node: HastRoot | HastElement, inCode: boolean): void {
			const newChildren: Array<(typeof node.children)[number]> = [];
			for (const child of node.children) {
				if (child.type === "text" && !inCode) {
					const value = (child as HastText).value;
					for (let index = 0; index < value.length;) {
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
			const delayMs = previousReveal === null
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
export const MarkdownContent = memo(function MarkdownContent({ text, isStreamingTail = false, className }: MarkdownContentProps) {
	const theme = useAtomValue(resolvedThemeAtom);
	const activeSession = useAtomValue(activeSessionAtom);
	const setFilePreview = useSetAtom(filePreviewAtom);
	const openInlineFilePreview = useSetAtom(openInlineFilePreviewAtom);
	const setActivityPanelOpen = useSetAtom(activityPanelOpenAtom);
	const setActivityTabByProject = useSetAtom(activityPanelTabByProjectAtom);
	const openUrlInBrowser = useSetAtom(openUrlInBrowserAtom);
	const narrow = useNarrowScreen();
	const { displayText, animateChunks } = useStreamingDisplayText(text, isStreamingTail);

	const cwd = activeSession?.cwd ?? null;
	const openFilePreview = useCallback((path: string) => {
		const name = path.split("/").pop() || path;
		// 窄屏：活动面板是底部 sheet，内嵌分屏会把内容挤窄，统一走全局预览 Dialog。
		// 宽屏：属于当前项目的文件在活动面板的文件面板内联预览；项目外文件弹全局 Dialog。
		if (!narrow && cwd && isPathWithinDir(cwd, path)) {
			setActivityPanelOpen(true);
			setActivityTabByProject((prev) => new Map(prev).set(cwd, "file"));
			openInlineFilePreview({ name, path });
			return;
		}
		setFilePreview({ name, path });
	}, [narrow, cwd, setFilePreview, openInlineFilePreview, setActivityPanelOpen, setActivityTabByProject]);

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
			const raw = String(children);
			const isBlock = (className?.startsWith("language-") ?? false) || raw.includes("\n");
			if (isBlock) {
				const lang = className?.replace("language-", "") ?? "";
				const code = raw.replace(/\n$/, "");
				return (
					<CodeBlockCopyButton language={lang} code={code}>
						<div className="my-2 overflow-hidden rounded-lg border border-border bg-muted">
							{lang && (
								<div className="border-b border-border px-3 py-1 text-[10px] font-medium text-muted-foreground/50">
									{lang}
								</div>
							)}
							<SyntaxHighlightedCode code={code} lang={lang} theme={theme} />
						</div>
					</CodeBlockCopyButton>
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
			<thead className="border-b border-border bg-muted">{children}</thead>
		),
		th: ({ children }) => (
			<th className="px-3 py-1.5 text-left font-semibold text-muted-foreground">{children}</th>
		),
		td: ({ children }) => (
			<td className="border-t border-border px-3 py-1.5 text-foreground">{children}</td>
		),

		// Horizontal rule
		hr: () => <hr className="my-3 border-border" />,

		// Links — 文件链接渲染成带文件类型图标的 badge（点击应用内预览），
		// 网页链接渲染成带地球图标的 badge（新标签打开），普通锚点等保持原样。
		a: ({ href, children }) => {
			const filePath = resolveFileLinkPath(href);
			if (filePath) {
				const fileName = filePath.split("/").pop() || filePath;
				return (
					<button
						type="button"
						title={filePath}
						className={cn(LINK_BADGE_CLASS, "cursor-pointer")}
						onClick={() => openFilePreview(filePath)}
					>
						<span className={cn(getFileIcon(fileName, false, false), "h-3.5 w-3.5 shrink-0")} />
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
							openUrlInBrowser(href);
						}}
					>
						<span className="icon-[mdi--web] h-3.5 w-3.5 shrink-0" />
						<span className="truncate">{children}</span>
					</a>
				);
			}
			return (
				<a href={href} className="text-chart-2 underline decoration-chart-2/30 hover:decoration-chart-2" target="_blank" rel="noopener noreferrer">
					{children}
				</a>
			);
		},

		// Strong / em
		strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
		em: ({ children }) => <em className="italic">{children}</em>,
	}), [theme, openFilePreview, openUrlInBrowser]);

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

export const TextBlockView = MarkdownContent;

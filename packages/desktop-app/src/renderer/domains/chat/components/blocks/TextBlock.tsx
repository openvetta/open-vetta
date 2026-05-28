import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useAtomValue } from "jotai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import type { Element as HastElement, ElementContent, Root as HastRoot, Text as HastText } from "hast";
import { resolvedThemeAtom } from "@shared/store/atoms";
import { SyntaxHighlightedCode } from "@shared/components/SyntaxHighlightedCode";

const remarkPlugins = [remarkGfm];

const STREAMING_CHUNK_SIZE = 10;

/**
 * rehype 插件：把渲染后的纯文本节点（不在 code/pre 内）切成稳定的 .streaming-chunk span。
 * CSS 给每个新 chunk 挂 mount-time fade-in 动画；旧 chunk 靠 React reconciliation
 * 复用 DOM、动画自然停在终态，新追加的 chunk 在出现位置就地淡入。
 */
function rehypeStreamingChunks() {
	return (tree: HastRoot): void => {
		function visit(node: HastRoot | HastElement, inCode: boolean): void {
			const newChildren: ElementContent[] = [];
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

		function scheduleSettle(): void {
			clearSettleTimer();
			settleTimerRef.current = window.setTimeout(() => {
				setAnimateChunks(false);
				settleTimerRef.current = null;
			}, STREAM_REVEAL_INTERVAL_MS);
		}

		if (!text.startsWith(displayRef.current)) {
			if (rafRef.current !== null) {
				cancelAnimationFrame(rafRef.current);
				rafRef.current = null;
			}
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
				rafRef.current = requestAnimationFrame(tick);
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
			clearSettleTimer();
			setAnimateChunks(true);
		} else if (displayRef.current.length < text.length) {
			setAnimateChunks(true);
		} else {
			scheduleSettle();
		}

		if (rafRef.current === null && displayRef.current.length < text.length) {
			rafRef.current = requestAnimationFrame(tick);
		}

		return () => {
			if (rafRef.current !== null) {
				cancelAnimationFrame(rafRef.current);
				rafRef.current = null;
			}
			clearSettleTimer();
		};
	}, [text, active]);

	return { displayText, animateChunks };
}

interface TextBlockProps {
	text: string;
	/** 仅当本 block 是「正在 streaming 消息」的最后一个 text block 时为 true，
	 * 启用分块渐现效果。 */
	isStreamingTail?: boolean;
}

/**
 * Memo'd markdown renderer. Re-rendering is throttled upstream by rAF
 * delta batching in useSessionManager (~16fps), so we render directly
 * without internal debounce to avoid layout jumps during streaming.
 */
export const TextBlockView = memo(function TextBlockView({ text, isStreamingTail = false }: TextBlockProps) {
	const theme = useAtomValue(resolvedThemeAtom);
	const { displayText, animateChunks } = useStreamingDisplayText(text, isStreamingTail);

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
		<div className={`markdown-body break-words${animateChunks ? " markdown-streaming-tail" : ""}`}>
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

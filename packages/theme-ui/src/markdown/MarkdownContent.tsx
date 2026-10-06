import type { JSX } from "react";
import { createContext, memo, useContext, useMemo, useRef } from "react";
import type { Components, Options } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
	MarkdownTable,
	MarkdownTableBody,
	MarkdownTableCell,
	MarkdownTableHead,
	MarkdownTableHeaderCell,
	MarkdownTableRow,
} from "../shared/MarkdownTable";
import { SkillTypeIcon } from "../skills/skill-icon";
import { DefaultCodeBlock } from "./CodeBlock";
import type { HtmlAnswerLabels, MarkdownDefinition } from "./definition";
import { useMarkdownDefinition } from "./definition";
import { HtmlAnswerCodeBlock } from "./HtmlAnswerCodeBlock";
import { isClosedHtmlFence, isHtmlPreviewLanguage } from "./html-answer";
import { InlineTokenChip } from "./InlineTokenChip";
import type { InlineTokenSupport } from "./inline-tokens";
import {
	INLINE_TOKEN_TAG,
	projectAnnotationsToNormalizedMarkdown,
	rehypeInlineTokens,
	remarkInlineTokenAnnotations,
} from "./inline-tokens";
import { chatUrlTransform, classifyMarkdownLink, normalizeLocalFileLinksInMarkdown } from "./markdown-link";
import type { HastElement } from "./nodes";
import { splitStableMarkdownBlocks } from "./stable-blocks";
import { rehypeStreamingChunks, useStreamingDisplayText } from "./streaming";

/** 文件 / 链接 badge 的公共样式：半透明主题色底 + 主题色描边与文字。 */
const LINK_BADGE_CLASS =
	"inline-flex max-w-full items-center gap-1 rounded-md border border-primary/25 bg-primary/10 px-1.5 py-px align-middle text-[13px] font-medium text-primary no-underline transition-colors hover:bg-primary/20";

const remarkPlugins = [remarkGfm];

const MarkdownCodeContext = createContext<{
	live: boolean;
	streaming: boolean;
	text: string;
	theme: "light" | "dark";
	labels: MarkdownLabels;
}>({ live: false, streaming: false, text: "", theme: "light", labels: { copy: "", copied: "" } });

function cn(...parts: Array<string | false | null | undefined>): string {
	return parts.filter(Boolean).join(" ");
}

export interface MarkdownLabels {
	copy: string;
	copied: string;
	/** Localized host opt-in to inline HTML answer controls. */
	html?: HtmlAnswerLabels;
	/** 表格工具条：复制成 GFM 表格 / CSV。 */
}

export interface MarkdownContentProps {
	definition?: MarkdownDefinition;
	text: string;
	isStreamingTail?: boolean;
	/** Entire reply lifecycle, separate from which text fragment animates. */
	isMessageStreaming?: boolean;
	className?: string;
	theme: "light" | "dark";
	labels: MarkdownLabels;
	getFileIconClass: (fileName: string) => string;
	onOpenFile: (path: string) => void;
	onOpenUrl: (url: string) => void;
	/** 传入即启用行内 token 渲染；仅用户消息需要，助手 markdown 不受影响。 */
	inlineTokens?: InlineTokenSupport;
}

/** 绝对路径形式的链接文字（POSIX、Windows 盘符、UNC、~/）。相对路径保留原样，用于同名文件的区分。 */
const ABSOLUTE_PATH_LABEL = /^(?:\/|[A-Za-z]:[\\/]|\\\\|~\/)/;

function basename(path: string): string {
	const normalized = path.replace(/[\\/]+$/, "");
	const idx = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
	return idx === -1 ? normalized : normalized.slice(idx + 1);
}

interface MarkdownDocumentProps {
	animateChunks: boolean;
	components: Components;
	definition: MarkdownDefinition;
	inlineTokens?: InlineTokenSupport;
	live: boolean;
	streaming: boolean;
	theme: "light" | "dark";
	labels: MarkdownLabels;
	text: string;
}

/**
 * 一块已经冻结或仍在增长的 markdown。独立 memo：流式时只有 tail 的 `text` 变，
 * 已提交块不会跟着整篇重跑 remark；流式结束后分块结构保持不变，已提交块不会重挂。
 */
const MarkdownDocument = memo(function MarkdownDocument({
	animateChunks,
	components,
	definition,
	inlineTokens,
	live,
	streaming,
	theme,
	labels,
	text,
}: MarkdownDocumentProps): JSX.Element {
	const hasStructuredAnnotations = inlineTokens?.annotations !== undefined;
	const rehypePlugins = useMemo(() => {
		const plugins: NonNullable<Options["rehypePlugins"]> = [...(definition.rehypePlugins ?? [])];
		if (animateChunks) plugins.push(rehypeStreamingChunks);
		if (inlineTokens && !hasStructuredAnnotations) plugins.push(() => rehypeInlineTokens(inlineTokens.parse));
		return plugins.length > 0 ? plugins : undefined;
	}, [animateChunks, hasStructuredAnnotations, inlineTokens, definition]);
	const markdownSource = useMemo(() => normalizeLocalFileLinksInMarkdown(text), [text]);
	const normalizedAnnotations = useMemo(
		() =>
			inlineTokens?.annotations
				? projectAnnotationsToNormalizedMarkdown(text, markdownSource, inlineTokens.annotations)
				: undefined,
		[text, inlineTokens?.annotations, markdownSource],
	);
	const activeRemarkPlugins = useMemo(
		() =>
			normalizedAnnotations?.length
				? [...remarkPlugins, ...(definition.remarkPlugins ?? []), () => remarkInlineTokenAnnotations(normalizedAnnotations)]
				: [...remarkPlugins, ...(definition.remarkPlugins ?? [])],
		[normalizedAnnotations, definition],
	);
	const resolvedComponents = useMemo(
		() => ({ ...components, ...definition.components, ...definition.elements }),
		[components, definition],
	);
	const codeContext = useMemo(
		() => ({ live, streaming, text: markdownSource, theme, labels }),
		[live, streaming, markdownSource, theme, labels],
	);
	return (
		<MarkdownCodeContext.Provider value={codeContext}>
			<ReactMarkdown
				remarkPlugins={activeRemarkPlugins}
				rehypePlugins={rehypePlugins}
				components={resolvedComponents}
				urlTransform={chatUrlTransform}
			>
				{markdownSource}
			</ReactMarkdown>
		</MarkdownCodeContext.Provider>
	);
});

/**
 * Memo'd markdown renderer for chat text blocks. Host injects file/url handlers and theme.
 *
 * `components` 映射的函数引用必须在 streaming 期间保持稳定：React 把 components.p 等
 * 当成元素类型；引用一变就会整树 remount，流式短语的 DOM 身份与代码块状态都会重置，
 * 表现为 text block 高频闪烁。theme / labels 由文档 Context 更新，宿主回调通过 ref 读取。
 */
export const MarkdownContent = memo(function MarkdownContent({
	text,
	isStreamingTail = false,
	isMessageStreaming = isStreamingTail,
	className,
	theme,
	labels,
	getFileIconClass,
	onOpenFile,
	onOpenUrl,
	inlineTokens,
	definition: definitionOverride,
}: MarkdownContentProps): JSX.Element {
	const inheritedDefinition = useMarkdownDefinition();
	const definition = definitionOverride ?? inheritedDefinition;
	const definitionRef = useRef(definition);
	definitionRef.current = definition;
	// displayText 按到达速率追赶宿主快照；流结束时 hook 会立即 flush 剩余内容。
	const { displayText, animateChunks } = useStreamingDisplayText(text, isStreamingTail);

	const getFileIconClassRef = useRef(getFileIconClass);
	const onOpenFileRef = useRef(onOpenFile);
	const onOpenUrlRef = useRef(onOpenUrl);
	const inlineTokensRef = useRef(inlineTokens);
	getFileIconClassRef.current = getFileIconClass;
	onOpenFileRef.current = onOpenFile;
	onOpenUrlRef.current = onOpenUrl;
	inlineTokensRef.current = inlineTokens;

	const components = useMemo<Components>(
		() => ({
			h1: ({ children }) => <h1 className="mb-3 mt-4 text-[20px] font-bold leading-tight text-foreground">{children}</h1>,
			h2: ({ children }) => (
				<h2 className="mb-2 mt-3.5 text-[17px] font-bold leading-tight text-foreground">{children}</h2>
			),
			h3: ({ children }) => (
				<h3 className="mb-2 mt-3 text-[15px] font-semibold leading-tight text-foreground">{children}</h3>
			),
			h4: ({ children }) => <h4 className="mb-1.5 mt-2.5 text-[14px] font-semibold text-foreground">{children}</h4>,
			p: ({ children }) => <p className="my-1.5 text-[14px] leading-[1.6] text-foreground">{children}</p>,
			ul: ({ children }) => (
				<ul className="md-bullet-list my-1.5 text-[14px] leading-[1.6] text-foreground">{children}</ul>
			),
			ol: ({ children }) => (
				<ol className="my-1.5 ml-4 list-decimal space-y-0.5 text-[14px] leading-[1.6] text-foreground marker:text-primary">
					{children}
				</ol>
			),
			li: ({ children }) => <li>{children}</li>,
			code: function MarkdownCode({ className: codeClassName, children, node }) {
				const context = useContext(MarkdownCodeContext);
				const raw = String(children ?? "");
				const isBlock = (codeClassName?.startsWith("language-") ?? false) || raw.includes("\n");
				if (isBlock) {
					const lang = codeClassName?.replace("language-", "") ?? "";
					const code = raw.replace(/\n$/, "");
					const CodeBlock =
						definitionRef.current.codeBlock ??
						(context.labels.html && isHtmlPreviewLanguage(lang) ? HtmlAnswerCodeBlock : DefaultCodeBlock);
					return (
						<CodeBlock
							lang={lang}
							code={code}
							theme={context.theme}
							labels={context.labels}
							live={context.live}
							streaming={context.streaming}
							closed={isHtmlPreviewLanguage(lang) && isClosedHtmlFence(context.text, node?.position, code)}
						/>
					);
				}
				return <code className="rounded bg-muted px-1 py-0.5 text-[13px] text-foreground">{children}</code>;
			},
			pre: ({ children }) => <>{children}</>,
			blockquote: ({ children }) => (
				<blockquote className="my-2 border-l-2 border-primary/10 pl-3 text-[14px] italic text-muted-foreground">
					{children}
				</blockquote>
			),
			table: ({ children }) => <MarkdownTable>{children}</MarkdownTable>,
			thead: ({ children }) => <MarkdownTableHead>{children}</MarkdownTableHead>,
			tbody: ({ children }) => <MarkdownTableBody>{children}</MarkdownTableBody>,
			tr: ({ children }) => <MarkdownTableRow>{children}</MarkdownTableRow>,
			// style 透传：remark-gfm 把 GFM 的列对齐（`|---:|`）写在这里。
			th: ({ children, style }) => <MarkdownTableHeaderCell style={style}>{children}</MarkdownTableHeaderCell>,
			td: ({ children, style }) => <MarkdownTableCell style={style}>{children}</MarkdownTableCell>,
			hr: () => <hr className="my-3 border-border" />,
			a: ({ href, children }) => {
				const kind = classifyMarkdownLink(href);
				if (kind.type === "file") {
					const fileName = basename(kind.path);
					// 模型偶尔把整条绝对路径写成 label，徽标里只留文件名，完整路径仍在 title 里。
					const label =
						typeof children === "string" && ABSOLUTE_PATH_LABEL.test(children.trim()) ? basename(children.trim()) : children;
					return (
						<button
							type="button"
							title={kind.path}
							className={cn(LINK_BADGE_CLASS, "cursor-pointer")}
							onClick={() => onOpenFileRef.current(kind.path)}
						>
							<span className={cn(getFileIconClassRef.current(fileName), "h-3.5 w-3.5 shrink-0")} />
							<span className="truncate">{label}</span>
						</button>
					);
				}
				if (kind.type === "url") {
					return (
						<a
							href={kind.url}
							title={kind.url}
							className={LINK_BADGE_CLASS}
							onClick={(e) => {
								e.preventDefault();
								onOpenUrlRef.current(kind.url);
							}}
						>
							<span className="icon-[mdi--web] h-3.5 w-3.5 shrink-0" />
							<span className="truncate">{children}</span>
						</a>
					);
				}
				// mailto / fragment / unknown: never target=_blank — that opens the OS browser
				// for misclassified local paths. Keep visible but non-navigating.
				return (
					<span className="text-chart-2 underline decoration-chart-2/30" title={kind.href || undefined}>
						{children}
					</span>
				);
			},
			strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
			em: ({ children }) => <em className="italic">{children}</em>,
			// 行内 token：与输入框里的胶囊同款（半透明主题色底 + 描边，align-middle 对齐正文）。
			[INLINE_TOKEN_TAG]: ({ node }: { node?: HastElement }) => {
				const properties = node?.properties ?? {};
				const kind = String(properties["data-token-kind"] ?? "");
				const value = String(properties["data-token-value"] ?? "");
				if (!kind || !value) return null;
				if (kind === "image") {
					return (
						<InlineTokenChip
							icon="icon-[solar--gallery-linear]"
							label={inlineTokensRef.current?.getImageLabel(value) ?? basename(value)}
							title={basename(value)}
						/>
					);
				}
				if (kind === "skill" || kind === "scene") {
					const ability =
						kind === "scene" ? inlineTokensRef.current?.getScene?.(value) : inlineTokensRef.current?.getSkill?.(value);
					return (
						<InlineTokenChip
							iconNode={<SkillTypeIcon type={kind} icon={ability?.icon} className="h-3 w-3" />}
							label={ability?.label ?? value}
							title={value}
						/>
					);
				}
				if (kind === "connector") {
					const connector = inlineTokensRef.current?.getConnector?.(value);
					return (
						<InlineTokenChip
							icon="icon-[solar--plug-circle-linear]"
							iconUrl={connector?.iconUrl}
							label={connector?.label ?? value}
							title={value}
						/>
					);
				}
				if (kind === "member") {
					const member = inlineTokensRef.current?.getMember?.(value);
					const handle = String(properties["data-token-handle"] ?? value);
					if (!member) return <>{`@${handle}`}</>;
					return (
						<InlineTokenChip
							iconNode={
								member.avatar ? (
									<img src={member.avatar} alt="" draggable={false} className="h-3 w-3 rounded-full object-cover" />
								) : undefined
							}
							label={`@${member.label || handle}`}
							title={member.meta ? `${member.label || handle} · ${member.meta}` : handle}
							tone="member"
						/>
					);
				}
				const isDirectory = properties["data-token-directory"] === "true";
				const fileName = basename(value);
				return (
					<InlineTokenChip
						asButton
						icon={isDirectory ? "icon-[solar--folder-linear]" : getFileIconClassRef.current(fileName)}
						label={fileName}
						title={value}
						onClick={() => onOpenFileRef.current(value)}
					/>
				);
			},
		}),
		// Theme and labels use document context; node types stay stable.
		[],
	);

	// 分段 span 一旦挂上就保留到实例卸载：结束时若把 rehype 插件撤掉，整个尾块会重建 DOM，
	// 表现为回复结尾「卡一下」。「最新短语略暗」只挂在包裹类上，撤掉包裹类就恢复全亮，DOM 不动。
	const chunkedRef = useRef(false);
	if (animateChunks) chunkedRef.current = true;
	// 流式结束后也保留分块结构；若把已冻结块并回单一文档，已上屏节点会整段重挂，
	// 导致短语 DOM 身份与代码块状态丢失。稳定块只按已闭合的顶层围栏切分，
	// 分块与整篇渲染结果一致，因此结束后不需要再合并。
	const frozenBlocksRef = useRef(false);
	if (isStreamingTail && !inlineTokens) frozenBlocksRef.current = true;
	const split = frozenBlocksRef.current && !inlineTokens ? splitStableMarkdownBlocks(displayText) : null;
	const committed = split?.committed ?? [];
	const tail = split ? split.tail : displayText;
	const showTail = !split || tail.length > 0 || committed.length === 0;

	// 只有仍可能变化的 tail 文档是 live；已冻结围栏可以立即、懒加载地高亮。
	return (
		<div className={cn("markdown-body break-words", animateChunks && "markdown-streaming-tail", className)}>
			{committed.map((block, index) => (
				<MarkdownDocument
					key={`committed-${index}`}
					animateChunks={false}
					components={components}
					definition={definition}
					live={false}
					streaming={isMessageStreaming}
					theme={theme}
					labels={labels}
					text={block}
				/>
			))}
			{showTail ? (
				<MarkdownDocument
					key="tail"
					animateChunks={chunkedRef.current}
					components={components}
					definition={definition}
					inlineTokens={inlineTokens}
					live={isStreamingTail}
					streaming={isMessageStreaming}
					theme={theme}
					labels={labels}
					text={tail}
				/>
			) : null}
		</div>
	);
});

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { CodeBlockCopyButtonView } from "../shared/CodeBlockCopyButton";
import { SyntaxHighlightedCode } from "../shared/SyntaxHighlightedCode";
import type { MarkdownCodeBlockProps } from "./definition";

interface CodeBlockState extends MarkdownCodeBlockProps {
	copied: boolean;
	copy: () => void;
}
const CodeBlockContext = createContext<CodeBlockState | null>(null);

function useCodeBlock(): CodeBlockState {
	const context = useContext(CodeBlockContext);
	if (!context) throw new Error("CodeBlock parts must be used within CodeBlock.Root");
	return context;
}

export function CodeBlockRoot({ children, ...props }: MarkdownCodeBlockProps & { children: ReactNode }) {
	const [copied, setCopied] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const version = useRef(0);
	useEffect(() => {
		version.current++;
		setCopied(false);
		return () => {
			version.current++;
			clearTimeout(timer.current);
		};
	}, [props.code]);
	const copy = useCallback(() => {
		const current = version.current;
		void navigator.clipboard
			.writeText(props.code)
			.then(() => {
				if (version.current !== current) return;
				setCopied(true);
				clearTimeout(timer.current);
				timer.current = setTimeout(() => setCopied(false), 1500);
			})
			.catch(() => {
				if (version.current === current) setCopied(false);
			});
	}, [props.code]);
	return <CodeBlockContext.Provider value={{ ...props, copied, copy }}>{children}</CodeBlockContext.Provider>;
}

export function CodeBlockCopy({ children }: { children: ReactNode }) {
	const { copied, copy, labels } = useCodeBlock();
	return (
		<CodeBlockCopyButtonView copied={copied} onCopy={copy} labels={labels}>
			{children}
		</CodeBlockCopyButtonView>
	);
}

/**
 * 代码块外壳，与 `MarkdownTable` 共用一套「外框 + 内面板」设计：
 * 外框铺一层淡淡的前景色并留 3px 内边距，底部内面板回到 `background` 并自己收圆角。
 * 语言标记不画底色、不画分隔线，直接坐在外框上（圆角取外框的 12px），
 * 与表格表头一致：表头与表体靠颜色深浅分层，而不是靠分割线。
 */
export function CodeBlockFrame({ className, ...props }: ComponentPropsWithoutRef<"div">) {
	return (
		<div
			{...props}
			data-md-code-frame=""
			className={cn(
				"my-3 rounded-xl border border-border/60 bg-[color-mix(in_srgb,var(--foreground)_8%,var(--background))] p-[3px] dark:bg-muted",
				className,
			)}
		/>
	);
}

/** 内面板：对应表格的 tbody 面板，圆角与外框同心（外框 12px 减去 3px 内边距）。 */
export function CodeBlockBody({ className, ...props }: ComponentPropsWithoutRef<"div">) {
	return (
		<div {...props} className={cn("overflow-hidden rounded-[9px] bg-background", className)} />
	);
}

export function CodeBlockLanguage() {
	const { lang } = useCodeBlock();
	return lang ? (
		<div className="px-4 py-2.5 text-[12px] font-medium text-muted-foreground/80">{lang}</div>
	) : null;
}

function cn(...parts: Array<string | false | null | undefined>): string {
	return parts.filter(Boolean).join(" ");
}

export function CodeBlockContent() {
	const { code, lang, theme, live } = useCodeBlock();
	return (
		<CodeBlockBody>
			<SyntaxHighlightedCode code={code} lang={lang} theme={theme} fontSizeClass="text-[13px]" live={live} />
		</CodeBlockBody>
	);
}

export function DefaultCodeBlock(props: MarkdownCodeBlockProps) {
	return (
		<CodeBlockRoot {...props}>
			<CodeBlockCopy>
				<CodeBlockFrame>
					<CodeBlockLanguage />
					<CodeBlockContent />
				</CodeBlockFrame>
			</CodeBlockCopy>
		</CodeBlockRoot>
	);
}

export const CodeBlock = {
	Root: CodeBlockRoot,
	Copy: CodeBlockCopy,
	Frame: CodeBlockFrame,
	Body: CodeBlockBody,
	Language: CodeBlockLanguage,
	Content: CodeBlockContent,
};

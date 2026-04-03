import { useEffect, useState } from "react";
import { useAtomValue } from "jotai";
import { resolvedThemeAtom } from "@shared/store/atoms";
import { ImagePreview } from "./previews/ImagePreview";
import { MarkdownPreview } from "./previews/MarkdownPreview";
import { CodePreview } from "./previews/CodePreview";
import { PdfPreview } from "./previews/PdfPreview";
import { DocxPreview } from "./previews/DocxPreview";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "ico"]);
const MARKDOWN_EXTENSIONS = new Set(["md", "mdx"]);

/** All extensions we know how to preview. Anything not in this set → "暂不支持预览". */
const SUPPORTED_EXTENSIONS = new Set([
	// Images
	"png", "jpg", "jpeg", "gif", "webp", "svg", "ico",
	// Documents
	"pdf", "docx",
	// Markdown
	"md", "mdx",
	// Code / text (shiki handles these)
	"ts", "tsx", "js", "jsx", "mjs", "cjs",
	"json", "yaml", "yml", "toml", "xml", "html", "css", "scss", "less",
	"py", "go", "rs", "java", "kt", "swift", "rb", "php", "c", "cpp", "h", "cs",
	"sh", "bash", "zsh", "sql", "graphql", "gql", "lua", "r", "dart",
	"env", "lock", "ini", "cfg", "conf", "log", "txt",
	"dockerfile", "makefile",
]);

/** Whether this extension uses ZoomableView (needs flex parent, no outer scroll). */
export function isZoomableExtension(filePath: string): boolean {
	const ext = getExtension(filePath);
	return IMAGE_EXTENSIONS.has(ext) || ext === "pdf";
}

function getExtension(filePath: string): string {
	const dotIdx = filePath.lastIndexOf(".");
	if (dotIdx <= 0) return "";
	return filePath.substring(dotIdx + 1).toLowerCase();
}

interface FilePreviewProps {
	filePath: string;
}

export function FilePreview({ filePath }: FilePreviewProps): JSX.Element {
	const theme = useAtomValue(resolvedThemeAtom);
	const ext = getExtension(filePath);
	const supported = SUPPORTED_EXTENSIONS.has(ext);

	const [state, setState] = useState<
		| { status: "loading"; filePath: string }
		| { status: "error"; filePath: string; message: string }
		| { status: "loaded"; filePath: string; content: string; encoding: "utf8" | "base64" }
	>({ status: "loading", filePath });

	useEffect(() => {
		if (!supported) return;
		let cancelled = false;
		setState({ status: "loading", filePath });

		window.vetta.fs
			.readFile(filePath)
			.then((result) => {
				if (!cancelled) {
					setState({ status: "loaded", filePath, ...result });
				}
			})
			.catch((err: Error) => {
				if (!cancelled) {
					const message = err.message?.includes("too large")
						? "文件过大，无法预览"
						: "无法读取此文件";
					setState({ status: "error", filePath, message });
				}
			});

		return () => {
			cancelled = true;
		};
	}, [filePath, supported]);

	// filePath changed but useEffect hasn't run yet — treat as loading
	const stale = state.filePath !== filePath;

	if (!supported) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-muted-foreground/50">
				<span className="icon-[mdi--file-question-outline] text-[40px]" />
				<span className="text-[13px]">暂不支持预览此文件格式</span>
			</div>
		);
	}

	if (stale || state.status === "loading") {
		return (
			<div className="flex flex-1 items-center justify-center p-8">
				<span className="icon-[mdi--loading] animate-spin text-[24px] text-muted-foreground/50" />
			</div>
		);
	}

	if (state.status === "error") {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-muted-foreground/50">
				<span className="icon-[mdi--alert-circle-outline] text-[40px]" />
				<span className="text-[13px]">{state.message}</span>
			</div>
		);
	}

	// Images
	if (IMAGE_EXTENSIONS.has(ext)) {
		return <ImagePreview content={state.content} extension={ext} />;
	}

	// PDF
	if (ext === "pdf") {
		return <PdfPreview content={state.content} />;
	}

	// DOCX
	if (ext === "docx") {
		return <DocxPreview content={state.content} />;
	}

	// Markdown
	if (MARKDOWN_EXTENSIONS.has(ext)) {
		return <MarkdownPreview content={state.content} />;
	}

	// JSON: pretty-print if possible
	if (ext === "json" && state.encoding === "utf8") {
		let formatted = state.content;
		try {
			formatted = JSON.stringify(JSON.parse(state.content), null, 2);
		} catch {
			// keep original
		}
		return <CodePreview content={formatted} extension={ext} theme={theme} />;
	}

	// All other supported text files: syntax-highlighted code preview
	return <CodePreview content={state.content} extension={ext} theme={theme} />;
}

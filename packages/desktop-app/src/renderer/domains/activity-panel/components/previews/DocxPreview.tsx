import { useEffect, useState } from "react";
import mammoth from "mammoth";

interface DocxPreviewProps {
	content: string; // base64 encoded
}

export function DocxPreview({ content }: DocxPreviewProps): JSX.Element {
	const [state, setState] = useState<
		{ status: "loading" } | { status: "error" } | { status: "done"; html: string }
	>({ status: "loading" });

	useEffect(() => {
		let cancelled = false;

		// atob 和 mammoth.convertToHtml 在面对损坏/非 base64 内容时会同步抛错，
		// 用 Promise.resolve().then(...) 把同步异常一并转成 reject，由统一的 .catch 处理。
		Promise.resolve()
			.then(() => {
				const buffer = Uint8Array.from(atob(content), (c) => c.charCodeAt(0)).buffer;
				return mammoth.convertToHtml({ arrayBuffer: buffer });
			})
			.then((result) => {
				if (!cancelled) {
					setState({ status: "done", html: result.value });
				}
			})
			.catch(() => {
				if (!cancelled) setState({ status: "error" });
			});

		return () => {
			cancelled = true;
		};
	}, [content]);

	if (state.status === "loading") {
		return (
			<div className="flex items-center justify-center p-8">
				<span className="icon-[mdi--loading] animate-spin text-[24px] text-muted-foreground/50" />
			</div>
		);
	}

	if (state.status === "error") {
		return (
			<div className="flex flex-col items-center justify-center gap-3 p-8 text-muted-foreground/50">
				<span className="icon-[mdi--alert-circle-outline] text-[40px]" />
				<span className="text-[13px]">无法解析 DOCX 文件</span>
			</div>
		);
	}

	return (
		<div
			className="docx-preview markdown-body break-words p-4 text-[13px] leading-[1.6] text-foreground [&_h1]:mb-3 [&_h1]:mt-4 [&_h1]:text-[18px] [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:mt-3.5 [&_h2]:text-[16px] [&_h2]:font-bold [&_h3]:mb-2 [&_h3]:mt-3 [&_h3]:text-[14px] [&_h3]:font-semibold [&_img]:my-2 [&_img]:max-w-full [&_img]:rounded-md [&_ol]:my-1.5 [&_ol]:ml-4 [&_ol]:list-decimal [&_p]:my-1.5 [&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_table]:text-[12px] [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-1.5 [&_th]:border [&_th]:border-border [&_th]:px-3 [&_th]:py-1.5 [&_th]:font-semibold [&_ul]:my-1.5 [&_ul]:ml-4 [&_ul]:list-disc"
			// biome-ignore lint/security/noDangerouslySetInnerHtml: mammoth generates clean HTML from docx
			dangerouslySetInnerHTML={{ __html: state.html }}
		/>
	);
}

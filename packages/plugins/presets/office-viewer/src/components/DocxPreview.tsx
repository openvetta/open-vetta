import type { PluginFilePreviewProps } from "@vetta/plugin-sdk";
import { renderAsync } from "docx-preview";
import { useEffect, useRef, useState, type JSX } from "react";
import { fetchFileBytes } from "../utils/file";
import { ErrorState, LoadingState, type LoadState } from "./PreviewState";

export function DocxPreview({ file }: PluginFilePreviewProps): JSX.Element {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const [status, setStatus] = useState<LoadState>("loading");

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		let cancelled = false;
		container.replaceChildren();
		setStatus("loading");
		void fetchFileBytes(file)
			.then((bytes) =>
				renderAsync(bytes, container, container, {
					inWrapper: true,
					breakPages: true,
					ignoreLastRenderedPageBreak: false,
					renderHeaders: true,
					renderFooters: true,
					renderFootnotes: true,
					renderEndnotes: true,
					renderComments: false,
					renderChanges: false,
					renderAltChunks: false,
					useBase64URL: false,
				}),
			)
			.then(
				() => {
					if (!cancelled) setStatus("ready");
				},
				() => {
					if (!cancelled) setStatus("error");
				},
			);
		return () => {
			cancelled = true;
			container.replaceChildren();
		};
	}, [file]);

	return (
		<div className="relative h-full min-h-0 flex-1 overflow-auto bg-[var(--muted)] p-5">
			<div
				ref={containerRef}
				className="mx-auto min-h-full [&_.docx-wrapper]:bg-transparent [&_.docx-wrapper]:p-0 [&_section.docx]:mb-5 [&_section.docx]:shadow-lg"
			/>
			{status === "loading" && (
				<div className="absolute inset-0 bg-[var(--background)]">
					<LoadingState />
				</div>
			)}
			{status === "error" && (
				<div className="absolute inset-0 bg-[var(--background)]">
					<ErrorState message="无法渲染 DOCX 文件" />
				</div>
			)}
		</div>
	);
}

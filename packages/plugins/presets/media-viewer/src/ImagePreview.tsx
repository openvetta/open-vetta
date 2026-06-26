import { type PluginPreviewFile, useTranslation } from "@vetta/plugin-sdk";
import type { JSX } from "react";
import { useEffect, useState } from "react";
import { versionedUrl } from "./utils";
import { ZoomableView } from "./ZoomableView";

interface Size {
	width: number;
	height: number;
}

export function ImagePreview({ file }: { file: PluginPreviewFile }): JSX.Element {
	const { t } = useTranslation();
	const [version, setVersion] = useState(0);
	const [failed, setFailed] = useState(false);
	const [natural, setNatural] = useState<Size | null>(null);
	// 已完成后台解码、可安全上屏的 src（保留旧图直到新图就绪，避免切换闪烁）
	const [readySrc, setReadySrc] = useState<string | null>(null);

	useEffect(() => {
		setVersion(0);
		setFailed(false);
		const watcher = file.watch(() => {
			setFailed(false);
			setVersion((value) => value + 1);
		});
		return () => watcher.dispose();
	}, [file]);

	const src = versionedUrl(file.getUrl(), version);

	useEffect(() => {
		if (!src) return;
		let cancelled = false;
		const img = new Image();
		const commit = () => {
			if (cancelled) return;
			setNatural({ width: img.naturalWidth, height: img.naturalHeight });
			setReadySrc(src);
			setFailed(false);
		};
		img.onload = commit;
		img.onerror = () => {
			if (!cancelled) setFailed(true);
		};
		img.src = src;
		// 优先在后台线程异步解码；不支持或解码中断时由 onload 兜底
		img.decode?.().then(commit).catch(() => {});
		return () => {
			cancelled = true;
			img.onload = null;
			img.onerror = null;
		};
	}, [src]);

	if (failed || !src) {
		return (
			<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-[var(--muted-foreground)]">
				<div className="text-[40px]">□</div>
				<span className="text-[13px]">{t("image.error")}</span>
			</div>
		);
	}

	if (!readySrc) {
		// 图片解码中：显示加载动画
		return (
			<div className="flex min-h-0 flex-1 items-center justify-center bg-[var(--background)]">
				<div className="size-6 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--muted-foreground)]" />
			</div>
		);
	}

	return (
		<ZoomableView naturalSize={natural}>
			<img
				src={readySrc}
				alt={file.name}
				className="block h-full w-full select-none rounded-md"
				draggable={false}
				decoding="async"
				onError={() => setFailed(true)}
			/>
		</ZoomableView>
	);
}

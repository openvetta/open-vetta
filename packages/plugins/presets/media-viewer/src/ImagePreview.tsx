import type { PluginPreviewFile } from "@vetta/plugin-sdk";
import { useEffect, useState } from "react";
import { versionedUrl } from "./utils";
import { ZoomableView } from "./ZoomableView";

export function ImagePreview({ file }: { file: PluginPreviewFile }): JSX.Element {
	const [version, setVersion] = useState(0);
	const [failed, setFailed] = useState(false);

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

	if (failed || !src) {
		return (
			<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-[var(--muted-foreground)]">
				<div className="text-[40px]">□</div>
				<span className="text-[13px]">无法加载此图片</span>
			</div>
		);
	}

	return (
		<ZoomableView>
			<div className="flex items-center justify-center p-4">
				<img
					src={src}
					alt={file.name}
					className="max-w-full rounded-md"
					draggable={false}
					onError={() => setFailed(true)}
				/>
			</div>
		</ZoomableView>
	);
}

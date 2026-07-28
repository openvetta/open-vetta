import { useEffect, useRef, useState } from "react";
import type { PluginFilePreviewProps } from "@vetta-org/plugin-sdk";
import { LottieStudioView } from "./LottieStudioView";
import { pluginContext } from "./store";

/** File-preview entry for `.lottie` (raw bodymovin JSON text). */
export function LottieFilePreview({ file }: PluginFilePreviewProps) {
	const [text, setText] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const reqId = useRef(0);
	// What we last persisted, to ignore the watch event our own write triggers
	// (otherwise a slot edit would reload → rebuild → reset playback mid-drag).
	const lastWrittenRef = useRef<string | null>(null);

	useEffect(() => {
		const load = (): void => {
			const my = ++reqId.current;
			setError(null);
			void file
				.readText()
				.then((content) => {
					if (my !== reqId.current) return;
					if (content === lastWrittenRef.current) return; // our own write — ignore
					setText(content);
				})
				.catch((err: unknown) => {
					if (my === reqId.current) setError(`读取失败：${(err as Error).message}`);
				});
		};
		load();
		// Live-reload when the file changes on disk (debounced by the host).
		const sub = file.watch(load);
		return () => sub.dispose();
	}, [file]);

	const onSave = (updated: string): void => {
		const ctx = pluginContext();
		if (!ctx || !file.path) return;
		lastWrittenRef.current = updated;
		void ctx.fs.writeFile(file.path, updated).catch(() => {
			/* best-effort */
		});
	};

	if (error) {
		return (
			<div className="flex h-full items-center justify-center p-6 text-center text-[13px]" style={{ color: "var(--destructive, #ef4444)" }}>
				{error}
			</div>
		);
	}
	if (text === null) {
		return (
			<div className="flex h-full items-center justify-center text-[13px]" style={{ color: "var(--muted-foreground)" }}>
				加载中…
			</div>
		);
	}
	// Editing writes back only when the host granted fs.write; otherwise read-only.
	return <LottieStudioView jsonText={text} onSave={file.path ? onSave : undefined} />;
}

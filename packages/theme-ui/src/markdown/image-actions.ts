import { useEffect, useRef, useState } from "react";
import type { MarkdownHost } from "./host";

export type ImageActionState = "copy" | "save" | "failed" | "copied" | null;

/** Copy/save through the host; a result that lands after `resetKey` changes is dropped. */
export function useImageActions(host: MarkdownHost | null | undefined, url: string | undefined, resetKey: string) {
	const [action, setAction] = useState<ImageActionState>(null);
	const generation = useRef(0);
	// biome-ignore lint/correctness/useExhaustiveDependencies: a new image invalidates pending results.
	useEffect(
		() => () => {
			generation.current++;
		},
		[resetKey],
	);
	const run = async (kind: "copy" | "save") => {
		if (!host || !url) return;
		const current = generation.current;
		setAction(kind);
		try {
			await (kind === "copy" ? host.copyImage(url) : host.saveImage(url));
			if (current === generation.current) setAction(kind === "copy" ? "copied" : null);
		} catch {
			if (current === generation.current) setAction("failed");
		}
	};
	return { action, setAction, run, busy: action === "copy" || action === "save" };
}

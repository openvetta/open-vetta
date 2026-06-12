import type { FilePreviewItem } from "@shared/store/atoms";
import type { PluginFilePreviewContribution, PluginPreviewFile } from "@vetta/plugin-sdk";
import { useMemo } from "react";

const MIME_BY_EXTENSION: Record<string, string> = {
	svg: "image/svg+xml",
	drawio: "application/xml",
	xml: "application/xml",
	json: "application/json",
};

function mimeForExtension(ext: string, fallback?: string): string {
	return fallback ?? MIME_BY_EXTENSION[ext] ?? "application/octet-stream";
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes.buffer;
}

function base64ToText(base64: string): string {
	return new TextDecoder().decode(new Uint8Array(base64ToArrayBuffer(base64)));
}

/**
 * Builds the host-mediated content accessors and renders a plugin's file
 * preview component. Content access is permission-free: the user explicitly
 * opened this one file and the host hands it over (not arbitrary fs access).
 */
export function PluginFilePreview({
	item,
	ext,
	component: Component,
}: {
	item: FilePreviewItem;
	ext: string;
	component: PluginFilePreviewContribution["component"];
}): JSX.Element {
	const file = useMemo<PluginPreviewFile>(() => {
		const readRaw = async (): Promise<{ content: string; encoding: "utf8" | "base64" }> => {
			if (item.path) return await window.vetta.fs.readFile(item.path);
			if (item.url) {
				const res = await fetch(item.url);
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const buf = await res.arrayBuffer();
				let binary = "";
				const bytes = new Uint8Array(buf);
				const chunk = 0x8000;
				for (let i = 0; i < bytes.length; i += chunk) {
					binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
				}
				return { content: btoa(binary), encoding: "base64" };
			}
			throw new Error("无可用数据源");
		};

		return {
			path: item.path ?? null,
			name: item.name,
			extension: ext,
			mime: mimeForExtension(ext, item.mime),
			size: item.size ?? 0,
			readText: async () => {
				const { content, encoding } = await readRaw();
				return encoding === "utf8" ? content : base64ToText(content);
			},
			readBytes: async () => {
				const { content, encoding } = await readRaw();
				if (encoding === "base64") return base64ToArrayBuffer(content);
				return new TextEncoder().encode(content).buffer;
			},
			getUrl: () =>
				item.url ?? (item.path ? `vetta-media://local/stream?path=${encodeURIComponent(item.path)}` : ""),
			watch: (listener) => {
				const path = item.path;
				if (!path) return { dispose() {} };
				const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
				const dir = slash > 0 ? path.slice(0, slash) : path;
				void window.vetta.fs.watchDir(dir);
				const unsub = window.vetta.fs.onDirChanged((changed) => {
					if (changed === dir) listener();
				});
				return {
					dispose() {
						unsub();
						void window.vetta.fs.unwatchDir(dir);
					},
				};
			},
		};
	}, [item, ext]);

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
			<Component file={file} />
		</div>
	);
}

import {
	definePlugin,
	type PluginContext,
	type PluginImageRef,
	type PluginMessageSlotProps,
} from "@vetta/plugin-sdk";
import { useEffect, useState } from "react";
import "./style.css";

// ─── Plugin-internal shared state ───
// Preview card and editor panel live in the same Module Federation instance, so
// the "which image to edit" handoff goes through module memory, not the SDK.

let pluginCtx: PluginContext | null = null;
let editTarget: PluginImageRef | null = null;
const editTargetListeners = new Set<(target: PluginImageRef | null) => void>();

function setEditTarget(target: PluginImageRef | null): void {
	editTarget = target;
	for (const listener of editTargetListeners) listener(target);
}

function useEditTarget(): PluginImageRef | null {
	const [target, setTarget] = useState<PluginImageRef | null>(editTarget);
	useEffect(() => {
		editTargetListeners.add(setTarget);
		return () => {
			editTargetListeners.delete(setTarget);
		};
	}, []);
	return target;
}

async function downloadImage(ref: PluginImageRef): Promise<void> {
	const response = await fetch(ref.url);
	const blob = await response.blob();
	const objectUrl = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = objectUrl;
	anchor.download = `${ref.id}.${(ref.mimeType ?? "image/png").split("/")[1] ?? "png"}`;
	document.body.append(anchor);
	anchor.click();
	anchor.remove();
	URL.revokeObjectURL(objectUrl);
}

// ─── Message slot: per-message preview card ───

function ImagePreviewCard({ message }: PluginMessageSlotProps) {
	const refs = message.imageRefs;
	if (!refs || refs.length === 0) return null;
	return (
		<div className="flex flex-wrap gap-3">
			{refs.map((ref) => (
				<div
					key={ref.id}
					className="group relative overflow-hidden rounded-xl border"
					style={{ borderColor: "color-mix(in srgb, var(--foreground) 12%, transparent)" }}
				>
					<img src={ref.url} alt="生成的图像" className="block max-h-[320px] max-w-[320px] object-contain" />
					<div
						className="absolute inset-x-0 bottom-0 flex items-center justify-between px-3 py-2 opacity-0 transition-opacity group-hover:opacity-100"
						style={{ background: "linear-gradient(to top, rgba(0,0,0,0.55), transparent)" }}
					>
						<button
							type="button"
							className="rounded-md px-2 py-1 text-[12px] font-medium"
							style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
							onClick={() => {
								setEditTarget(ref);
								pluginCtx?.ui.openActivityTab("editor");
							}}
						>
							编辑
						</button>
						<button
							type="button"
							className="rounded-md px-2 py-1 text-[12px] font-medium text-white"
							style={{ background: "rgba(255,255,255,0.18)" }}
							onClick={() => void downloadImage(ref)}
						>
							导出
						</button>
					</div>
				</div>
			))}
		</div>
	);
}

// ─── Activity tab: image editor (image-to-image + lineage) ───

function ImageEditorPanel() {
	const target = useEditTarget();
	const [lineage, setLineage] = useState<PluginImageRef[]>([]);
	const [prompt, setPrompt] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!target || !pluginCtx) {
			setLineage([]);
			return;
		}
		let cancelled = false;
		void pluginCtx.images
			.lineage(target.id)
			.then((refs) => {
				console.log("[image-gen] lineage", target.id, "→", refs.length, refs);
				if (!cancelled) setLineage(refs);
			})
			.catch((err) => {
				console.error("[image-gen] lineage failed", err);
				if (!cancelled) setLineage([]);
			});
		return () => {
			cancelled = true;
		};
	}, [target]);

	const runEdit = async (): Promise<void> => {
		if (!target || !pluginCtx || !prompt.trim()) return;
		setBusy(true);
		setError(null);
		try {
			const result = await pluginCtx.images.edit({ prompt: prompt.trim(), source: { imageId: target.id } });
			if (result[0]) {
				setEditTarget(result[0]);
				setPrompt("");
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(false);
		}
	};

	if (!target) {
		return (
			<div className="p-6 text-[13px]" style={{ color: "var(--muted-foreground)" }}>
				在消息下方的图片上点「编辑」，即可在这里对它做二次编辑。
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col gap-4 p-4">
			<div className="flex items-center justify-center rounded-xl border p-2" style={{ borderColor: "color-mix(in srgb, var(--foreground) 12%, transparent)" }}>
				<img src={target.url} alt="编辑中的图像" className="max-h-[320px] max-w-full object-contain" />
			</div>

			<div className="flex flex-col gap-2">
				<textarea
					value={prompt}
					onChange={(event) => setPrompt(event.target.value)}
					placeholder="描述想要的修改，例如「把背景换成夜晚的城市」"
					rows={3}
					className="w-full resize-none rounded-lg border px-3 py-2 text-[13px] outline-none"
					style={{
						borderColor: "color-mix(in srgb, var(--foreground) 14%, transparent)",
						background: "var(--background)",
						color: "var(--foreground)",
					}}
				/>
				<button
					type="button"
					disabled={busy || !prompt.trim()}
					onClick={() => void runEdit()}
					className="self-end rounded-lg px-4 py-1.5 text-[13px] font-medium disabled:opacity-50"
					style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
				>
					{busy ? "生成中…" : "生成"}
				</button>
				{error && (
					<span className="text-[12px]" style={{ color: "var(--destructive)" }}>
						{error}
					</span>
				)}
			</div>

			{lineage.length > 0 && (
				<div className="flex flex-col gap-2">
					<span className="text-[12px]" style={{ color: "var(--muted-foreground)" }}>
						该图历史版本（{lineage.length}）
					</span>
					<div className="flex flex-wrap gap-2">
						{lineage.map((ref) => (
							<button
								key={ref.id}
								type="button"
								onClick={() => setEditTarget(ref)}
								className="overflow-hidden rounded-md border"
								style={{
									borderColor:
										ref.id === target.id ? "var(--primary)" : "color-mix(in srgb, var(--foreground) 12%, transparent)",
								}}
							>
								<img src={ref.url} alt="历史版本" className="block h-16 w-16 object-cover" />
							</button>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

// Built lazily inside activate() — NOT at module top level. In a Module
// Federation remote, top-level JSX would call the shared jsx runtime before
// loadShare resolves it ("t is not a function").
function imageIcon() {
	return (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
			<rect x="3" y="3" width="18" height="18" rx="2.5" />
			<circle cx="8.5" cy="8.5" r="1.5" />
			<path d="M21 15l-5-5L5 21" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

export default definePlugin({
	activate(ctx) {
		pluginCtx = ctx;
		ctx.ui.registerInputAction({
			id: "image-mode",
			label: "图像生成",
			icon: imageIcon(),
			decoratePrompt: () => ({ metadata: { imageMode: true } }),
		});
		ctx.ui.registerMessageSlot({ id: "preview", component: ImagePreviewCard });
		ctx.ui.registerActivityTab({ id: "editor", label: "图像生成", icon: imageIcon(), component: ImageEditorPanel });
	},
	deactivate() {
		pluginCtx = null;
		setEditTarget(null);
	},
});

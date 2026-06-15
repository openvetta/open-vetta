import {
	definePlugin,
	type PluginContext,
	type PluginImageRef,
	type PluginMessageSlotProps,
} from "@vetta/plugin-sdk";
import { type ReactNode, useEffect, useMemo, useState } from "react";
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

/** Reactive edit lineage (oldest → newest) for an image id. */
function useLineage(imageId: string | undefined): PluginImageRef[] {
	const [lineage, setLineage] = useState<PluginImageRef[]>([]);
	useEffect(() => {
		if (!imageId || !pluginCtx) {
			setLineage([]);
			return;
		}
		let cancelled = false;
		void pluginCtx.images
			.lineage(imageId)
			.then((refs) => {
				if (!cancelled) setLineage(refs.length > 0 ? refs : []);
			})
			.catch(() => {
				if (!cancelled) setLineage([]);
			});
		return () => {
			cancelled = true;
		};
	}, [imageId]);
	return lineage;
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

// ─── Icons (created at render — never at module top level in an MF remote) ───

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function IconImage({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" {...stroke} className={className}>
			<rect x="3" y="3" width="18" height="18" rx="3" />
			<circle cx="8.5" cy="8.5" r="1.6" />
			<path d="M21 15.5l-4.5-4.5L5 22" />
		</svg>
	);
}

function IconEdit({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" {...stroke} className={className}>
			<path d="M12 20h9" />
			<path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
		</svg>
	);
}

function IconDownload({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" {...stroke} className={className}>
			<path d="M12 3v12" />
			<path d="M7 11l5 5 5-5" />
			<path d="M5 21h14" />
		</svg>
	);
}

function IconSparkles({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" {...stroke} className={className}>
			<path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4Z" />
			<path d="M19 14l.7 1.9L21.5 17l-1.8.6L19 19.5l-.7-1.9L16.5 17l1.8-.6Z" />
		</svg>
	);
}

// ─── Shared UI ───

const subtleBorder = "color-mix(in srgb, var(--foreground) 10%, transparent)";

function GhostButton({
	icon,
	label,
	onClick,
}: {
	icon: ReactNode;
	label: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-foreground/80 transition-all hover:text-foreground"
			style={{ background: "color-mix(in srgb, var(--foreground) 6%, transparent)" }}
			onMouseEnter={(e) => {
				e.currentTarget.style.background = "color-mix(in srgb, var(--foreground) 11%, transparent)";
			}}
			onMouseLeave={(e) => {
				e.currentTarget.style.background = "color-mix(in srgb, var(--foreground) 6%, transparent)";
			}}
		>
			<span className="h-3.5 w-3.5">{icon}</span>
			{label}
		</button>
	);
}

/** Animated streaming-gradient skeleton with a pulsing center icon. */
function GenerationSkeleton() {
	return (
		<div
			className="imagegen-skeleton imagegen-fade-in relative flex aspect-square w-full max-w-[300px] items-center justify-center overflow-hidden rounded-2xl border"
			style={{ borderColor: subtleBorder }}
		>
			<div className="imagegen-pulse flex flex-col items-center gap-2" style={{ color: "var(--primary)" }}>
				<IconImage className="h-8 w-8" />
				<span className="text-[11px] font-medium tracking-wide opacity-80">生成中…</span>
			</div>
		</div>
	);
}

/**
 * Version gallery: the latest (or selected) image rendered large, the remaining
 * versions stacked as thumbnails on the right. Clicking a thumbnail promotes it.
 */
function VersionGallery({
	versions,
	activeId,
	onSelect,
	bigClassName = "max-h-[300px] max-w-full",
}: {
	versions: PluginImageRef[];
	activeId?: string;
	onSelect?: (ref: PluginImageRef) => void;
	bigClassName?: string;
}) {
	// newest first; the big one defaults to the newest
	const ordered = useMemo(() => [...versions].reverse(), [versions]);
	const active = ordered.find((v) => v.id === activeId) ?? ordered[0];
	if (!active) return null;
	const rest = ordered.filter((v) => v.id !== active.id);

	return (
		<div className="imagegen-fade-in flex items-start gap-2.5">
			<div
				className="overflow-hidden rounded-2xl border"
				style={{ borderColor: subtleBorder, background: "color-mix(in srgb, var(--foreground) 4%, transparent)" }}
			>
				<img src={active.url} alt="生成的图像" className={`block object-contain ${bigClassName}`} />
			</div>
			{rest.length > 0 && (
				<div className="flex max-h-[300px] flex-col gap-2 overflow-y-auto pr-0.5">
					{rest.map((ref) => (
						<button
							key={ref.id}
							type="button"
							onClick={() => onSelect?.(ref)}
							className="group relative overflow-hidden rounded-xl border transition-all"
							style={{ borderColor: subtleBorder }}
							onMouseEnter={(e) => {
								e.currentTarget.style.borderColor = "color-mix(in srgb, var(--primary) 55%, transparent)";
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.borderColor = subtleBorder;
							}}
						>
							<img src={ref.url} alt="历史版本" className="block h-14 w-14 object-cover" />
						</button>
					))}
				</div>
			)}
		</div>
	);
}

// ─── Message slot: per-message preview card ───

function ImagePreviewCard({ message }: PluginMessageSlotProps) {
	const refs = message.imageRefs;
	const baseId = refs?.[0]?.id;
	const lineage = useLineage(baseId);
	const versions = lineage.length > 0 ? lineage : (refs ?? []);
	const [activeId, setActiveId] = useState<string | undefined>(undefined);

	if (message.imageGenerating && (!refs || refs.length === 0)) {
		return (
			<div className="py-1">
				<GenerationSkeleton />
			</div>
		);
	}
	if (!refs || refs.length === 0) return null;

	const active = versions.find((v) => v.id === activeId) ?? versions[versions.length - 1];

	return (
		<div className="flex flex-col gap-2 py-1">
			<VersionGallery versions={versions} activeId={active?.id} onSelect={(r) => setActiveId(r.id)} />
			<div className="flex items-center gap-1.5">
				<GhostButton
					icon={<IconEdit className="h-3.5 w-3.5" />}
					label="编辑"
					onClick={() => {
						if (active) setEditTarget(active);
						pluginCtx?.ui.openActivityTab("editor");
					}}
				/>
				<GhostButton
					icon={<IconDownload className="h-3.5 w-3.5" />}
					label="导出"
					onClick={() => {
						if (active) void downloadImage(active);
					}}
				/>
			</div>
		</div>
	);
}

// ─── Activity tab: image editor (image-to-image + lineage) ───

function ImageEditorPanel() {
	const target = useEditTarget();
	const lineage = useLineage(target?.id);
	const [prompt, setPrompt] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const versions = lineage.length > 0 ? lineage : target ? [target] : [];

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
			<div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
				<div className="imagegen-pulse" style={{ color: "var(--muted-foreground)" }}>
					<IconImage className="h-10 w-10" />
				</div>
				<p className="text-[13px]" style={{ color: "var(--muted-foreground)" }}>
					在消息下方的图片上点「编辑」，即可在这里做二次编辑。
				</p>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
			<VersionGallery
				versions={versions}
				activeId={target.id}
				onSelect={(r) => setEditTarget(r)}
				bigClassName="max-h-[360px] max-w-full"
			/>

			<div
				className="flex flex-col gap-2.5 rounded-2xl border p-3"
				style={{ borderColor: subtleBorder, background: "color-mix(in srgb, var(--foreground) 3%, transparent)" }}
			>
				<textarea
					value={prompt}
					onChange={(event) => setPrompt(event.target.value)}
					placeholder="描述想要的修改，例如「把背景换成夜晚的城市，保留主体」"
					rows={3}
					className="w-full resize-none rounded-xl border px-3 py-2 text-[13px] outline-none transition-colors focus:border-[color-mix(in_srgb,var(--primary)_55%,transparent)]"
					style={{ borderColor: subtleBorder, background: "var(--background)", color: "var(--foreground)" }}
				/>
				<div className="flex items-center justify-between">
					<GhostButton
						icon={<IconDownload className="h-3.5 w-3.5" />}
						label="导出"
						onClick={() => void downloadImage(target)}
					/>
					<button
						type="button"
						disabled={busy || !prompt.trim()}
						onClick={() => void runEdit()}
						className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-semibold shadow-sm transition-all disabled:cursor-not-allowed disabled:opacity-45"
						style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
					>
						<span className={`h-4 w-4 ${busy ? "imagegen-pulse" : ""}`}>
							<IconSparkles className="h-4 w-4" />
						</span>
						{busy ? "生成中…" : "生成"}
					</button>
				</div>
				{error && (
					<span className="text-[12px]" style={{ color: "var(--destructive)" }}>
						{error}
					</span>
				)}
			</div>
		</div>
	);
}

export default definePlugin({
	activate(ctx) {
		pluginCtx = ctx;
		ctx.ui.registerInputAction({
			id: "image-mode",
			label: "图像生成",
			icon: <IconImage className="h-3.5 w-3.5" />,
			decoratePrompt: () => ({ metadata: { imageMode: true } }),
		});
		ctx.ui.registerMessageSlot({ id: "preview", component: ImagePreviewCard });
		ctx.ui.registerActivityTab({
			id: "editor",
			label: "图像生成",
			icon: <IconImage className="h-4 w-4" />,
			component: ImageEditorPanel,
		});
	},
	deactivate() {
		pluginCtx = null;
		setEditTarget(null);
	},
});

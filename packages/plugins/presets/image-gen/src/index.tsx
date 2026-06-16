import {
	definePlugin,
	type PluginContext,
	type PluginImageRef,
	type PluginMessageSlotProps,
	useActiveConversation,
	useEditImageAttachment,
} from "@vetta/plugin-sdk";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./style.css";

// ─── Plugin-internal shared state ───
// The preview swiper lives in the same Module Federation instance across all
// messages. The "currently attached for edit" image is host state (read via
// useEditImageAttachment) — a single source of truth shared with the input-bar
// capsule, so the swiper highlight clears automatically on send / capsule close
// / session switch. Picking a target goes through ui.setEditImageAttachment.

let pluginCtx: PluginContext | null = null;

/** Reactive edit lineage (oldest → newest) for an image id. */
// Module-level lineage cache. Critical for virtualization: the message list
// unmounts an image card when it scrolls far off-screen and REMOUNTS it on the
// way back. Without a cache the remounted hook starts at [] and re-fetches async,
// so the card paints empty → refs → lineage — a visible flicker plus a height
// re-measure that jerks the scroll position right as the card re-enters the
// viewport. Seeding state from the cache makes a remount paint the final content
// synchronously in one frame (no flicker, stable height); the refetch only
// reconciles changes (e.g. a new version appended by a later edit).
const lineageCache = new Map<string, PluginImageRef[]>();

function useLineage(imageId: string | undefined): PluginImageRef[] {
	const [lineage, setLineage] = useState<PluginImageRef[]>(() =>
		imageId ? (lineageCache.get(imageId) ?? []) : [],
	);
	// Re-fetch when a turn ends: a completed edit appends a new version to some
	// lineage, and every card must re-evaluate (so a superseded turn self-hides).
	const { isStreaming } = useActiveConversation();
	useEffect(() => {
		if (!imageId || !pluginCtx) {
			setLineage([]);
			return;
		}
		const cached = lineageCache.get(imageId);
		if (cached) setLineage(cached); // paint cached synchronously; refetch reconciles
		let cancelled = false;
		void pluginCtx.images
			.lineage(imageId)
			.then((refs) => {
				const next = refs.length > 0 ? refs : [];
				lineageCache.set(imageId, next);
				if (!cancelled) setLineage(next);
			})
			.catch(() => {
				if (!cancelled && !cached) setLineage([]);
			});
		return () => {
			cancelled = true;
		};
	}, [imageId, isStreaming]);
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

function IconRefresh({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" {...stroke} className={className}>
			<path d="M21 12a9 9 0 1 1-2.64-6.36" />
			<path d="M21 3v5h-5" />
		</svg>
	);
}

function IconChevron({ className, dir }: { className?: string; dir: "left" | "right" }) {
	return (
		<svg viewBox="0 0 24 24" {...stroke} className={className}>
			<path d={dir === "left" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
		</svg>
	);
}

// ─── Shared UI ───

const subtleBorder = "color-mix(in srgb, var(--foreground) 10%, transparent)";

/** Icon-only action button, designed to overlay an image (translucent dark pill). */
function IconButton({
	icon,
	title,
	onClick,
}: {
	icon: ReactNode;
	title: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			title={title}
			onClick={onClick}
			className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-lg text-white/90 backdrop-blur-md transition-colors hover:text-white"
			style={{ background: "color-mix(in srgb, black 42%, transparent)" }}
			onMouseEnter={(e) => {
				e.currentTarget.style.background = "color-mix(in srgb, black 58%, transparent)";
			}}
			onMouseLeave={(e) => {
				e.currentTarget.style.background = "color-mix(in srgb, black 42%, transparent)";
			}}
		>
			<span className="h-3.5 w-3.5">{icon}</span>
		</button>
	);
}

// Solid color blobs that, once heavily blurred by the container, melt into a
// chaotic flowing ripple — mirrors the desktop-app active theme card background.
const SKELETON_BLOBS: { left: string; top: string; w: string; h: string; rotate: number; color: string }[] = [
	{ left: "-15%", top: "-20%", w: "75%", h: "75%", rotate: -8, color: "var(--primary)" },
	{ left: "55%", top: "-15%", w: "70%", h: "70%", rotate: 12, color: "var(--accent)" },
	{ left: "-10%", top: "55%", w: "70%", h: "75%", rotate: 18, color: "var(--ring)" },
	{ left: "45%", top: "50%", w: "75%", h: "70%", rotate: -14, color: "var(--chart-2)" },
	{ left: "25%", top: "20%", w: "55%", h: "60%", rotate: 6, color: "var(--chart-4)" },
];

/** Flowing color-blob skeleton with a pulsing center icon. `className` sizes it. */
function GenerationSkeleton({ className = "aspect-square w-full max-w-[300px]" }: { className?: string }) {
	return (
		<div
			className={`imagegen-fade-in relative shrink-0 overflow-hidden rounded-2xl border ${className}`}
			style={{ borderColor: subtleBorder, background: "var(--background)" }}
		>
			{/* blob 层：居中的大正方形旋转层 + 重度模糊。正方形 180% 宽，任意旋转角内切圆都盖满卡片 */}
			<div className="absolute inset-0 flex items-center justify-center">
				<div className="imagegen-blob-spin relative aspect-square w-[180%]" style={{ filter: "blur(26px) saturate(120%)" }}>
					{SKELETON_BLOBS.map((b, i) => (
						<div
							key={i}
							className="absolute"
							style={{ left: b.left, top: b.top, width: b.w, height: b.h, transform: `rotate(${b.rotate}deg)` }}
						>
							<div
								className="imagegen-blob-ripple h-full w-full rounded-full"
								style={{
									background: b.color,
									// 时长/相位各自错开，叠加后形成无规律混沌涟漪
									animationDuration: `${5 + i * 1.3}s`,
									animationDelay: `${i * -1.7}s`,
								}}
							/>
						</div>
					))}
				</div>
			</div>
			{/* 中心呼吸图标 */}
			<div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
				<div className="imagegen-pulse text-white" style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.35))" }}>
					<span className="icon-[solar--gallery-bold] block h-9 w-9" />
				</div>
				<span className="text-[11px] font-medium tracking-wide text-white" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.4)" }}>
					图像处理中
				</span>
			</div>
		</div>
	);
}

// ─── Horizontal version swiper ───

const SWIPER_ITEM = "h-64"; // 256px tall items; width auto by aspect ratio

/**
 * One image in the swiper. Hover reveals 编辑 / 导出 over the top-right corner.
 * The image the user picked for editing gets a thick primary border.
 */
function SwiperItem({
	ref,
	attached,
	onEdit,
	onLoad,
}: {
	ref: PluginImageRef;
	attached: boolean;
	onEdit: (ref: PluginImageRef) => void;
	onLoad: () => void;
}) {
	// Hover-only reveal via explicit pointer state (not Tailwind group-hover —
	// it's unreliable in this MF-remote CSS build). Icons hidden at rest.
	const [hover, setHover] = useState(false);
	return (
		<div
			onPointerEnter={() => setHover(true)}
			onPointerLeave={() => setHover(false)}
			className={`relative shrink-0 overflow-hidden rounded-xl ${attached ? "border-2" : "border"}`}
			style={{
				borderColor: attached ? "var(--primary)" : subtleBorder,
				boxShadow: attached ? "0 0 0 3px color-mix(in srgb, var(--primary) 28%, transparent)" : undefined,
			}}
		>
			<img
				src={ref.url}
				alt="生成的图像"
				onLoad={onLoad}
				onClick={() => pluginCtx?.ui.previewImage(ref)}
				className={`block w-auto cursor-zoom-in object-cover ${SWIPER_ITEM}`}
			/>
			<div
				className="absolute right-1.5 top-1.5 z-10 flex items-center gap-1.5"
				style={{ opacity: hover ? 1 : 0, pointerEvents: hover ? "auto" : "none", transition: "opacity 150ms" }}
			>
				<IconButton icon={<IconEdit className="h-3.5 w-3.5" />} title="编辑" onClick={() => onEdit(ref)} />
				<IconButton icon={<IconDownload className="h-3.5 w-3.5" />} title="导出" onClick={() => void downloadImage(ref)} />
			</div>
		</div>
	);
}

/**
 * Versions laid out left→right, NEWEST first. Overflows the row when there are
 * many; left/right chevrons scroll it. A leading "generating" skeleton is shown
 * at the front (and the row scrolls to the front) while a turn is producing the
 * next version.
 */
function ImageSwiper({
	versions,
	leadingSkeleton,
	attachedId,
	onEdit,
}: {
	versions: PluginImageRef[];
	leadingSkeleton: boolean;
	attachedId: string | null;
	onEdit: (ref: PluginImageRef) => void;
}) {
	const ordered = useMemo(() => [...versions].reverse(), [versions]); // newest first
	const scrollRef = useRef<HTMLDivElement>(null);
	const [overflow, setOverflow] = useState(false);

	const measure = (): void => {
		const el = scrollRef.current;
		if (el) setOverflow(el.scrollWidth - el.clientWidth > 2);
	};

	// Re-measure when the version set changes; keep the newest (front) in view.
	useEffect(() => {
		measure();
		scrollRef.current?.scrollTo({ left: 0, behavior: "smooth" });
	}, [ordered.length, leadingSkeleton]);

	useEffect(() => {
		const onResize = (): void => measure();
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, []);

	const scrollBy = (dir: -1 | 1): void => {
		scrollRef.current?.scrollBy({ left: dir * 220, behavior: "smooth" });
	};

	return (
		<div className="relative">
			<div ref={scrollRef} className="imagegen-swiper flex gap-2 overflow-x-auto scroll-smooth">
				{leadingSkeleton && <GenerationSkeleton className={`aspect-square ${SWIPER_ITEM}`} />}
				{ordered.map((ref) => (
					<SwiperItem
						key={ref.id}
						ref={ref}
						attached={ref.id === attachedId}
						onEdit={onEdit}
						onLoad={measure}
					/>
				))}
			</div>
			{overflow && (
				<>
					<ArrowButton dir="left" onClick={() => scrollBy(-1)} />
					<ArrowButton dir="right" onClick={() => scrollBy(1)} />
				</>
			)}
		</div>
	);
}

function ArrowButton({ dir, onClick }: { dir: "left" | "right"; onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			title={dir === "left" ? "上一张" : "下一张"}
			className={`absolute top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-white/90 backdrop-blur-md transition-colors hover:text-white ${dir === "left" ? "left-1" : "right-1"}`}
			style={{ background: "color-mix(in srgb, black 48%, transparent)" }}
		>
			<IconChevron dir={dir} className="h-4 w-4" />
		</button>
	);
}

// ─── Message slot: per-message preview card ───

function ImagePreviewCard({ message }: PluginMessageSlotProps) {
	const refs = message.imageRefs;
	const editingImageId = message.editingImageId;
	// While editing, the lineage anchors on the source image even before the new
	// version lands; otherwise on this message's own image.
	const baseId = editingImageId ?? refs?.[0]?.id;
	const lineage = useLineage(baseId);
	// Single source of truth for the highlight — the host edit-attachment atom.
	const attachedId = useEditImageAttachment()?.id ?? null;

	const versions = lineage.length > 0 ? lineage : (refs ?? []);
	const generating = Boolean(message.imageGenerating);

	// Toggle: clicking 编辑 on the already-attached image clears it; otherwise attach.
	const onEdit = (ref: PluginImageRef): void => {
		pluginCtx?.ui.setEditImageAttachment(ref.id === attachedId ? null : ref);
	};

	// In-flight edit: this turn is producing the next version — show the lineage
	// (the source's versions) with a leading "generating" skeleton at the front.
	if (generating && editingImageId) {
		return (
			<div className="flex flex-col gap-2 py-1">
				<ImageSwiper versions={versions} leadingSkeleton attachedId={attachedId} onEdit={onEdit} />
			</div>
		);
	}
	// Fresh generation (no edit target, nothing produced yet): standalone skeleton.
	if (generating && versions.length === 0) {
		return (
			<div className="py-1">
				<GenerationSkeleton />
			</div>
		);
	}
	if (versions.length === 0) return null;

	// Lineage dedup (works regardless of marker rootId — uses the backend lineage):
	// a lineage renders ONLY under the message that produced its LATEST version, so
	// earlier turns that were superseded by a later edit self-hide.
	const latestId = versions[versions.length - 1]?.id;
	const holdsLatest = (refs ?? []).some((r) => r.id === latestId);
	if (!generating && !holdsLatest) return null;

	return (
		<div className="flex flex-col gap-2 py-1">
			<ImageSwiper versions={versions} leadingSkeleton={generating} attachedId={attachedId} onEdit={onEdit} />
		</div>
	);
}

// ─── Activity tab: 生图历史 (all edit lineages in the current session) ───

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Agent session id = the UUID embedded in the session file path. */
function sessionIdFromPath(sessionPath: string | null): string | undefined {
	return sessionPath?.match(UUID_RE)?.[0];
}

function GenHistoryPanel() {
	const { sessionPath, isStreaming } = useActiveConversation();
	const sessionId = useMemo(() => sessionIdFromPath(sessionPath), [sessionPath]);
	const attachedId = useEditImageAttachment()?.id ?? null;
	const [lineages, setLineages] = useState<PluginImageRef[][]>([]);
	const reqId = useRef(0);

	const refetch = useCallback(() => {
		if (!sessionId || !pluginCtx) {
			setLineages([]);
			return;
		}
		const my = ++reqId.current;
		void pluginCtx.images
			.sessionLineages(sessionId)
			.then((result) => {
				if (my === reqId.current) setLineages(result);
			})
			.catch(() => {
				if (my === reqId.current) setLineages([]);
			});
	}, [sessionId]);

	useEffect(() => {
		refetch();
	}, [refetch]);

	// A turn just finished — a new image may have landed; refresh.
	const wasStreaming = useRef(isStreaming);
	useEffect(() => {
		if (wasStreaming.current && !isStreaming) refetch();
		wasStreaming.current = isStreaming;
	}, [isStreaming, refetch]);

	const onEdit = (ref: PluginImageRef): void => {
		pluginCtx?.ui.setEditImageAttachment(ref.id === attachedId ? null : ref);
	};

	return (
		<div className="flex h-full flex-col overflow-hidden">
			<div className="flex items-center justify-between border-b px-3 py-2" style={{ borderColor: subtleBorder }}>
				<span className="text-[12px] font-semibold text-foreground/80">
					生图历史{lineages.length > 0 ? ` · ${lineages.length} 组` : ""}
				</span>
				<button
					type="button"
					onClick={() => refetch()}
					title="刷新"
					className="flex h-6 w-6 items-center justify-center rounded-md text-foreground/55 transition-colors hover:text-foreground"
					style={{ background: "color-mix(in srgb, var(--foreground) 6%, transparent)" }}
				>
					<IconRefresh className="h-3.5 w-3.5" />
				</button>
			</div>
			{lineages.length === 0 ? (
				<div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
					<div className="imagegen-pulse" style={{ color: "var(--muted-foreground)" }}>
						<IconImage className="h-10 w-10" />
					</div>
					<p className="text-[13px]" style={{ color: "var(--muted-foreground)" }}>
						{sessionId
							? "本会话还没有生成图像。开启输入栏「图像生成」后发一条提示词试试。"
							: "未检测到当前会话，先打开一个对话。"}
					</p>
				</div>
			) : (
				<div className="flex flex-1 flex-col gap-4 overflow-y-auto p-3">
					{lineages.map((versions, i) => (
						<div key={versions[0]?.id ?? i} className="flex flex-col gap-1.5">
							<div className="flex items-center justify-between px-0.5">
								<span className="text-[11px] font-medium" style={{ color: "var(--muted-foreground)" }}>
									图片组 {lineages.length - i}
								</span>
								<span className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>
									{versions.length} 张
								</span>
							</div>
							<ImageSwiper versions={versions} leadingSkeleton={false} attachedId={attachedId} onEdit={onEdit} />
						</div>
					))}
				</div>
			)}
		</div>
	);
}

export default definePlugin({
	activate(ctx) {
		// NOTE: pluginCtx is intentionally never nulled in deactivate(). Under React
		// StrictMode the host double-invokes load/dispose; a racing deactivate()
		// could run after re-activate() and permanently null the ctx live components
		// read, breaking 编辑/生成. The next activate() re-sets it.
		pluginCtx = ctx;
		ctx.ui.registerInputAction({
			id: "image-mode",
			label: "图像生成",
			icon: <IconImage className="h-3.5 w-3.5" />,
			decoratePrompt: () => ({ metadata: { imageMode: true } }),
		});
		ctx.ui.registerMessageSlot({ id: "preview", component: ImagePreviewCard });
		ctx.ui.registerActivityTab({
			id: "history",
			label: "生图历史",
			icon: <IconImage className="h-4 w-4" />,
			component: GenHistoryPanel,
		});
	},
});

import { useEffect, useMemo, useRef, useState } from "react";
import { useSkottie } from "./LottieStage";
import { resolveControls, validateLottie } from "./lottie";
import { SlotPanel } from "./SlotPanel";
import { Transport } from "./Transport";
import type { LottieDocument } from "./types";
import { ZoomCanvas } from "./ZoomCanvas";

interface LottieStudioViewProps {
	/** Raw bodymovin JSON text — the source of truth for rendering. */
	jsonText: string;
	/** Persist edited JSON (slot changes). Omit for read-only previews. */
	onSave?: (text: string) => void;
}

const SAVE_DEBOUNCE_MS = 400;

/**
 * Shared composition: zoomable Skottie stage + a floating, toggleable slot
 * editor. Used by both the activity-panel tab and the .lottie file preview.
 * Slot edits patch an in-memory doc and persist via `onSave`; they never
 * rebuild the animation (which would reset playback).
 */
export function LottieStudioView({ jsonText, onSave }: LottieStudioViewProps) {
	const parsed = useMemo(() => validateLottie(jsonText), [jsonText]);
	const skottie = useSkottie(jsonText);
	const { controller } = skottie;
	const [panelOpen, setPanelOpen] = useState(false);

	const docRef = useRef<LottieDocument | null>(parsed.doc ?? null);
	docRef.current = parsed.doc ?? null;

	const controls = useMemo(
		() => (controller.anim && docRef.current ? resolveControls(docRef.current, controller.anim.getSlotInfo()) : []),
		[controller.anim],
	);

	const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(
		() => () => {
			if (saveTimer.current) clearTimeout(saveTimer.current);
		},
		[],
	);

	const handleSlotChange = (): void => {
		if (!onSave || !docRef.current) return;
		const doc = docRef.current;
		if (saveTimer.current) clearTimeout(saveTimer.current);
		saveTimer.current = setTimeout(() => onSave(JSON.stringify(doc)), SAVE_DEBOUNCE_MS);
	};

	if (!parsed.ok) {
		return (
			<div className="flex h-full items-center justify-center p-6 text-center text-[13px]" style={{ color: "var(--destructive, #ef4444)" }}>
				{parsed.error}
			</div>
		);
	}

	const hasControls = controls.length > 0;

	return (
		<div className="flex h-full min-h-0 flex-col">
			<ZoomCanvas
				canvasRef={controller.canvasRef}
				naturalSize={{ w: controller.width, h: controller.height }}
				ready={controller.ready}
				error={controller.error}
				topRight={
					hasControls ? (
						<button
							type="button"
							title="可调属性"
							onClick={() => setPanelOpen((o) => !o)}
							className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium backdrop-blur-md transition-colors"
							style={{
								background: panelOpen ? "var(--primary)" : "color-mix(in srgb, var(--background) 78%, transparent)",
								color: panelOpen ? "var(--primary-foreground)" : "var(--foreground)",
								border: "1px solid color-mix(in srgb, var(--foreground) 12%, transparent)",
							}}
						>
							<svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
								<path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h8M16 18h4" />
								<circle cx="15" cy="6" r="2" /><circle cx="7" cy="12" r="2" /><circle cx="13" cy="18" r="2" />
							</svg>
							属性
							<span className="tabular-nums opacity-70">{controls.length}</span>
						</button>
					) : undefined
				}
			>
				{hasControls && panelOpen && controller.anim && docRef.current && (
					<div
						className="lottie-studio-pop absolute right-2.5 top-[3.25rem] z-20 flex max-h-[calc(100%-4.5rem)] w-[16rem] flex-col overflow-hidden rounded-xl shadow-2xl backdrop-blur-xl"
						style={{
							background: "color-mix(in srgb, var(--background) 88%, transparent)",
							border: "1px solid color-mix(in srgb, var(--foreground) 12%, transparent)",
						}}
					>
						<div
							className="flex items-center justify-between px-3 py-2"
							style={{ borderBottom: "1px solid color-mix(in srgb, var(--foreground) 9%, transparent)" }}
						>
							<span className="text-[11px] font-semibold" style={{ color: "var(--foreground)" }}>
								可调属性
							</span>
							<button
								type="button"
								title="收起"
								onClick={() => setPanelOpen(false)}
								className="flex h-5 w-5 items-center justify-center rounded-md transition-colors hover:text-foreground"
								style={{ color: "var(--muted-foreground)" }}
							>
								<svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
							</button>
						</div>
						<div className="overflow-y-auto p-3">
							<SlotPanel controls={controls} anim={controller.anim} doc={docRef.current} onChange={handleSlotChange} redraw={controller.redraw} />
						</div>
					</div>
				)}
			</ZoomCanvas>
			<Transport
				playing={skottie.playing}
				setPlaying={skottie.setPlaying}
				totalFrames={skottie.totalFrames}
				seek={skottie.seek}
				subscribeTick={skottie.subscribeTick}
				ready={controller.ready}
			/>
		</div>
	);
}

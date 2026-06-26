import { WindowResizeHandles } from "./WindowResizeHandles";

type DebugTone = "window" | "video";

function getDebugToneClass(tone: DebugTone): string {
	return tone === "window" ? "border-primary bg-primary shadow-md" : "border-amber-500 bg-amber-400 shadow-md";
}

function DebugCorners({ tone }: { tone: DebugTone }): JSX.Element {
	const baseClass = `absolute size-2 border ${getDebugToneClass(tone)}`;

	return (
		<>
			<span className={`${baseClass} left-0 top-0`} />
			<span className={`${baseClass} right-0 top-0`} />
			<span className={`${baseClass} bottom-0 left-0`} />
			<span className={`${baseClass} bottom-0 right-0`} />
		</>
	);
}

function DebugBorder({ tone, viewport = false }: { tone: DebugTone; viewport?: boolean }): JSX.Element {
	const borderClass = tone === "window" ? "border-primary" : "border-amber-500";
	if (viewport) {
		return (
			<div className="pointer-events-none fixed inset-0 z-20 overflow-hidden">
				<div
					className={`absolute box-border border ${borderClass}`}
					style={{ inset: 1 }}
				>
					<DebugCorners tone={tone} />
				</div>
			</div>
		);
	}

	return (
		<div className={`pointer-events-none absolute inset-0 z-20 box-border border ${borderClass}`}>
			<DebugCorners tone={tone} />
		</div>
	);
}

function SizePanel({
	windowSize,
	videoSize,
}: {
	windowSize: { width: number; height: number };
	videoSize: { width: number; height: number };
}): JSX.Element {
	return (
		<div
			className="no-drag absolute left-2 top-2 z-50 rounded-md border border-border/50 bg-popover/80 p-1 text-[10px] font-medium leading-4 text-popover-foreground shadow-lg"
			onPointerDown={(event) => event.stopPropagation()}
		>
			<div className="px-1.5 py-0.5 tabular-nums">
				{Math.round(windowSize.width)} x {Math.round(windowSize.height)}
			</div>
			<div className="px-1.5 py-0.5 tabular-nums">
				{videoSize.width} x {videoSize.height}
			</div>
		</div>
	);
}

export function PetDebugOverlay({
	debugFrame,
	videoSize,
	windowSize,
	onWindowSizeChange,
}: {
	debugFrame: boolean;
	videoSize: { width: number; height: number };
	windowSize: { width: number; height: number };
	onWindowSizeChange: (size: number) => void;
}): JSX.Element | null {
	if (!debugFrame) return null;

	return (
		<>
			<WindowResizeHandles
				onSizeChange={onWindowSizeChange}
				size={windowSize.width}
			/>
			<DebugBorder
				tone="window"
				viewport
			/>
			<SizePanel
				windowSize={windowSize}
				videoSize={videoSize}
			/>
		</>
	);
}

export function PetVideoDebugBorder({ debugFrame }: { debugFrame: boolean }): JSX.Element | null {
	if (!debugFrame) return null;
	return <DebugBorder tone="video" />;
}

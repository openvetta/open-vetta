import { useEffect, useRef } from "react";
import { IconPause, IconPlay } from "./icons";
import type { SkottieResult } from "./LottieStage";

type TransportProps = Pick<SkottieResult, "playing" | "setPlaying" | "totalFrames" | "seek" | "subscribeTick"> & {
	ready: boolean;
};

/**
 * Play/pause + scrubber. The scrubber and frame label are updated IMPERATIVELY
 * from the tick subscription (DOM writes only), so playback is buttery-smooth
 * and never re-renders the React tree.
 */
export function Transport({ playing, setPlaying, totalFrames, seek, subscribeTick, ready }: TransportProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const labelRef = useRef<HTMLSpanElement>(null);
	const max = Math.max(0, totalFrames - 1);

	useEffect(() => {
		return subscribeTick((frame) => {
			const f = Math.floor(frame);
			const input = inputRef.current;
			if (input && document.activeElement !== input) {
				input.value = String(f);
				input.style.setProperty("--pct", `${max > 0 ? (f / max) * 100 : 0}`);
			}
			if (labelRef.current) labelRef.current.textContent = `${f} / ${max}`;
		});
	}, [subscribeTick, max]);

	return (
		<div
			className="flex items-center gap-3 px-3 py-2.5"
			style={{ borderTop: "1px solid color-mix(in srgb, var(--foreground) 9%, transparent)" }}
		>
			<button
				type="button"
				title={playing ? "暂停" : "播放"}
				disabled={!ready}
				onClick={() => setPlaying(!playing)}
				className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-95 disabled:opacity-40"
				style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
			>
				{playing ? <IconPause className="h-4 w-4" /> : <IconPlay className="h-4 w-4 translate-x-px" />}
			</button>
			<input
				ref={inputRef}
				type="range"
				min={0}
				max={max}
				step={1}
				defaultValue={0}
				disabled={!ready}
				onChange={(e) => {
					setPlaying(false);
					const v = Number(e.target.value);
					e.target.style.setProperty("--pct", `${max > 0 ? (v / max) * 100 : 0}`);
					seek(v);
				}}
				className="ls-range flex-1"
			/>
			<span ref={labelRef} className="w-[4.5rem] shrink-0 text-right text-[11px] tabular-nums" style={{ color: "var(--muted-foreground)" }}>
				0 / {max}
			</span>
		</div>
	);
}

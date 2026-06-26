import { useState } from "react";
import type { ManagedSkottieAnimation } from "canvaskit-wasm/full";
import { applySlotValue, hexToRgb, rgbaToHex } from "./lottie";
import type { LottieDocument, SlotControl } from "./types";

interface SlotPanelProps {
	controls: SlotControl[];
	anim: ManagedSkottieAnimation;
	doc: LottieDocument;
	/** Persist the patched document (debounced by the caller). */
	onChange: () => void;
	/** Re-draw the current frame after a live edit. */
	redraw: () => void;
}

const subtle = "color-mix(in srgb, var(--foreground) 12%, transparent)";
const inputCls =
	"w-full rounded-lg border bg-transparent px-2.5 py-1.5 text-[12px] tabular-nums outline-none transition-colors focus:border-[var(--primary)]";

const pct = (v: number, min: number, max: number): number => (max > min ? ((v - min) / (max - min)) * 100 : 0);

export function SlotPanel({ controls, anim, doc, onChange, redraw }: SlotPanelProps) {
	return (
		<div className="flex flex-col gap-3.5">
			{controls.map((control) => (
				<div key={`${control.kind}:${control.sid}`} className="flex flex-col gap-1.5">
					<span className="text-[11px] font-medium" style={{ color: "var(--muted-foreground)" }}>
						{control.label}
					</span>
					{control.kind === "color" && <ColorControl control={control} anim={anim} doc={doc} onChange={onChange} redraw={redraw} />}
					{control.kind === "scalar" && <ScalarControl control={control} anim={anim} doc={doc} onChange={onChange} redraw={redraw} />}
					{control.kind === "vec2" && <Vec2Control control={control} anim={anim} doc={doc} onChange={onChange} redraw={redraw} />}
					{control.kind === "text" && <TextControl control={control} anim={anim} doc={doc} onChange={onChange} redraw={redraw} />}
				</div>
			))}
		</div>
	);
}

type ControlProps = { control: SlotControl } & Omit<SlotPanelProps, "controls">;

function setPct(el: HTMLInputElement, value: number, min: number, max: number): void {
	el.style.setProperty("--pct", `${pct(value, min, max)}`);
}

function ColorControl({ control, anim, doc, onChange, redraw }: ControlProps) {
	const initial = anim.getColorSlot(control.sid);
	const [hex, setHex] = useState(() => rgbaToHex(initial));
	const [alpha, setAlpha] = useState(() => (initial && initial.length > 3 ? initial[3] : 1));

	const commit = (nextHex: string, nextAlpha: number): void => {
		const [r, g, b] = hexToRgb(nextHex);
		const rgba = [r, g, b, nextAlpha];
		anim.setColorSlot(control.sid, rgba);
		applySlotValue(doc, control.sid, "color", rgba);
		redraw();
		onChange();
	};

	return (
		<div className="flex items-center gap-2.5">
			<label
				className="relative h-7 w-9 shrink-0 overflow-hidden rounded-lg border"
				style={{ borderColor: subtle }}
				title="颜色"
			>
				<input
					type="color"
					value={hex}
					onChange={(e) => {
						setHex(e.target.value);
						commit(e.target.value, alpha);
					}}
					className="absolute inset-[-4px] h-[calc(100%+8px)] w-[calc(100%+8px)] cursor-pointer"
				/>
			</label>
			<input
				type="range"
				min={0}
				max={1}
				step={0.01}
				defaultValue={alpha}
				title="透明度"
				ref={(el) => {
					if (el) setPct(el, alpha, 0, 1);
				}}
				onChange={(e) => {
					const a = Number(e.target.value);
					setAlpha(a);
					setPct(e.target, a, 0, 1);
					commit(hex, a);
				}}
				className="ls-range flex-1"
			/>
		</div>
	);
}

function ScalarControl({ control, anim, doc, onChange, redraw }: ControlProps) {
	const [value, setValue] = useState(() => anim.getScalarSlot(control.sid) ?? 0);
	const hint = control.hint;
	const hasRange = typeof hint?.min === "number" && typeof hint?.max === "number";
	const min = hint?.min ?? 0;
	const max = hint?.max ?? 1;

	const commit = (next: number): void => {
		setValue(next);
		anim.setScalarSlot(control.sid, next);
		applySlotValue(doc, control.sid, "scalar", next);
		redraw();
		onChange();
	};

	return (
		<div className="flex items-center gap-2.5">
			{hasRange && (
				<input
					type="range"
					min={min}
					max={max}
					step={hint?.step ?? 0.01}
					defaultValue={value}
					ref={(el) => {
						if (el) setPct(el, value, min, max);
					}}
					onChange={(e) => {
						const v = Number(e.target.value);
						setPct(e.target, v, min, max);
						commit(v);
					}}
					className="ls-range flex-1"
				/>
			)}
			<input
				type="number"
				value={value}
				step={hint?.step ?? "any"}
				onChange={(e) => commit(Number(e.target.value))}
				className={`${hasRange ? "w-20" : "w-full"} ${inputCls}`}
				style={{ borderColor: subtle }}
			/>
		</div>
	);
}

function Vec2Control({ control, anim, doc, onChange, redraw }: ControlProps) {
	const initial = anim.getVec2Slot(control.sid);
	const [x, setX] = useState(() => initial?.[0] ?? 0);
	const [y, setY] = useState(() => initial?.[1] ?? 0);

	const commit = (nx: number, ny: number): void => {
		const vec = [nx, ny];
		anim.setVec2Slot(control.sid, vec);
		applySlotValue(doc, control.sid, "vec2", vec);
		redraw();
		onChange();
	};

	return (
		<div className="flex items-center gap-2">
			<input
				type="number"
				value={x}
				step="any"
				title="X"
				onChange={(e) => {
					const nx = Number(e.target.value);
					setX(nx);
					commit(nx, y);
				}}
				className={inputCls}
				style={{ borderColor: subtle }}
			/>
			<input
				type="number"
				value={y}
				step="any"
				title="Y"
				onChange={(e) => {
					const ny = Number(e.target.value);
					setY(ny);
					commit(x, ny);
				}}
				className={inputCls}
				style={{ borderColor: subtle }}
			/>
		</div>
	);
}

function TextControl({ control, anim, doc, onChange, redraw }: ControlProps) {
	const [text, setText] = useState(() => anim.getTextSlot(control.sid)?.text ?? "");

	const commit = (next: string): void => {
		setText(next);
		anim.setTextSlot(control.sid, { text: next });
		applySlotValue(doc, control.sid, "text", next);
		redraw();
		onChange();
	};

	return (
		<input
			type="text"
			value={text}
			onChange={(e) => commit(e.target.value)}
			className={inputCls}
			style={{ borderColor: subtle }}
		/>
	);
}

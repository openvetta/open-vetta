import { PipetteIcon } from "lucide-react";
import {
	type CSSProperties,
	type JSX,
	type KeyboardEvent,
	type PointerEvent,
	type Ref,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { hsvToRgb, hueColor, isSameColor, normalizeColor, parseColor, rgbToHsv, toHex } from "./color";
import { INPUT_FILL_CLASS } from "./input";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { cn } from "./utils";

/**
 * 色点选择器：一排圆形色块，选中项用一圈同色描边标出，下方显示当前颜色名。
 *
 * 可选“自定义颜色”：末尾多一枚彩虹色点，点开是宿主的取色面板（支持吸取屏幕颜色、
 * 色相 / 明度拖拽、粘贴 hex / rgb() / hsl()）。面板不提供 alpha，颜色一律以
 * `#rrggbb` 回写，避免同一份数据在不同插件里出现两种写法。
 *
 * 纯展示 + 受控：预设、文案、选中值都由调用方给，组件只负责交互与视觉。
 */

export type ColorSwatchSize = "sm" | "default";

export interface ColorSwatchOption {
	/** 颜色值，支持 `#rgb` / `#rrggbb` / `rgb()` / `hsl()`；内部统一规范到 `#rrggbb`。 */
	value: string;
	/** 无障碍名与下方标签显示的名字，如「蓝色」。 */
	label: string;
}

export interface ColorSwatchPickerLabels {
	/** 分组标题，如「颜色」。省略不渲染标题。 */
	title?: string;
	/** 色点组的无障碍名。 */
	group?: string;
	/** 自定义色点的名字，同时用作面板标题。 */
	custom?: string;
	/** 取色面板里数值输入框的无障碍名。 */
	valueInput?: string;
	/** 输入无法识别时的提示。 */
	invalid?: string;
	/** 色相滑轨的无障碍名。 */
	hue?: string;
	/** 明度 / 饱和度选区的无障碍名。 */
	area?: string;
	/** 吸管按钮的无障碍名与悬停提示。 */
	eyedropper?: string;
}

export interface ColorSwatchPickerProps {
	/** 当前选中颜色（任意受支持写法皆可）。未选中传 null。 */
	value: string | null;
	/** 选中回调：点预设、在面板里拖动或输入，都回传规范化的 `#rrggbb`。 */
	onChange(value: string | null): void;
	options: readonly ColorSwatchOption[];
	/** 允许用户自己挑颜色：末尾多一枚可点开的自定义色点。 */
	allowCustom?: boolean;
	/**
	 * 是否在色点下方显示当前颜色名。缺省 `true`；外层已经有「颜色」这类标题时
	 * （例如设置页的一行设置项）传 `false`，免得同一信息说两遍。
	 */
	showLabel?: boolean;
	/**
	 * 额外排在最前面的「默认 / 跟随主题」选项：选中它时回传 null。
	 * 用于「不指定颜色、跟随宿主主题」这类语义——色点本身不涂颜色，只有一圈中性底。
	 */
	defaultOption?: { label: string };
	/** 自定义色点的初始颜色；缺省取第一个预设。 */
	customFallback?: string;
	disabled?: boolean;
	size?: ColorSwatchSize;
	className?: string;
	labels?: ColorSwatchPickerLabels;
}

const DEFAULT_LABELS: Required<ColorSwatchPickerLabels> = {
	title: "Color",
	group: "Color",
	custom: "Custom",
	valueInput: "Color value",
	invalid: "Unrecognized color",
	hue: "Hue",
	area: "Saturation and brightness",
	eyedropper: "Pick a color from screen",
};

// 同色圈 + 一圈极淡中性影：白色或浅色预设的圈在浅底上否则会看不见。
const RING_SHADOW = "0 0 0 2px var(--swatch-color), 0 0 0 3px rgb(0 0 0 / 0.08)";
const DOT_SHADOW = "inset 0 0 0 1px rgb(0 0 0 / 0.12), 0 3px 8px rgb(0 0 0 / 0.18)";

function resolved(value: string): string {
	return normalizeColor(value) ?? value.trim();
}

interface SwatchDotProps {
	/** PopoverTrigger asChild 会塞进来；必须落到 button 上，否则浮层拿不到锚点会定位到屏幕外。 */
	ref?: Ref<HTMLButtonElement>;
	color: string | null;
	selected: boolean;
	label: string;
	size: ColorSwatchSize;
	disabled: boolean;
	rainbow?: boolean;
	/** 无颜色的「默认」位：环内空着，用中性底色表示“不指定”。 */
	hollow?: boolean;
	onSelect(): void;
	onKeyDown(event: KeyboardEvent<HTMLButtonElement>): void;
	tabIndex: number;
}

function SwatchDot({
	ref,
	color,
	selected,
	label,
	size,
	disabled,
	rainbow,
	hollow,
	onSelect,
	onKeyDown,
	tabIndex,
}: SwatchDotProps): JSX.Element {
	return (
		<button
			ref={ref}
			type="button"
			role="radio"
			aria-checked={selected}
			aria-label={label}
			disabled={disabled}
			tabIndex={disabled ? -1 : tabIndex}
			onClick={onSelect}
			onKeyDown={onKeyDown}
			className={cn(
				"group relative grid shrink-0 place-items-center rounded-full transition-transform duration-200 ease-out",
				"hover:scale-110 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40",
				size === "sm" ? "size-6" : "size-[30px]",
			)}
			style={{ "--swatch-color": color ?? "transparent" } as CSSProperties}
		>
			{/* 选中圈：同色描边，从略小处弹出，用尺寸与透明度两段过渡代替线条反差。 */}
			<span
				aria-hidden="true"
				className={cn(
					"pointer-events-none absolute inset-0 rounded-full transition-[transform,opacity] duration-300 ease-out",
					selected ? "scale-100 opacity-100" : "scale-75 opacity-0 group-focus-visible:scale-90 group-focus-visible:opacity-40",
				)}
				style={{ boxShadow: RING_SHADOW }}
			/>
			<span
				aria-hidden="true"
				className={cn(
					"rounded-full transition-transform duration-300 ease-out",
					size === "sm" ? "size-4" : "size-5",
					selected && "scale-[0.82]",
				)}
				style={
					rainbow
						? {
								background:
									"conic-gradient(from 210deg, #ff375f, #ff9f0a, #ffd60a, #34c759, #32ade6, #0071e3, #af52de, #ff375f)",
								boxShadow: DOT_SHADOW,
							}
						: hollow
							? {
									background: "var(--muted)",
									boxShadow: "inset 0 0 0 1.5px var(--border)",
								}
							: { background: color ?? "transparent", boxShadow: DOT_SHADOW }
				}
			/>
		</button>
	);
}

export interface ColorPickerPanelProps {
	/** 面板的当前颜色（`#rrggbb`）。 */
	value: string;
	/** 拖动 / 输入 / 吸色时实时回调。 */
	onChange(value: string): void;
	labels?: ColorSwatchPickerLabels;
	className?: string;
}

interface EyeDropperResult {
	sRGBHex: string;
}

interface EyeDropperConstructor {
	new (): { open(): Promise<EyeDropperResult> };
}

function getEyeDropper(): EyeDropperConstructor | null {
	if (typeof window === "undefined") return null;
	const ctor = (window as Window & { EyeDropper?: EyeDropperConstructor }).EyeDropper;
	return typeof ctor === "function" ? ctor : null;
}

/** 色相 → `hsl()` 串，给滑轨铺底色。 */
function hueGradient(): string {
	const stops = [0, 60, 120, 180, 240, 300, 360].map((hue) => `${hueColor(hue)} ${(hue / 360) * 100}%`);
	return `linear-gradient(to right, ${stops.join(", ")})`;
}

/**
 * 取色面板本体（无弹层外壳）：明度 / 饱和度选区、色相滑轨、吸管与数值输入。
 * 去线留白：不用边框分隔，靠留白、圆角与底色分层。单独使用时应放进浮层里。
 */
export function ColorPickerPanel({ value, onChange, labels, className }: ColorPickerPanelProps): JSX.Element {
	const text = { ...DEFAULT_LABELS, ...labels };
	const current = resolved(value);
	const areaRef = useRef<HTMLDivElement>(null);
	const [hue, setHue] = useState(() => rgbToHsv(parseColor(current) ?? { r: 0, g: 0, b: 0 }).h);
	const [draft, setDraft] = useState(current);
	const [invalid, setInvalid] = useState(false);
	const dropper = getEyeDropper();

	const rgb = parseColor(current) ?? { r: 0, g: 0, b: 0 };
	const hsv = rgbToHsv(rgb);

	// 外部改值（点预设、撤销外部状态）时同步色相；灰色没有色相，保留用户手上那一档，
	// 否则拖到黑色就会跳回红。
	useEffect(() => {
		setDraft(current);
		setInvalid(false);
		const next = parseColor(current);
		if (!next) return;
		const nextHsv = rgbToHsv(next);
		if (nextHsv.s > 0 && nextHsv.v > 0) setHue(nextHsv.h);
	}, [current]);

	const emitHsv = useCallback(
		(next: { h: number; s: number; v: number }) => {
			onChange(toHex(hsvToRgb(next)));
		},
		[onChange],
	);

	const applyPosition = (clientX: number, clientY: number) => {
		const box = areaRef.current?.getBoundingClientRect();
		if (!box || box.width === 0 || box.height === 0) return;
		const s = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
		const v = 1 - Math.min(1, Math.max(0, (clientY - box.top) / box.height));
		emitHsv({ h: hue, s, v });
	};

	const handleAreaPointerDown = (event: PointerEvent<HTMLDivElement>) => {
		event.currentTarget.setPointerCapture(event.pointerId);
		applyPosition(event.clientX, event.clientY);
	};

	const handleAreaPointerMove = (event: PointerEvent<HTMLDivElement>) => {
		if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
		applyPosition(event.clientX, event.clientY);
	};

	const handleAreaKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		const step = event.shiftKey ? 0.1 : 0.02;
		if (event.key === "ArrowLeft") emitHsv({ h: hue, s: hsv.s - step, v: hsv.v });
		else if (event.key === "ArrowRight") emitHsv({ h: hue, s: hsv.s + step, v: hsv.v });
		else if (event.key === "ArrowUp") emitHsv({ h: hue, s: hsv.s, v: hsv.v + step });
		else if (event.key === "ArrowDown") emitHsv({ h: hue, s: hsv.s, v: hsv.v - step });
		else return;
		event.preventDefault();
	};

	const commitDraft = () => {
		const next = normalizeColor(draft);
		if (!next) {
			setInvalid(true);
			return;
		}
		setInvalid(false);
		if (next !== current) onChange(next);
	};

	const pickFromScreen = async () => {
		if (!dropper) return;
		try {
			const result = await new dropper().open();
			const next = normalizeColor(result.sRGBHex);
			if (next) onChange(next);
		} catch {
			// 用户按 Esc 取消：什么都没发生，不需要报错。
		}
	};

	return (
		<div data-slot="color-picker" className={cn("flex w-60 flex-col gap-3 p-1", className)}>
			<div
				ref={areaRef}
				role="group"
				tabIndex={0}
				aria-label={text.area}
				aria-valuetext={current}
				onPointerDown={handleAreaPointerDown}
				onPointerMove={handleAreaPointerMove}
				onKeyDown={handleAreaKeyDown}
				className="relative h-32 w-full cursor-crosshair touch-none overflow-hidden rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
				style={{
					backgroundColor: hueColor(hue),
					backgroundImage:
						"linear-gradient(to top, #000, rgb(0 0 0 / 0)), linear-gradient(to right, #fff, rgb(255 255 255 / 0))",
				}}
			>
				<span
					aria-hidden="true"
					className="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_1.5px_rgb(0_0_0/0.18),0_2px_6px_rgb(0_0_0/0.28)]"
					style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
				/>
			</div>

			<input
				type="range"
				min={0}
				max={360}
				step={1}
				value={Math.round(hue)}
				aria-label={text.hue}
				onChange={(event) => {
					const nextHue = Number(event.target.value);
					setHue(nextHue);
					emitHsv({ h: nextHue, s: hsv.s, v: hsv.v });
				}}
				className={cn(
					"h-2 w-full cursor-pointer appearance-none rounded-full outline-none",
					"focus-visible:ring-2 focus-visible:ring-primary/40",
					"[&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full",
					"[&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_0_0_1.5px_rgb(0_0_0/0.18),0_2px_6px_rgb(0_0_0/0.3)]",
				)}
				style={{ backgroundImage: hueGradient() }}
			/>

			<div className="flex items-center gap-2">
				<span
					aria-hidden="true"
					className="size-7 shrink-0 rounded-lg shadow-[inset_0_0_0_1px_rgb(0_0_0/0.1)]"
					style={{ background: current }}
				/>
				<input
					type="text"
					spellCheck={false}
					aria-label={text.valueInput}
					aria-invalid={invalid || undefined}
					title={invalid ? text.invalid : undefined}
					value={draft}
					onChange={(event) => {
						setDraft(event.target.value);
						setInvalid(false);
					}}
					onBlur={commitDraft}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							commitDraft();
						}
						if (event.key === "Escape") {
							setDraft(current);
							setInvalid(false);
						}
					}}
					className={cn(
						INPUT_FILL_CLASS,
						"h-7 min-w-0 flex-1 px-2 font-mono tabular-nums",
						invalid && "ring-1 ring-destructive/50",
					)}
				/>
				{dropper ? (
					<button
						type="button"
						aria-label={text.eyedropper}
						title={text.eyedropper}
						onClick={() => void pickFromScreen()}
						className="grid size-7 shrink-0 place-items-center rounded-lg text-foreground/70 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
					>
						<PipetteIcon aria-hidden="true" className="size-4" />
					</button>
				) : null}
			</div>
		</div>
	);
}

export function ColorSwatchPicker({
	value,
	onChange,
	options,
	allowCustom = false,
	defaultOption,
	showLabel = true,
	customFallback,
	disabled = false,
	size = "default",
	className,
	labels,
}: ColorSwatchPickerProps): JSX.Element {
	const text = { ...DEFAULT_LABELS, ...labels };
	const [customColor, setCustomColor] = useState<string | null>(null);
	const [open, setOpen] = useState(false);

	const hasDefault = Boolean(defaultOption);
	const selectedIndex = options.findIndex((option) => isSameColor(option.value, value));
	const isDefaultSelected = hasDefault && !value;
	const isCustomSelected = allowCustom && selectedIndex === -1 && Boolean(value);

	// 色点在栏里的顺序：[默认] + 预设 + [自定义]；index 直接用这个顺序，键盘与焦点都好算。
	const offset = hasDefault ? 1 : 0;
	const customIndex = offset + options.length;
	const dotCount = customIndex + (allowCustom ? 1 : 0);

	const currentName = isDefaultSelected
		? defaultOption?.label
		: selectedIndex >= 0
			? options[selectedIndex]?.label
			: value
				? resolved(value)
				: null;
	const panelValue = customColor ?? value ?? customFallback ?? options[0]?.value ?? "#8ec5ff";

	const activeIndex = isDefaultSelected
		? 0
		: selectedIndex >= 0
			? selectedIndex + offset
			: isCustomSelected
				? customIndex
				: 0;

	const selectByIndex = (index: number) => {
		if (index < 0 || index >= dotCount) return;
		if (hasDefault && index === 0) {
			setOpen(false);
			onChange(null);
			return;
		}
		if (index < customIndex) {
			const option = options[index - offset];
			if (!option) return;
			setOpen(false);
			onChange(resolved(option.value));
			return;
		}
		// 自定义位：已经挑过颜色就直接选中它，没挑过就打开面板。
		if (customColor) {
			onChange(customColor);
			setOpen(false);
			return;
		}
		setOpen(true);
	};

	const handleKeyDown = (index: number) => (event: KeyboardEvent<HTMLButtonElement>) => {
		const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
		if (!keys.includes(event.key)) return;
		event.preventDefault();
		const next =
			event.key === "Home"
				? 0
				: event.key === "End"
					? dotCount - 1
					: event.key === "ArrowRight" || event.key === "ArrowDown"
						? (index + 1) % dotCount
						: (index - 1 + dotCount) % dotCount;
		const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button");
		buttons?.[next]?.focus();
		// 有颜色的位顺带选中；自定义位只移焦，免得方向键一路划过就弹面板。
		if (next !== customIndex || !allowCustom) selectByIndex(next);
	};

	return (
		<div className={cn("flex flex-col items-center gap-2", className)}>
			{labels?.title === "" ? null : (
				<span className="text-[10px] font-semibold tracking-[0.08em] text-muted-foreground/70 uppercase">
					{text.title}
				</span>
			)}
			<div
				role="radiogroup"
				aria-label={text.group}
				aria-orientation="horizontal"
				className="flex flex-wrap items-center justify-center gap-1.5"
			>
				{hasDefault ? (
					<SwatchDot
						hollow
						color={null}
						label={defaultOption?.label ?? text.group}
						size={size}
						disabled={disabled}
						selected={isDefaultSelected}
						onSelect={() => selectByIndex(0)}
						onKeyDown={handleKeyDown(0)}
						tabIndex={activeIndex === 0 ? 0 : -1}
					/>
				) : null}
				{options.map((option, index) => {
					const dotIndex = index + offset;
					return (
						<SwatchDot
							key={`${option.value}-${index}`}
							color={resolved(option.value)}
							label={option.label}
							size={size}
							disabled={disabled}
							selected={selectedIndex === index}
							onSelect={() => selectByIndex(dotIndex)}
							onKeyDown={handleKeyDown(dotIndex)}
							tabIndex={activeIndex === dotIndex ? 0 : -1}
						/>
					);
				})}
				{allowCustom ? (
					<Popover open={open} onOpenChange={setOpen}>
						<PopoverTrigger asChild>
							<SwatchDot
								/* 选中的自定义色优先；没有就回落到当前值（例如宿主回填的、不在预设里的颜色）。 */
								color={customColor ?? (isCustomSelected ? resolved(value as string) : null)}
								rainbow={!customColor && !isCustomSelected}
								label={text.custom}
								size={size}
								disabled={disabled}
								selected={isCustomSelected}
								onSelect={() => setOpen(true)}
								onKeyDown={handleKeyDown(customIndex)}
								tabIndex={activeIndex === customIndex ? 0 : -1}
							/>
						</PopoverTrigger>
						<PopoverContent align="center" sideOffset={6} className="w-auto p-2.5">
							<ColorPickerPanel
								value={panelValue}
								labels={labels}
								onChange={(next) => {
									setCustomColor(next);
									onChange(next);
								}}
							/>
						</PopoverContent>
					</Popover>
				) : null}
			</div>
			{showLabel ? (
				<span className={cn("text-[12px] font-semibold text-foreground", !currentName && "text-muted-foreground/60")}>
					{currentName ?? "—"}
				</span>
			) : null}
		</div>
	);
}

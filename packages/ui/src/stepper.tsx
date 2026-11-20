import { MinusIcon, PlusIcon } from "lucide-react";
import { useEffect, useRef, useState, type JSX, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "./utils";

/**
 * 数字步进器：`− 数值 +` 的三段式控件，用于设置页里改秒数、端口、并发数这类离散数值。
 *
 * 与 `StepSlider` 的分工：那个是「在一组有名字的档位里挑一个」（低 / 中 / 高），
 * 这个是「在一个数值范围里按 step 增减」，数值本身有意义、也可能需要精确输入。
 *
 * 行为约定：
 * - 受控：只经 `onValueChange` 回写，自己不存权威值；越界由本组件夹到 `min` / `max`。
 * - 落到 step 网格上：以 `min`（缺省 0）为原点取整，因此 `min=0 step=5` 不会给出 3。
 * - 输入框可直接编辑：回车 / 失焦提交，Esc 撤销；非法输入按撤销处理，不静默吞成 0。
 * - 按住加/减号连续变化（450ms 后每 90ms 一步），松手即停；键盘 Space / Enter 仍按一次算。
 * - 到达边界时按钮置为 disabled，用户能看见「到头了」，而不是点了没反应。
 *
 * 纯展示组件：不引 i18n，用户可见文案（按钮的无障碍名）由调用方经 `labels` 传入。
 */

export type StepperSize = "sm" | "default";

export interface StepperLabels {
	/** 加号按钮的无障碍名。缺省 "Increase"。 */
	increase?: string;
	/** 减号按钮的无障碍名。缺省 "Decrease"。 */
	decrease?: string;
}

export interface StepperProps {
	value: number;
	onValueChange(value: number): void;
	/** 允许的最小值。缺省不设下限。 */
	min?: number;
	/** 允许的最大值。缺省不设上限。 */
	max?: number;
	/** 每次增减的步长，缺省 1。 */
	step?: number;
	/** 显示的小数位数，缺省按 `step` 推断（step=0.1 → 1 位）。 */
	precision?: number;
	/** 显示在数值右侧的单位，如 "s" / "px" / "%"；不参与编辑。 */
	suffix?: string;
	disabled?: boolean;
	/** `sm` 高 28px，`default` 高 32px（与 Input / Select 触发器同高）。 */
	size?: StepperSize;
	className?: string;
	labels?: StepperLabels;
	/** 输入框的无障碍名称，如「超时时间」。 */
	"aria-label"?: string;
	"aria-describedby"?: string;
	"aria-invalid"?: boolean;
}

/** 按住后多久开始连续变化。 */
const HOLD_DELAY_MS = 450;
/** 连续变化时的间隔。 */
const HOLD_INTERVAL_MS = 90;
/** 浮点比较容差：step=0.1 累加十次不会正好是 1。 */
const EPSILON = 1e-9;

function decimalsOf(step: number): number {
	if (!Number.isFinite(step) || step <= 0) return 0;
	const text = String(step);
	const dot = text.indexOf(".");
	return dot === -1 ? 0 : Math.min(8, text.length - dot - 1);
}

function roundTo(value: number, decimals: number): number {
	if (decimals <= 0) return Math.round(value);
	const factor = 10 ** decimals;
	return Math.round(value * factor) / factor;
}

/** 夹到 [min, max] 并落到 step 网格上（以 min 或缺省 0 为原点）。 */
function normalizeToGrid(
	value: number,
	options: { min?: number; max?: number; step: number; decimals: number },
): number {
	const { min, max, step, decimals } = options;
	if (!Number.isFinite(value)) return min ?? 0;

	let next = value;
	if (Number.isFinite(step) && step > 0) {
		const origin = Number.isFinite(min) ? (min as number) : 0;
		next = origin + Math.round((next - origin) / step) * step;
	}
	if (Number.isFinite(min)) next = Math.max(min as number, next);
	if (Number.isFinite(max)) next = Math.min(max as number, next);
	return roundTo(next, decimals);
}

function formatValue(value: number, decimals: number): string {
	if (!Number.isFinite(value)) return "";
	return decimals > 0 ? value.toFixed(decimals) : String(roundTo(value, 0));
}

export function Stepper({
	value,
	onValueChange,
	min,
	max,
	step = 1,
	precision,
	suffix,
	disabled = false,
	size = "default",
	className,
	labels,
	...aria
}: StepperProps): JSX.Element {
	const decimals = precision ?? decimalsOf(step);
	const [draft, setDraft] = useState<string | null>(null);

	// 连续变化期间宿主可能还没回写新值，用 ref 记录「我发出去的最后一个值」，
	// 避免按住时一直按同一个旧值反复发同一步。
	const latestValue = useRef(value);
	latestValue.current = value;

	const holdStart = useRef<number | undefined>(undefined);
	const holdRepeat = useRef<number | undefined>(undefined);
	const holdFired = useRef(false);

	const gridOptions = { min, max, step, decimals };

	const stopHold = () => {
		if (holdStart.current !== undefined) window.clearTimeout(holdStart.current);
		if (holdRepeat.current !== undefined) window.clearInterval(holdRepeat.current);
		holdStart.current = undefined;
		holdRepeat.current = undefined;
	};

	useEffect(() => stopHold, []);

	const applyDelta = (direction: 1 | -1) => {
		const next = normalizeToGrid(latestValue.current + direction * step, gridOptions);
		if (Math.abs(next - latestValue.current) < EPSILON) return;
		latestValue.current = next;
		setDraft(null);
		onValueChange(next);
	};

	const commitDraft = () => {
		if (draft === null) return;
		const parsed = Number(draft.trim().replace(",", "."));
		if (draft.trim() !== "" && Number.isFinite(parsed)) {
			const next = normalizeToGrid(parsed, gridOptions);
			if (Math.abs(next - value) >= EPSILON) {
				latestValue.current = next;
				onValueChange(next);
			}
		}
		setDraft(null);
	};

	const startHold = (direction: 1 | -1) => {
		if (disabled) return;
		stopHold();
		holdFired.current = false;
		holdStart.current = window.setTimeout(() => {
			holdFired.current = true;
			applyDelta(direction);
			holdRepeat.current = window.setInterval(() => applyDelta(direction), HOLD_INTERVAL_MS);
		}, HOLD_DELAY_MS);
	};

	const handlePointerDown = (direction: 1 | -1) => (event: PointerEvent<HTMLButtonElement>) => {
		if (event.button !== 0 && event.pointerType !== "touch") return;
		startHold(direction);
	};

	const handleClick = (direction: 1 | -1) => () => {
		if (holdFired.current) {
			// 这一下是按住结束时的收尾 click，已经计过数了。
			holdFired.current = false;
			return;
		}
		applyDelta(direction);
	};

	const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "ArrowUp") {
			event.preventDefault();
			applyDelta(1);
			return;
		}
		if (event.key === "ArrowDown") {
			event.preventDefault();
			applyDelta(-1);
			return;
		}
		if (event.key === "Enter") {
			event.preventDefault();
			commitDraft();
			return;
		}
		if (event.key === "Escape") {
			event.preventDefault();
			setDraft(null);
		}
	};

	const atMin = Number.isFinite(min) && value <= (min as number) + EPSILON;
	const atMax = Number.isFinite(max) && value >= (max as number) - EPSILON;

	const stepButtonClass = cn(
		"flex shrink-0 items-center justify-center rounded-md text-foreground/70 transition-colors",
		"hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-[2px] focus-visible:ring-primary/40",
		"disabled:pointer-events-none disabled:opacity-40",
		size === "sm" ? "size-5" : "size-6",
	);

	return (
		<div
			data-slot="stepper"
			className={cn(
				"inline-flex items-center gap-0.5 rounded-lg px-1",
				"bg-muted transition-colors focus-within:bg-accent",
				// 默认宽度写死，不依赖父容器：放进 flex 行时否则会被拉满整行。
				// 需要更宽（例如带单位的长数值）时用 className 覆写。
				size === "sm" ? "h-7 w-[92px]" : "h-8 w-[108px]",
				disabled && "pointer-events-none opacity-50",
				aria["aria-invalid"] && "aria-invalid:ring-[2px] aria-invalid:ring-destructive/40",
				className,
			)}
			aria-invalid={aria["aria-invalid"]}
		>
			<button
				type="button"
				className={stepButtonClass}
				aria-label={labels?.decrease ?? "Decrease"}
				disabled={disabled || atMin}
				onPointerDown={handlePointerDown(-1)}
				onPointerUp={stopHold}
				onPointerLeave={stopHold}
				onPointerCancel={stopHold}
				onBlur={stopHold}
				onClick={handleClick(-1)}
			>
				<MinusIcon aria-hidden="true" className="size-3.5" />
			</button>
			<span className="flex min-w-0 flex-1 items-baseline justify-center gap-0.5">
				<input
					type="text"
					inputMode="decimal"
					disabled={disabled}
					value={draft ?? formatValue(value, decimals)}
					onChange={(event) => setDraft(event.target.value)}
					onFocus={(event) => {
						setDraft(formatValue(value, decimals));
						event.currentTarget.select();
					}}
					onBlur={commitDraft}
					onKeyDown={handleKeyDown}
					aria-label={aria["aria-label"]}
					aria-describedby={aria["aria-describedby"]}
					className={cn(
						"w-full min-w-0 bg-transparent text-center text-[12px] tabular-nums text-foreground outline-none",
						"placeholder:text-muted-foreground/50",
					)}
				/>
				{suffix ? (
					<span className="shrink-0 text-[11px] leading-none text-muted-foreground">{suffix}</span>
				) : null}
			</span>
			<button
				type="button"
				className={stepButtonClass}
				aria-label={labels?.increase ?? "Increase"}
				disabled={disabled || atMax}
				onPointerDown={handlePointerDown(1)}
				onPointerUp={stopHold}
				onPointerLeave={stopHold}
				onPointerCancel={stopHold}
				onBlur={stopHold}
				onClick={handleClick(1)}
			>
				<PlusIcon aria-hidden="true" className="size-3.5" />
			</button>
		</div>
	);
}

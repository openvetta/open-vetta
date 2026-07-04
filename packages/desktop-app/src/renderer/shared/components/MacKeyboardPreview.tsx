import { useMemo } from "react";
import { cn } from "@shared/lib/utils";

/**
 * Mac 键盘预览组件（通用、纯展示）。
 * 用主题语义 token 渲染，深/浅色自动适配；高亮走 primary 主题色。
 * 左右功能键用独立 id 区分（shift-left / shift-right 等），可分别高亮。
 *
 * 键帽刻印（esc / shift / return / command …）是物理硬件印字，
 * 不随系统语言本地化（真机键盘任何语言下都印同样字形），故按项目
 * 对 brand/协议串的惯例保持字面，不接 i18n。
 */

/** 可高亮的按键 id。左右功能键分开。 */
export type MacKeyId =
	| "esc"
	| "delete"
	| "tab"
	| "capslock"
	| "return"
	| "space"
	| "fn"
	| "control"
	| "shift-left"
	| "shift-right"
	| "command-left"
	| "command-right"
	| "option-left"
	| "option-right"
	// 其余按键 id 用其 label 小写，如 "a" / "1" / "f1" / "arrow-up"
	| (string & {});

interface KeyDef {
	/** 稳定 id，用于高亮匹配 */
	id: MacKeyId;
	/** 键帽主字形 */
	label: string;
	/** 左上角小字（如 shift 的 ⇧、command 的 ⌘） */
	sub?: string;
	/** flex-grow 权重，默认 1 */
	w?: number;
	/** 右上/右下对齐（功能键组下排文字靠边） */
	align?: "start" | "center" | "end";
}

type Row = KeyDef[];

const k = (id: string, label: string, extra?: Partial<KeyDef>): KeyDef => ({ id, label, ...extra });

/** 键盘布局：每行按 flex-grow 权重排布，跨行大致对齐即可。 */
const LAYOUT: Row[] = [
	[
		k("esc", "esc", { w: 1.6, align: "start" }),
		...["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12"].map((f) =>
			k(f.toLowerCase(), f, { w: 1 }),
		),
		k("power", "", { w: 1.2 }),
	],
	[
		k("backtick", "`"),
		...["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((d) => k(d, d)),
		k("minus", "-"),
		k("equal", "="),
		k("delete", "delete", { w: 1.8, align: "end" }),
	],
	[
		k("tab", "tab", { w: 1.6, align: "start" }),
		...["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"].map((c) => k(c.toLowerCase(), c)),
		k("bracket-left", "["),
		k("bracket-right", "]"),
		k("backslash", "\\", { w: 1.2 }),
	],
	[
		k("capslock", "caps lock", { w: 2, align: "start" }),
		...["A", "S", "D", "F", "G", "H", "J", "K", "L"].map((c) => k(c.toLowerCase(), c)),
		k("semicolon", ";"),
		k("quote", "'"),
		k("return", "return", { w: 2, align: "end" }),
	],
	[
		k("shift-left", "shift", { sub: "⇧", w: 2.5, align: "start" }),
		...["Z", "X", "C", "V", "B", "N", "M"].map((c) => k(c.toLowerCase(), c)),
		k("comma", ","),
		k("period", "."),
		k("slash", "/"),
		k("shift-right", "shift", { sub: "⇧", w: 2.5, align: "end" }),
	],
	[
		k("fn", "fn", { sub: "🌐" }),
		k("control", "control", { sub: "⌃", align: "start" }),
		k("option-left", "option", { sub: "⌥", align: "start" }),
		k("command-left", "command", { sub: "⌘", w: 1.4, align: "start" }),
		k("space", "", { w: 6.5 }),
		k("command-right", "command", { sub: "⌘", w: 1.4, align: "end" }),
		k("option-right", "option", { sub: "⌥", align: "end" }),
		k("arrow-left", "◀"),
		k("arrow-updown", "arrow", { w: 1 }), // 占位：渲染为上/下箭头双层竖排键
		k("arrow-right", "▶"),
	],
];

export interface MacKeyboardPreviewProps {
	/** 需要高亮（主题色）的按键 id 集合 */
	highlightKeys?: MacKeyId[];
	className?: string;
	/** 键盘整体缩放，默认 1 */
	scale?: number;
}

export function MacKeyboardPreview({ highlightKeys, className, scale = 1 }: MacKeyboardPreviewProps): JSX.Element {
	const highlighted = useMemo(() => new Set(highlightKeys ?? []), [highlightKeys]);

	return (
		<div
			className={cn(
				"inline-block select-none rounded-2xl border border-border/60 bg-muted/60 p-2 shadow-md",
				"backdrop-blur-sm",
				className,
			)}
			style={{ transform: scale !== 1 ? `scale(${scale})` : undefined, transformOrigin: "top left" }}
		>
			<div className="flex flex-col gap-1">
				{LAYOUT.map((row, ri) => (
					<div key={ri} className="flex gap-1">
						{row.map((key) => {
							// 方向键：上下箭头合并成一个双层竖排键，替换占位 id。
							if (key.id === "arrow-updown") {
								return <ArrowUpDownKey key={key.id} highlighted={highlighted} />;
							}
							return <Keycap key={key.id} def={key} active={highlighted.has(key.id)} />;
						})}
					</div>
				))}
			</div>
		</div>
	);
}

function Keycap({ def, active }: { def: KeyDef; active: boolean }): JSX.Element {
	const align = def.align ?? "center";
	return (
		<div
			className={cn(
				"relative flex h-7 min-w-0 flex-col justify-center rounded-md border px-1.5 text-[10px] leading-none transition-colors",
				"font-medium",
				active
					? "border-primary/70 bg-primary text-primary-foreground shadow-[inset_0_-1px_1px_rgba(0,0,0,0.12)]"
					: "border-black/5 bg-card text-muted-foreground shadow-[inset_0_-1px_1px_rgba(0,0,0,0.06)] dark:border-white/5",
				align === "start" && "items-start",
				align === "center" && "items-center",
				align === "end" && "items-end",
			)}
			style={{ flexGrow: def.w ?? 1, flexBasis: 0 }}
		>
			{def.sub && (
				<span className={cn("mb-0.5 text-[9px] opacity-80", active ? "text-primary-foreground" : "text-foreground/70")}>
					{def.sub}
				</span>
			)}
			<span className={cn(def.label.length > 2 && "text-[9px]")}>{def.label}</span>
		</div>
	);
}

/** 上/下箭头合并的竖排半高键。 */
function ArrowUpDownKey({ highlighted }: { highlighted: Set<MacKeyId> }): JSX.Element {
	const upActive = highlighted.has("arrow-up");
	const downActive = highlighted.has("arrow-down");
	const base = "flex h-[13px] items-center justify-center rounded-[3px] border text-[8px] leading-none transition-colors";
	const on = "border-primary/70 bg-primary text-primary-foreground";
	const off = "border-black/5 bg-card text-muted-foreground dark:border-white/5";
	return (
		<div className="flex min-w-0 flex-col justify-between gap-0.5" style={{ flexGrow: 1, flexBasis: 0 }}>
			<div className={cn(base, upActive ? on : off)}>▲</div>
			<div className={cn(base, downActive ? on : off)}>▼</div>
		</div>
	);
}

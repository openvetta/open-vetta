import { cn } from "@shared/lib/utils";
import { useTheme } from "@shared/hooks/useTheme";
import type { ThemeMode } from "@shared/store/atoms";
import { THEMES } from "@shared/theme/themes";
import type { ThemeDef } from "@shared/theme/tokens";
import { BotAvatar } from "@shared/components/BotAvatar";
import { useNarrowScreen } from "@shared/hooks/useNarrowScreen";
import type { MouseEvent } from "react";
import { SettingHeading } from "./shared";
import { SETTINGS_SECTION } from "../registry";

const MODES: { value: ThemeMode; label: string; icon: string; hint: string }[] = [
	{
		value: "light",
		label: "浅色",
		icon: "icon-[mdi--white-balance-sunny]",
		hint: "始终使用浅色界面",
	},
	{
		value: "dark",
		label: "深色",
		icon: "icon-[mdi--moon-waning-crescent]",
		hint: "始终使用深色界面",
	},
	{
		value: "auto",
		label: "跟随系统",
		icon: "icon-[mdi--theme-light-dark]",
		hint: "随系统外观自动切换",
	},
];

function ModeCard({
	mode,
	label,
	icon,
	hint,
	active,
	onSelect,
}: {
	mode: ThemeMode;
	label: string;
	icon: string;
	hint: string;
	active: boolean;
	onSelect: (value: ThemeMode, event: MouseEvent<HTMLButtonElement>) => void;
}): JSX.Element {
	return (
		<button
			type="button"
			onClick={(event) => onSelect(mode, event)}
			className={cn(
				"group relative flex flex-col items-start gap-2 rounded-xl border bg-card px-4 py-3 text-left transition-all",
				active
					? "border-primary/70 ring-2 ring-primary/30"
					: "border-border hover:border-primary/40 hover:bg-accent/40",
			)}
		>
			<div className="flex w-full items-center justify-between">
				<span
					className={cn(
						icon,
						"h-5 w-5",
						active ? "text-primary" : "text-muted-foreground",
					)}
				/>
				{active && (
					<span className="icon-[mdi--check-circle] h-4 w-4 text-primary" />
				)}
			</div>
			<div className="text-[13px] font-medium text-foreground">{label}</div>
			<div className="text-[11px] text-muted-foreground">{hint}</div>
		</button>
	);
}

// 涂抹式色卡：实心椭圆色块 + 整体高斯模糊融合，模拟 macOS Sonoma/Sequoia 壁纸的流动感。
// 关键：每个 blob 是不透明实色 div，互相重叠，通过容器 filter:blur(...) 把硬边糊掉，
// blob 总覆盖率 > 100% 保证没有底色透出来。outer overflow-hidden 把 blur 溢出边界裁掉。
const BLOB_LAYOUT: { left: string; top: string; w: string; h: string; rotate: number }[] = [
	{ left: "-15%", top: "-20%", w: "75%", h: "75%", rotate: -8 },
	{ left: "55%", top: "-15%", w: "70%", h: "70%", rotate: 12 },
	{ left: "-10%", top: "55%", w: "70%", h: "75%", rotate: 18 },
	{ left: "45%", top: "50%", w: "75%", h: "70%", rotate: -14 },
	{ left: "25%", top: "20%", w: "55%", h: "60%", rotate: 6 },
];

function ThemeCard({
	theme,
	active,
	onSelect,
}: {
	theme: ThemeDef;
	active: boolean;
	onSelect: (id: string, event: MouseEvent<HTMLButtonElement>) => void;
}): JSX.Element {
	const palette = theme.dark;
	const colors = [
		palette.primary,
		palette.accent,
		palette.ring,
		palette.chart1,
		palette.chart2,
	];
	return (
		<button
			type="button"
			onClick={(event) => onSelect(theme.id, event)}
			className="group flex flex-col items-stretch gap-2 text-left"
		>
			<div
				className={cn(
					"relative aspect-[16/9] w-full overflow-hidden rounded-lg transition-all",
					active
						? "ring-2 ring-primary ring-offset-2 ring-offset-background"
						: "ring-1 ring-border/60 group-hover:ring-primary/50",
				)}
				style={{ background: palette.background }}
			>
				{/* blob 层：居中的大正方形旋转层（active 时绕中心 360° 无限流转）+ 重度模糊。
				    正方形 180% 宽，任意旋转角内切圆都盖满卡片，不露底色 */}
				<div
					className="absolute inset-0 flex items-center justify-center"
				>
					<div
						className={cn("relative aspect-square w-[180%]", active && "theme-blob-spin")}
						style={{ filter: "blur(28px) saturate(115%)" }}
					>
					{BLOB_LAYOUT.map((b, i) => (
						<div
							key={`${theme.id}-${i}`}
							className="absolute"
							style={{
								left: b.left,
								top: b.top,
								width: b.w,
								height: b.h,
								transform: `rotate(${b.rotate}deg)`,
							}}
						>
							<div
								className={cn("h-full w-full rounded-full", active && "theme-blob-ripple")}
								style={{
									background: colors[i],
									// 时长/相位各自错开，叠加后形成无规律混沌涟漪
									animationDuration: `${5 + i * 1.3}s`,
									animationDelay: `${i * -1.7}s`,
								}}
							/>
						</div>
					))}
				</div>
				</div>
				{/* 居中的迷你"窗口"，展示 card/border/foreground/primary 在 UI 上下文中的样子 */}
				<div
					className="absolute left-1/2 top-1/2 w-[72%] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-md"
					style={{
						background: palette.card,
						border: `1px solid ${palette.border}`,
						boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
					}}
				>
					<div
						className="flex items-center gap-1 px-1.5 py-1"
						style={{ borderBottom: `1px solid ${palette.border}` }}
					>
						<span
							className="h-1 w-1 rounded-full"
							style={{ background: palette.destructive }}
						/>
						<span
							className="h-1 w-1 rounded-full"
							style={{ background: palette.chart1 }}
						/>
						<span
							className="h-1 w-1 rounded-full"
							style={{ background: palette.primary }}
						/>
					</div>
					<div className="space-y-[5px] px-2 py-2.5">
						<div
							className="h-[3px] w-[80%] rounded-full"
							style={{ background: palette.foreground, opacity: 0.75 }}
						/>
						<div
							className="h-[3px] w-[60%] rounded-full"
							style={{ background: palette.mutedForeground }}
						/>
						<div
							className="h-[3px] w-[70%] rounded-full"
							style={{ background: palette.mutedForeground, opacity: 0.7 }}
						/>
						<div
							className="h-[3px] w-[45%] rounded-full"
							style={{ background: palette.mutedForeground, opacity: 0.7 }}
						/>
						<div className="flex items-center gap-1 pt-1.5">
							<span
								className="h-2.5 w-6 rounded-sm"
								style={{ background: palette.primary }}
							/>
							<span
								className="h-2.5 w-4 rounded-sm"
								style={{ background: palette.accent }}
							/>
						</div>
					</div>
				</div>
				{active && (
					<span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-background/85 shadow-sm backdrop-blur-sm">
						<span className="icon-[mdi--check] h-3.5 w-3.5 text-primary" />
					</span>
				)}
			</div>
			<span
				className={cn(
					"text-[12px] transition-colors",
					active ? "font-medium text-foreground" : "text-muted-foreground",
				)}
			>
				{theme.label}
			</span>
		</button>
	);
}

export function AppearanceSettings(): JSX.Element {
	const { mode, themeName, setMode, setThemeName } = useTheme();
	const narrow = useNarrowScreen();

	return (
		<div className="mx-auto w-full max-w-[680px] px-8 py-4">
			<div className="mb-4 flex items-start justify-between gap-4">
				<div>
					<h1 className="text-[20px] font-bold text-foreground">外观</h1>
					<SettingHeading section={SETTINGS_SECTION["appearance-mode"]} className="mt-3" />
				</div>
				{/* 窄屏隐藏装饰性头像，避免占用本就紧张的横向空间 */}
				{!narrow && (
					<div className="flex items-center justify-start pt-1" style={{ height: 56, width: 200 }}>
						<BotAvatar pacing size="lg" />
					</div>
				)}
			</div>

			<div className="mb-6">
				<div className="grid grid-cols-3 gap-3">
					{MODES.map((m) => (
						<ModeCard
							key={m.value}
							mode={m.value}
							label={m.label}
							icon={m.icon}
							hint={m.hint}
							active={mode === m.value}
							onSelect={(value, event) =>
								void setMode(value, { x: event.clientX, y: event.clientY })
							}
						/>
					))}
				</div>
			</div>

			<div className="mb-6">
				<SettingHeading section={SETTINGS_SECTION["appearance-theme"]} className="mb-3" />
				<div className="grid grid-cols-3 gap-x-4 gap-y-4">
					{THEMES.map((t) => (
						<ThemeCard
							key={t.id}
							theme={t}
							active={themeName === t.id}
							onSelect={(id, event) =>
								setThemeName(id, { x: event.clientX, y: event.clientY })
							}
						/>
					))}
				</div>
			</div>
		</div>
	);
}

import { Button } from "@shared/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@shared/components/ui/popover";
import { StepSlider } from "@shared/components/ui/step-slider";
import { PixelMarioBlocks } from "@shared/components/mario/PixelMarioBlocks";
import { cn } from "@shared/lib/utils";
import type { CursorStyle } from "@shared/theme/cursor";
import {
	NEW_SESSION_TEXTURE_COMPONENTS,
	type NewSessionTextureId,
} from "@shared/theme/new-session-texture";
import type { OrnamentId } from "@shared/theme/ornament";
import type { ThemeDef } from "@shared/theme/tokens";
import { memo, useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { SettingsAiAssist } from "../ai-assist";
import themeLock from "../assets/theme-lock.webp";
import { SETTINGS_SECTION } from "../registry";
import { MotionSelect, SettingHeading, SettingRow, SettingSection } from "@vetta-org/theme-ui/settings";
import type { AppIconId } from "@/shared/app-icon";
import type { SidebarStyle } from "@shared/theme/sidebar-style";
import type {
	AppearanceAppIconOption,
	AppearanceCursorOption,
	AppearanceOrnamentOption,
	AppearanceLanguageOption,
	AppearanceModeOption,
	AppearanceSettingsModel,
	AppearanceSidebarStyleOption,
	AppearanceTextureOption,
	AppearanceUiThemeOption,
} from "./useAppearanceSettingsModel";

type ThemeMode = AppearanceModeOption["value"];
type SelectionPoint = { x: number; y: number };

/** 松手后才应用：拖动时只改本地预览档位，避免整个界面跟着手实时重排。 */
function UiZoomControl({ model }: { model: AppearanceSettingsModel }): JSX.Element {
	const { factor, stepIndex, steps } = model.uiZoom;
	const [draftIndex, setDraftIndex] = useState<number>();
	// 主进程确认的档位变了（快捷键、恢复默认），丢掉残留的预览。
	useEffect(() => setDraftIndex(undefined), [stepIndex]);
	const percent = (value: number) => `${Math.round(value * 100)}%`;
	const shownIndex = draftIndex ?? stepIndex;
	const commit = (index: number) => {
		setDraftIndex(undefined);
		const next = steps[index];
		if (next !== undefined && next !== factor) model.actions.setUiZoom(next);
	};
	return (
		<StepSlider
			labels={steps.map(percent)}
			index={shownIndex}
			showTicks
			fullWidth
			aria-label={model.labels.uiZoomSliderLabel}
			aria-valuetext={percent(steps[shownIndex] ?? factor)}
			onIndexChange={setDraftIndex}
			onIndexCommit={commit}
			onCancel={() => setDraftIndex(undefined)}
		/>
	);
}

function languageOptionLabel(option: AppearanceLanguageOption): JSX.Element {
	return (
		<span className="flex min-w-0 items-center gap-1.5">
			<span
				className={cn(
					option.value === "system" ? "icon-[mdi--monitor]" : "icon-[mdi--translate]",
					"h-4 w-4 shrink-0 text-muted-foreground",
				)}
			/>
			<span className="min-w-0 truncate">
				<span className="font-medium text-foreground">{option.native}</span>
				<span className="ml-1.5 text-[11px] font-normal text-muted-foreground">{option.alt}</span>
			</span>
		</span>
	);
}

const LanguageSelect = memo(function LanguageSelect({
	language,
	languages,
	onSelect,
}: {
	language: string;
	languages: AppearanceLanguageOption[];
	onSelect: (lang: AppearanceLanguageOption["value"]) => void;
}): JSX.Element {
	return (
		<MotionSelect
			value={language}
			onValueChange={(next) => onSelect(next as AppearanceLanguageOption["value"])}
			triggerClassName="w-[260px]"
			options={languages.map((option) => ({
				value: option.value,
				label: languageOptionLabel(option),
			}))}
		/>
	);
});

function SelectionCheckBadge(): JSX.Element {
	return (
		<span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-background/85 shadow-sm backdrop-blur-sm">
			<span className="icon-[mdi--check] h-3.5 w-3.5 text-primary" />
		</span>
	);
}

/**
 * 选中态只改 border 颜色（1px），不要叠 ring——border + ring-inset 会叠成约 2px 双线。
 * 与 ImChannelCard 等设置页一致：idle/active 都走同一根 border。
 */
const SELECTION_ACTIVE = "border-primary/50 bg-primary/10";
const SELECTION_IDLE = "border-border/60 hover:border-primary/40 hover:bg-accent/40";

const ModeCard = memo(function ModeCard({
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
	onSelect: (value: ThemeMode, point: SelectionPoint) => void;
}): JSX.Element {
	return (
		<button
			type="button"
			onClick={(event) => onSelect(mode, { x: event.clientX, y: event.clientY })}
			className={cn(
				"group relative flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2 text-left transition-all",
				active ? SELECTION_ACTIVE : SELECTION_IDLE,
			)}
		>
			<span className={cn(icon, "h-4 w-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
			<div className="min-w-0 flex-1 pr-5">
				<div className="text-[12px] font-medium text-foreground">{label}</div>
				<div className="truncate text-[11px] text-muted-foreground">{hint}</div>
			</div>
			{active && <SelectionCheckBadge />}
		</button>
	);
});

const BLOB_LAYOUT: { left: string; top: string; w: string; h: string; rotate: number }[] = [
	{ left: "-15%", top: "-20%", w: "75%", h: "75%", rotate: -8 },
	{ left: "55%", top: "-15%", w: "70%", h: "70%", rotate: 12 },
	{ left: "-10%", top: "55%", w: "70%", h: "75%", rotate: 18 },
	{ left: "45%", top: "50%", w: "75%", h: "70%", rotate: -14 },
	{ left: "25%", top: "20%", w: "55%", h: "60%", rotate: 6 },
];

const ThemeCard = memo(function ThemeCard({
	theme,
	active,
	onSelect,
}: {
	theme: ThemeDef;
	active: boolean;
	onSelect: (id: string, point: SelectionPoint) => void;
}): JSX.Element {
	const palette = theme.dark;
	const colors = [palette.primary, palette.accent, palette.ring, palette.chart1, palette.chart2];
	return (
		<button
			type="button"
			onClick={(event) => onSelect(theme.id, { x: event.clientX, y: event.clientY })}
			className="group flex flex-col items-stretch gap-2 text-left"
		>
			<div
				className={cn(
					// 主题色预览本身带底色，选中只改 1px border 色，不叠 ring / bg
					"relative aspect-[16/9] w-full overflow-hidden rounded-lg border transition-all",
					active ? "border-primary/50" : "border-border/60 group-hover:border-primary/40",
				)}
				style={{ background: palette.background }}
			>
				<div className="absolute inset-0 flex items-center justify-center">
					<div className="relative aspect-square w-[180%]" style={{ filter: "blur(28px) saturate(115%)" }}>
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
									className="h-full w-full rounded-full"
									style={{
										background: colors[i],
										animationDuration: `${5 + i * 1.3}s`,
										animationDelay: `${i * -1.7}s`,
									}}
								/>
							</div>
						))}
					</div>
				</div>
				<div
					className="absolute left-1/2 top-1/2 w-[72%] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-md"
					style={{
						background: palette.card,
						border: `1px solid ${palette.border}`,
						boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
					}}
				>
					<div className="flex items-center gap-1 px-1.5 py-1" style={{ borderBottom: `1px solid ${palette.border}` }}>
						<span className="h-1 w-1 rounded-full" style={{ background: palette.destructive }} />
						<span className="h-1 w-1 rounded-full" style={{ background: palette.chart1 }} />
						<span className="h-1 w-1 rounded-full" style={{ background: palette.primary }} />
					</div>
					<div className="space-y-[5px] px-2 py-2.5">
						<div className="h-[3px] w-[80%] rounded-full" style={{ background: palette.foreground, opacity: 0.75 }} />
						<div className="h-[3px] w-[60%] rounded-full" style={{ background: palette.mutedForeground }} />
						<div className="h-[3px] w-[70%] rounded-full" style={{ background: palette.mutedForeground, opacity: 0.7 }} />
						<div className="h-[3px] w-[45%] rounded-full" style={{ background: palette.mutedForeground, opacity: 0.7 }} />
						<div className="flex items-center gap-1 pt-1.5">
							<span className="h-2.5 w-6 rounded-sm" style={{ background: palette.primary }} />
							<span className="h-2.5 w-4 rounded-sm" style={{ background: palette.accent }} />
						</div>
					</div>
				</div>
				{active && <SelectionCheckBadge />}
			</div>
			<span className={cn("text-[12px] transition-colors", active ? "font-medium text-foreground" : "text-muted-foreground")}>
				{theme.label}
			</span>
		</button>
	);
});

const UiThemeCard = memo(function UiThemeCard({
	active,
	disabled,
	hint,
	id,
	label,
	onSelect,
	preview,
	unavailable,
}: AppearanceUiThemeOption & {
	onSelect: (id: string) => void;
}): JSX.Element {
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={() => onSelect(id)}
			className={cn(
				"group relative rounded-xl border bg-card text-left transition-all",
				active ? SELECTION_ACTIVE : SELECTION_IDLE,
				disabled && "cursor-not-allowed",
			)}
		>
			<div className="overflow-hidden rounded-xl">
				<div className="relative aspect-[16/9] overflow-hidden border-b border-border/50">
					<img src={preview} alt="" className={cn("h-full w-full object-cover", disabled && "opacity-50")} />
					{unavailable ? (
						<span className="absolute inset-0 flex items-center justify-center">
							<img src={themeLock} alt="" className="h-14 w-auto object-contain" />
						</span>
					) : null}
				</div>
				<div className="px-3.5 pb-3 pt-3">
					<div className="text-[13px] font-medium text-card-foreground">{label}</div>
					<div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>
				</div>
			</div>
			{active && !unavailable && <SelectionCheckBadge />}
		</button>
	);
});

/** 迷你窗口示意图：经典=侧栏贴边仅右侧分隔线；悬浮=侧栏四周留白带圆角边框。 */
function SidebarStylePreview({ style }: { style: SidebarStyle }): JSX.Element {
	const classic = style === "classic";
	return (
		<div
			className={cn(
				"flex h-9 w-14 overflow-hidden rounded-md border border-border bg-background",
				!classic && "gap-1 p-1",
			)}
		>
			<div
				className={cn(
					"w-[34%] shrink-0 bg-muted",
					classic ? "border-r border-border" : "rounded-[3px] border border-border",
				)}
			/>
			<div className="flex-1" />
		</div>
	);
}

const SidebarStyleCard = memo(function SidebarStyleCard({
	active,
	hint,
	id,
	label,
	onSelect,
}: AppearanceSidebarStyleOption & {
	onSelect: (style: SidebarStyle) => void;
}): JSX.Element {
	return (
		<button
			type="button"
			onClick={() => onSelect(id)}
			className={cn(
				"group relative flex min-h-[72px] items-center gap-3 rounded-xl border bg-card px-3.5 py-3 text-left transition-all",
				active ? SELECTION_ACTIVE : SELECTION_IDLE,
			)}
		>
			<SidebarStylePreview style={id} />
			<div className="min-w-0 flex-1 pr-5">
				<div className="text-[13px] font-medium text-foreground">{label}</div>
				<div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{hint}</div>
			</div>
			{active && <SelectionCheckBadge />}
		</button>
	);
});

/** 超椭圆（n=5）轮廓，与系统应用图标的形状一致；用 clip-path 裁，图片本身是满铺方形。 */
const SQUIRCLE_CLIP = `polygon(${Array.from({ length: 72 }, (_, i) => {
	const t = (i / 72) * Math.PI * 2;
	const c = Math.cos(t);
	const s = Math.sin(t);
	const x = 50 + 50 * Math.sign(c) * Math.abs(c) ** (2 / 5);
	const y = 50 + 50 * Math.sign(s) * Math.abs(s) ** (2 / 5);
	return `${x.toFixed(2)}% ${y.toFixed(2)}%`;
}).join(",")})`;

function SquircleIcon({ className, src }: { className?: string; src: string }): JSX.Element {
	return (
		<img
			alt=""
			className={cn("pointer-events-none select-none object-cover", className)}
			draggable={false}
			src={src}
			style={{ clipPath: SQUIRCLE_CLIP }}
		/>
	);
}

/** 单个入口：显示当前图标与名字，点开 popover 在里面挑。无背景卡片。 */
function AppIconPicker({
	onSelect,
	options,
}: {
	onSelect: (id: AppIconId) => void;
	options: AppearanceAppIconOption[];
}): JSX.Element | null {
	const [open, setOpen] = useState(false);
	const current = options.find((option) => option.active) ?? options[0];
	if (!current) return null;
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="group flex items-center gap-2.5 rounded-lg outline-none"
				>
					<SquircleIcon src={current.preview} className="h-8 w-8 shrink-0" />
					<span className="text-[13px] text-foreground">{current.label}</span>
					<span className="icon-[mdi--chevron-down] h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
				</button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-[320px] p-3">
				<div className="grid grid-cols-4 gap-x-3 gap-y-3">
					{options.map((option) => (
						<button
							key={option.id}
							type="button"
							title={option.label}
							onClick={() => {
								onSelect(option.id);
								setOpen(false);
							}}
							className="group flex flex-col items-center gap-1.5 outline-none"
						>
							<span className="relative">
								<SquircleIcon
									src={option.preview}
									className={cn(
										"h-14 w-14 transition-transform group-hover:scale-105",
										option.active ? "" : "opacity-90 group-hover:opacity-100",
									)}
								/>
								{option.active && (
									<span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary">
										<span className="icon-[mdi--check] h-3 w-3 text-primary-foreground" />
									</span>
								)}
							</span>
							<span
								className={cn(
									"text-[11px]",
									option.active ? "font-medium text-foreground" : "text-muted-foreground",
								)}
							>
								{option.label}
							</span>
						</button>
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
}

const CursorStyleCard = memo(function CursorStyleCard({
	active,
	hint,
	icon,
	id,
	label,
	onSelect,
	preview,
}: AppearanceCursorOption & {
	onSelect: (style: CursorStyle) => void;
}): JSX.Element {
	return (
		<button
			type="button"
			onClick={() => onSelect(id)}
			className={cn(
				// 两列宽卡：略增高预览区，与上方主题卡节奏一致
				"group relative flex min-h-[72px] items-center gap-3 rounded-xl border bg-card px-3.5 py-3 text-left transition-all",
				active ? SELECTION_ACTIVE : SELECTION_IDLE,
			)}
		>
			<div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted/80">
				{preview ? (
					<img src={preview} alt="" className="h-7 w-7 object-contain" draggable={false} />
				) : (
					<span className={cn(icon, "h-5 w-5", active ? "text-primary" : "text-muted-foreground")} />
				)}
			</div>
			<div className="min-w-0 flex-1 pr-5">
				<div className="text-[13px] font-medium text-foreground">{label}</div>
				<div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{hint}</div>
			</div>
			{active && <SelectionCheckBadge />}
		</button>
	);
});

/**
 * 装饰件预览：一枚 1:1 的方格，装饰件居中摆着，别的什么都不画。
 *
 * 早先这里画的是迷你新会话页（文字骨架 + 输入框），想表达「它会出现在哪儿」，
 * 但四张卡并排时骨架线比装饰件本身还抢眼，反而看不清挑的是什么。位置信息交给
 * 上方那句说明，方格只管把东西呈清楚。
 */
function OrnamentPreview({ id, preview }: { id: OrnamentId; preview?: string }): JSX.Element {
	return (
		<div className="flex h-full w-full items-center justify-center">
			{preview ? (
				<img
					alt=""
					className="pointer-events-none h-auto w-24 select-none object-contain"
					draggable={false}
					src={preview}
				/>
			) : id === "mario" ? (
				// 马里奥的砖块是画出来的，没有静帧；预览里直接把蘑菇顶出来，一眼看得出这块能顶。
				// 顶出来的蘑菇整个探到砖块上方，方格里按砖块居中会偏上，往下补半个蘑菇的高度。
				<PixelMarioBlocks unit={2.25} popped className="pointer-events-none translate-y-[19px]" />
			) : (
				// 「无」：用虚线圈标出这块空着的位置，而不是留一片看不出所以然的空白。
				// border 那档灰在浅色下几乎糊进卡片底色里，改用 muted-foreground 并加粗到 2px，
				// 圈里再补一枚斜杠，深浅两套主题下都一眼看得出这项是「空着」。
				<span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/50">
					<span className="icon-[mdi--close] h-5 w-5 text-muted-foreground/60" />
				</span>
			)}
		</div>
	);
}

/**
 * 方格选择卡：与本页「色彩主题」那组同构——方格预览在上、名字在下，选中只改 1px border 色。
 * 装饰件与纹理共用同一副壳，两组并排时才看得出是同一类选择。
 */
function DecorCard({
	active,
	children,
	hint,
	label,
	onSelect,
}: {
	active: boolean;
	children: ReactNode;
	hint: string;
	label: string;
	onSelect: () => void;
}): JSX.Element {
	return (
		<button
			type="button"
			onClick={onSelect}
			// 描述文字在方格里塞不下又不该丢，挂成 title 让需要的人悬停能看到。
			title={hint}
			className="group flex flex-col items-stretch gap-2 text-left"
		>
			<div
				className={cn(
					"relative aspect-square w-full overflow-hidden rounded-lg border bg-card transition-all",
					active ? SELECTION_ACTIVE : SELECTION_IDLE,
				)}
			>
				{children}
				{active && <SelectionCheckBadge />}
			</div>
			<span
				className={cn(
					"text-[12px] transition-colors",
					active ? "font-medium text-foreground" : "text-muted-foreground",
				)}
			>
				{label}
			</span>
		</button>
	);
}

/**
 * 纹理预览：方格里直接画一小块真的底衬，所见即所得。
 *
 * 复用新会话页那一档的实现而不是另画一张示意图：网格的疏密、淡出与那团光晕
 * 都由实现决定，另画一份迟早会和页面对不上。
 */
/**
 * 流光按整页尺寸算，原尺寸的色斑塞进这枚方格只剩一团均匀的光。
 * 预览里把光晕半径和色斑尺度按比例缩小、格距同步收紧，点阵才不至于只剩两三行。
 */
const AURORA_PREVIEW_VARS = {
	"--ns-aurora-radius": "60px",
	"--ns-aurora-field-scale": "0.12",
	"--ns-aurora-cell": "5px",
	"--ns-aurora-dot": "1.4px",
} as CSSProperties;

function TexturePreview({ id }: { id: NewSessionTextureId }): JSX.Element {
	const Texture = NEW_SESSION_TEXTURE_COMPONENTS[id];
	return (
		<div className="relative h-full w-full" style={id === "aurora" ? AURORA_PREVIEW_VARS : undefined}>
			{Texture ? (
				<Texture />
			) : (
				// 「无」与装饰件那档同款：虚线圈 + 斜杠，一眼看得出这项什么都不画。
				<span className="flex h-full w-full items-center justify-center">
					<span className="flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-muted-foreground/50">
						<span className="icon-[mdi--close] h-5 w-5 text-muted-foreground/60" />
					</span>
				</span>
			)}
		</div>
	);
}

const OrnamentCard = memo(function OrnamentCard({
	active,
	hint,
	id,
	label,
	onSelect,
	preview,
}: AppearanceOrnamentOption & {
	onSelect: (id: OrnamentId) => void;
}): JSX.Element {
	return (
		<DecorCard active={active} hint={hint} label={label} onSelect={() => onSelect(id)}>
			<OrnamentPreview id={id} preview={preview} />
		</DecorCard>
	);
});

const TextureCard = memo(function TextureCard({
	active,
	hint,
	id,
	label,
	onSelect,
}: AppearanceTextureOption & {
	onSelect: (id: NewSessionTextureId) => void;
}): JSX.Element {
	return (
		<DecorCard active={active} hint={hint} label={label} onSelect={() => onSelect(id)}>
			<TexturePreview id={id} />
		</DecorCard>
	);
});

export function AppearanceSettingsView({ model }: { model: AppearanceSettingsModel }): JSX.Element {
	return (
		<div className="mx-auto w-full max-w-[680px] px-8 pt-2 pb-4">
			<div className="mb-8 flex min-w-0 flex-wrap items-center gap-3">
				<h1 className="text-[20px] font-bold text-foreground">{model.labels.title}</h1>
				<SettingsAiAssist tabId="appearance" />
			</div>

			<div className="mb-10">
				<SettingHeading title={model.labels.sections.language} section={SETTINGS_SECTION["appearance-language"]} className="mb-1" />
				<p className="mb-4 text-[12px] text-muted-foreground">{model.labels.languageHint}</p>
				<LanguageSelect language={model.language} languages={model.languages} onSelect={model.actions.changeLanguage} />
			</div>

			<div className="mb-10">
				<SettingHeading title={model.labels.sections.mode} section={SETTINGS_SECTION["appearance-mode"]} className="mb-4" />
				<div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
					{model.modeOptions.map((mode) => (
						<ModeCard
							key={mode.value}
							mode={mode.value}
							label={mode.label}
							icon={mode.icon}
							hint={mode.hint}
							active={model.mode === mode.value}
							onSelect={model.actions.changeMode}
						/>
					))}
				</div>
			</div>

			{model.showUiTheme && (
				<div className="mb-10">
					<SettingHeading title={model.labels.sections.uiTheme} section={SETTINGS_SECTION["appearance-ui-theme"]} className="mb-4" />
					<div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
						{model.uiThemes.map((theme) => (
							<UiThemeCard key={theme.id} {...theme} onSelect={model.actions.selectUiTheme} />
						))}
					</div>
				</div>
			)}

			{model.activeUiThemeId === "default" && (
				<div className="mb-10">
					<SettingHeading title={model.labels.sections.theme} section={SETTINGS_SECTION["appearance-theme"]} className="mb-4" />
					<div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
						{model.themes.map((theme) => (
							<ThemeCard
								key={theme.id}
								theme={theme}
								active={model.themeName === theme.id}
								onSelect={model.actions.changeThemeName}
							/>
						))}
					</div>
				</div>
			)}

			<div className="mb-10">
				<div className="mb-1 flex items-center justify-between gap-2">
					<SettingHeading title={model.labels.sections.uiZoom} section={SETTINGS_SECTION["appearance-ui-zoom"]} />
					<Button
						variant="ghost"
						size="icon-xs"
						title={model.labels.uiZoomReset}
						aria-label={model.labels.uiZoomReset}
						disabled={model.uiZoom.factor === model.uiZoom.default}
						onClick={model.actions.resetUiZoom}
					>
						<span aria-hidden className="icon-[solar--restart-linear] h-3.5 w-3.5" />
					</Button>
				</div>
				<p className="mb-4 text-[12px] text-muted-foreground">{model.labels.uiZoomHint}</p>
				<UiZoomControl model={model} />
			</div>

			{/* 应用图标：左右排列的设置项卡片，右侧是当前图标 + popover 选择器 */}
			<div className="mb-10">
				<SettingSection title={model.labels.sections.appIcon} section={SETTINGS_SECTION["appearance-app-icon"]}>
					<SettingRow title={model.labels.sections.appIcon} border={false}>
						<AppIconPicker options={model.appIconOptions} onSelect={model.actions.setAppIcon} />
					</SettingRow>
				</SettingSection>
			</div>

			{/* 新会话页装饰：装饰件与纹理都只改这一页，连排在一起用户不必逐项猜它们作用在哪。
			    不套卡片、不加边框——这一页其余分区都是平铺的，单独给它加一层壳反而把它拔高成了别的东西。 */}
			<div className="mb-10">
				<div className="mb-5">
					<h2 className="text-[15px] font-semibold text-foreground">{model.labels.newSessionDecorTitle}</h2>
					<p className="mt-1 text-[12px] text-muted-foreground">{model.labels.newSessionDecorHint}</p>
				</div>

				{/* 装饰件：输入框上方那块挂饰位 */}
				<div className="mb-8">
					<SettingHeading title={model.labels.sections.ornament} section={SETTINGS_SECTION["appearance-ornament"]} className="mb-1 text-[13px]" />
					<p className="mb-4 text-[12px] text-muted-foreground">{model.labels.ornamentHint}</p>
					<div className="grid grid-cols-4 gap-4">
						{model.ornamentOptions.map((option) => (
							<OrnamentCard key={option.id} {...option} onSelect={model.actions.setOrnament} />
						))}
					</div>
				</div>

				{/* 纹理：整页背后的底衬 */}
				<div>
					<SettingHeading title={model.labels.sections.texture} section={SETTINGS_SECTION["appearance-texture"]} className="mb-1 text-[13px]" />
					<p className="mb-4 text-[12px] text-muted-foreground">{model.labels.textureHint}</p>
					<div className="grid grid-cols-4 gap-4">
						{model.textureOptions.map((option) => (
							<TextureCard key={option.id} {...option} onSelect={model.actions.setTexture} />
						))}
					</div>
				</div>
			</div>

			<div className="mb-10">
				<SettingHeading title={model.labels.sections.sidebar} section={SETTINGS_SECTION["appearance-sidebar"]} className="mb-4" />
				<div className="grid grid-cols-2 gap-4">
					{model.sidebarStyleOptions.map((option) => (
						<SidebarStyleCard key={option.id} {...option} onSelect={model.actions.setSidebarStyle} />
					))}
				</div>
			</div>

			{/* 鼠标指针：两列卡片，排在本页最末 */}
			<div className="mb-10">
				<SettingHeading title={model.labels.sections.cursor} section={SETTINGS_SECTION["appearance-cursor"]} className="mb-4" />
				<div className="grid grid-cols-2 gap-4">
					{model.cursorOptions.map((option) => (
						<CursorStyleCard
							key={option.id}
							{...option}
							onSelect={model.actions.setCursorStyle}
						/>
					))}
				</div>
			</div>
		</div>
	);
}

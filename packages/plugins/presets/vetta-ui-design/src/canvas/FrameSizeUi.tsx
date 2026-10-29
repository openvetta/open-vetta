import { useTranslation } from "@vetta-org/plugin-sdk";
import { useEffect, useState } from "react";
import {
	formatSize,
	type Orientation,
	presetSize,
	SIZE_CATEGORIES,
	type SizeCategory,
	type SizeCategoryId,
	type SizePreset,
} from "./size-presets";

type Size = { width: number; height: number };

const iconProps = {
	viewBox: "0 0 24 24",
	className: "size-4",
	fill: "none",
	stroke: "currentColor",
	strokeWidth: 1.8,
	strokeLinecap: "round",
	strokeLinejoin: "round",
	"aria-hidden": true,
} as const;

export const categoryIcons: Record<SizeCategoryId, JSX.Element> = {
	phone: (
		<svg {...iconProps}>
			<rect x="7" y="2.5" width="10" height="19" rx="2.5" />
			<path d="M11 18.5h2" />
		</svg>
	),
	desktop: (
		<svg {...iconProps}>
			<rect x="3" y="4" width="18" height="12" rx="2" />
			<path d="M8 20h8M12 16v4" />
		</svg>
	),
	watch: (
		<svg {...iconProps}>
			<rect x="7" y="6.5" width="10" height="11" rx="3" />
			<path d="M9.5 6.5l.8-3.5h3.4l.8 3.5M9.5 17.5l.8 3.5h3.4l.8-3.5" />
		</svg>
	),
	paper: (
		<svg {...iconProps}>
			<path d="M7 3h7l4 4v14H7z" />
			<path d="M14 3v4h4" />
		</svg>
	),
	ipad: (
		<svg {...iconProps}>
			<rect x="4" y="3" width="16" height="18" rx="2.5" />
			<path d="M11 18h2" />
		</svg>
	),
};

export const sizeIcon = (
	<svg {...iconProps} className="size-3.5" strokeWidth={2}>
		<path d="M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6" />
	</svg>
);

function matches(size: Size, other: Size): boolean {
	return size.width === other.width && size.height === other.height;
}

/** 当前尺寸落在哪个分类的哪个预设里（横竖都认），用来默认展开分类、高亮预设。 */
export function categoryOf(size: Size): SizeCategoryId | null {
	for (const category of SIZE_CATEGORIES) {
		for (const preset of category.presets) {
			if (matches(size, preset) || (category.orientable && matches(size, { width: preset.height, height: preset.width }))) {
				return category.id;
			}
		}
	}
	return null;
}

function OrientationToggle({ value, onChange }: { value: Orientation; onChange(value: Orientation): void }) {
	const { t } = useTranslation();
	return (
		<div className="inline-flex rounded-full bg-secondary p-0.5 text-[11px] font-medium" role="group">
			{(["portrait", "landscape"] as const).map((option) => (
				<button
					key={option}
					type="button"
					aria-pressed={value === option}
					onClick={() => onChange(option)}
					className={`rounded-full px-2.5 py-0.5 transition-colors ${
						value === option ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
					}`}
				>
					{t(`canvas.size.${option}`)}
				</button>
			))}
		</div>
	);
}

const PREVIEW_BOX = 64;

function PresetPreview({ size, radius }: { size: Size; radius: number }) {
	const scale = Math.min((PREVIEW_BOX - 8) / size.width, (PREVIEW_BOX - 8) / size.height);
	return (
		<div className="flex items-center justify-center" style={{ width: PREVIEW_BOX, height: PREVIEW_BOX }}>
			<div
				className="border-2 border-muted-foreground/45 bg-background"
				style={{
					width: Math.max(8, Math.round(size.width * scale)),
					height: Math.max(8, Math.round(size.height * scale)),
					// 外形带上设备的真实圆角（按同一比例缩小），一眼分得出 iPhone 和 iPad。
					borderRadius: Math.round(radius * scale),
				}}
			/>
		</div>
	);
}

/**
 * Frame 工具的底部面板内容：顶部一排分类 tab（图标 + 文字），下面横向排着该分类的预设，
 * 每张卡片是按比例缩小的外形 + 名称 + 像素；点一下就在画布中创建。
 */
export function FrameSizePanel({
	target,
	onPick,
}: {
	/** 非 null = 改尺寸模式：改的是这个 frame；null = 新建。 */
	target: { name: string; size: Size } | null;
	onPick(size: Size, radius: number, preset: SizePreset): void;
}) {
	const { t } = useTranslation();
	const [active, setActive] = useState<SizeCategoryId>("phone");
	const [orientation, setOrientation] = useState<Orientation>("portrait");
	const category = SIZE_CATEGORIES.find((entry) => entry.id === active) ?? SIZE_CATEGORIES[0];

	// 进入改尺寸模式时，直接翻到它现在所属的分类（iPad 横着的就切到横屏）；匹配不上就留在原处。
	const targetWidth = target?.size.width;
	const targetHeight = target?.size.height;
	// biome-ignore lint/correctness/useExhaustiveDependencies: 只在目标 frame 的尺寸变化时同步
	useEffect(() => {
		if (targetWidth === undefined || targetHeight === undefined) return;
		const found = categoryOf({ width: targetWidth, height: targetHeight });
		if (found === null) return;
		setActive(found);
		if (found === "ipad") setOrientation(targetWidth > targetHeight ? "landscape" : "portrait");
	}, [target === null, targetWidth, targetHeight]);

	return (
		<div className="flex h-full flex-col">
			<div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/70 px-3 pt-2.5 pb-2">
				<div role="tablist" className="flex items-center gap-1">
					{SIZE_CATEGORIES.map((entry) => (
						<button
							key={entry.id}
							type="button"
							role="tab"
							aria-selected={active === entry.id}
							onClick={() => setActive(entry.id)}
							className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors ${
								active === entry.id
									? "bg-primary text-primary-foreground"
									: "text-muted-foreground hover:bg-accent hover:text-foreground"
							}`}
						>
							{categoryIcons[entry.id]}
							{t(`canvas.size.category.${entry.id}`)}
						</button>
					))}
				</div>
				<div className="flex min-w-0 items-center gap-3">
					<span className="hidden truncate text-[11px] text-muted-foreground sm:inline">
						{target ? t("canvas.size.panelHintResize", { name: target.name }) : t("canvas.size.panelHint")}
					</span>
					{category.orientable ? <OrientationToggle value={orientation} onChange={setOrientation} /> : null}
				</div>
			</div>
			<div role="tabpanel" className="flex min-h-0 flex-1 items-stretch gap-2 overflow-x-auto px-3 py-3">
				{category.presets.map((preset) => {
					const size = presetSize(category, preset, orientation);
					// 改尺寸模式下，与目标 frame 当前尺寸一致的那张卡标出来。
					const current = target !== null && matches(target.size, size);
					return (
						<button
							key={`${preset.id}-${orientation}`}
							type="button"
							onClick={() => onPick(size, preset.radius ?? 0, preset)}
							title={`${preset.name} · ${formatSize(size)}`}
							className={`group flex w-32 shrink-0 flex-col items-center justify-between gap-1 rounded-xl border px-2 py-2 transition-colors hover:border-primary/40 hover:bg-accent ${
								current ? "border-primary/60 bg-primary/10" : "border-transparent bg-secondary/60"
							}`}
						>
							<PresetPreview size={size} radius={preset.radius ?? 0} />
							<span className="flex w-full min-w-0 flex-col items-center leading-tight">
								<span className="w-full truncate text-center text-xs font-medium text-foreground">{preset.name}</span>
								<span className="text-[11px] tabular-nums text-muted-foreground">{formatSize(size)}</span>
							</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}

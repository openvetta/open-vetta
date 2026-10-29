import { useTranslation } from "@vetta-org/plugin-sdk";
import { type RefObject, useEffect, useState } from "react";
import { categoryIcons, OrientationToggle } from "../canvas/FrameSizeUi";
import type { InteractionMode } from "../vetd/interaction-mode";
import { formatSize, type Orientation, presetSize, SIZE_CATEGORIES } from "../vetd/size-presets";
import { type DeviceChoice, defaultCategory, resolveChoice } from "./device-choice";

interface DevicePopoverProps {
	mode: InteractionMode;
	/** 当前生效的设备预设；null = 跟随设计稿（或选的预设与设备类型对不上而被忽略）。 */
	device: DeviceChoice | null;
	/** 触发按钮所在的容器：点它自己不算「点到外面」，否则会先关再开。 */
	boundaryRef: RefObject<HTMLElement | null>;
	onPickDevice(choice: DeviceChoice | null): void;
	onClose(): void;
}

function Item({
	selected,
	meta,
	onClick,
	children,
}: {
	selected: boolean;
	/** 右侧的弱化文字（像素尺寸）。 */
	meta?: string;
	onClick(): void;
	children: string;
}) {
	return (
		<button
			type="button"
			role="menuitemradio"
			aria-checked={selected}
			onClick={onClick}
			className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs text-foreground transition-colors hover:bg-accent"
		>
			<span className="flex size-3 shrink-0 items-center justify-center">
				{selected ? (
					<svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
						<path d="M5 12l5 5 9-10" strokeLinecap="round" strokeLinejoin="round" />
					</svg>
				) : null}
			</span>
			<span className="min-w-0 flex-1 truncate">{children}</span>
			{meta ? <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{meta}</span> : null}
		</button>
	);
}

/**
 * 设备预设浮层。没有单独的「设备类型」：类型由选的预设所属的分类决定（见 device-choice.ts），
 * 再留一个独立的类型选择就会和预设互相冲突。
 *
 * 预设与画布底部的尺寸面板同源（SIZE_CATEGORIES：Phone / Desktop / Watch / 纸张 / iPad），
 * 名称、像素、圆角、iPad 的横竖屏都一样，都能选。选了预设，交互视图的视口就是它的尺寸。
 * 配色完全走宿主主题（bg-card / text-foreground）：浮层是盖在舞台上的一层，不该再沿用舞台底色。
 */
export function DevicePopover({ mode, device, boundaryRef, onPickDevice, onClose }: DevicePopoverProps) {
	const { t } = useTranslation();
	const [active, setActive] = useState(() => defaultCategory(device, mode));
	const [orientation, setOrientation] = useState<Orientation>(device?.orientation ?? "portrait");
	const category = SIZE_CATEGORIES.find((entry) => entry.id === active) ?? SIZE_CATEGORIES[0];
	const chosen = resolveChoice(device);

	useEffect(() => {
		const onPointerDown = (event: PointerEvent): void => {
			if (!boundaryRef.current?.contains(event.target as Node)) onClose();
		};
		const onKeyDown = (event: KeyboardEvent): void => {
			if (event.key === "Escape") onClose();
		};
		window.addEventListener("pointerdown", onPointerDown, true);
		window.addEventListener("keydown", onKeyDown, true);
		// 点进设计页的 iframe 不会有宿主的 pointerdown，但宿主窗口会失焦。
		window.addEventListener("blur", onClose);
		return () => {
			window.removeEventListener("pointerdown", onPointerDown, true);
			window.removeEventListener("keydown", onKeyDown, true);
			window.removeEventListener("blur", onClose);
		};
	}, [boundaryRef, onClose]);

	return (
		<div
			role="menu"
			aria-label={t("interaction.deviceMenu")}
			className="absolute right-0 top-full z-50 mt-1.5 w-64 rounded-xl border border-border bg-card p-1.5 text-foreground shadow-lg"
		>
			<div className="flex items-center justify-between gap-2 px-2 pb-1 pt-0.5">
				<span className="text-[11px] text-muted-foreground">{t("interaction.device")}</span>
				{category.orientable ? <OrientationToggle value={orientation} onChange={setOrientation} /> : null}
			</div>
			<div role="tablist" className="mb-1 flex items-center gap-1 px-1">
				{SIZE_CATEGORIES.map((entry) => (
					<button
						key={entry.id}
						type="button"
						role="tab"
						aria-selected={active === entry.id}
						aria-label={t(`canvas.size.category.${entry.id}`)}
						title={t(`canvas.size.category.${entry.id}`)}
						onClick={() => setActive(entry.id)}
						className={`flex h-7 flex-1 items-center justify-center rounded-full transition-colors ${
							active === entry.id
								? "bg-primary text-primary-foreground"
								: "text-muted-foreground hover:bg-accent hover:text-foreground"
						}`}
					>
						{categoryIcons[entry.id]}
					</button>
				))}
			</div>
			<div className="px-2 pb-1 text-[11px] text-muted-foreground">{t(`canvas.size.category.${category.id}`)}</div>
			<div className="max-h-56 overflow-y-auto">
				<Item
					selected={device === null}
					onClick={() => {
						onPickDevice(null);
						onClose();
					}}
				>
					{t("interaction.device.follow")}
				</Item>
				{category.presets.map((preset) => {
					const size = presetSize(category, preset, orientation);
					const selected =
						chosen?.preset.id === preset.id && (!category.orientable || device?.orientation === orientation);
					return (
						<Item
							key={preset.id}
							selected={selected}
							meta={formatSize(size)}
							onClick={() => {
								onPickDevice({ id: preset.id, orientation: category.orientable ? orientation : "portrait" });
								onClose();
							}}
						>
							{preset.name}
						</Item>
					);
				})}
			</div>
		</div>
	);
}

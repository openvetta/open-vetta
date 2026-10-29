import { useTranslation } from "@vetta-org/plugin-sdk";
import { type RefObject, useEffect } from "react";
import { INTERACTION_MODES, type InteractionMode } from "../vetd/interaction-mode";
import { PHONE_PRESETS } from "./phone-shell";

interface DevicePopoverProps {
	mode: InteractionMode;
	/** 手机机型：null 跟随设计稿。 */
	deviceId: string | null;
	/** 触发按钮所在的容器：点它自己不算「点到外面」，否则会先关再开。 */
	boundaryRef: RefObject<HTMLElement | null>;
	onPickMode(mode: InteractionMode): void;
	onPickDevice(id: string | null): void;
	onClose(): void;
}

function Item({ selected, onClick, children }: { selected: boolean; onClick(): void; children: string }) {
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
			<span className="truncate">{children}</span>
		</button>
	);
}

/**
 * 设备类型 + 手机机型合在一个浮层里：类型三选一，选了移动端才多出机型一栏。
 * 配色完全走宿主主题（bg-card / text-foreground）：浮层是盖在舞台上的一层，不该再沿用舞台底色。
 */
export function DevicePopover({ mode, deviceId, boundaryRef, onPickMode, onPickDevice, onClose }: DevicePopoverProps) {
	const { t } = useTranslation();

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
			className="absolute right-0 top-full z-50 mt-1.5 w-48 rounded-xl border border-border bg-card p-1.5 text-foreground shadow-lg"
		>
			<div className="px-2 pb-1 pt-0.5 text-[11px] text-muted-foreground">
				{t("interaction.deviceType")}
			</div>
			{INTERACTION_MODES.map((entry) => (
				<Item
					key={entry}
					selected={entry === mode}
					onClick={() => {
						onPickMode(entry);
						// 选了移动端还要接着选机型，浮层留着；其他类型选完就收。
						if (entry !== "mobile") onClose();
					}}
				>
					{t(`interaction.mode.${entry}`)}
				</Item>
			))}
			{mode === "mobile" ? (
				<>
					<div className="mx-1 my-1.5 h-px bg-border" />
					<div className="px-2 pb-1 text-[11px] text-muted-foreground">
						{t("interaction.device")}
					</div>
					<div className="max-h-52 overflow-y-auto">
						<Item
							selected={deviceId === null}
							onClick={() => {
								onPickDevice(null);
								onClose();
							}}
						>
							{t("interaction.device.follow")}
						</Item>
						{PHONE_PRESETS.map((preset) => (
							<Item
								key={preset.id}
								selected={deviceId === preset.id}
								onClick={() => {
									onPickDevice(preset.id);
									onClose();
								}}
							>
								{preset.name}
							</Item>
						))}
					</div>
				</>
			) : null}
		</div>
	);
}

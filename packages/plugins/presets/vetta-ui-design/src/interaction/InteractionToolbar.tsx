import { useTranslation } from "@vetta-org/plugin-sdk";
import type { JSX } from "react";
import { INTERACTION_MODES, type InteractionMode } from "../vetd/interaction-mode";
import { PHONE_PRESETS } from "./phone-shell";

interface InteractionToolbarProps {
	path: string;
	canBack: boolean;
	canForward: boolean;
	frames: readonly { id: string; title: string }[];
	currentFrameId: string | null;
	mode: InteractionMode;
	/** 手机机型：null 跟随设计稿。只在移动端显示下拉。 */
	deviceId: string | null;
	onPickDevice(id: string | null): void;
	onBack(): void;
	onForward(): void;
	onReload(): void;
	onHome(): void;
	onPickFrame(frameId: string): void;
	onPickMode(mode: InteractionMode): void;
	onOpenExternal(): void;
}

const icons = {
	back: <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />,
	forward: <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />,
	reload: <path d="M20 11a8 8 0 10-2.3 5.7M20 5v6h-6" strokeLinecap="round" strokeLinejoin="round" />,
	home: <path d="M4 11l8-7 8 7v8a1 1 0 01-1 1h-4v-6h-6v6H5a1 1 0 01-1-1v-8z" strokeLinecap="round" strokeLinejoin="round" />,
	external: (
		<>
				<path d="M14 4h6v6" strokeLinecap="round" strokeLinejoin="round" />
				<path d="M20 4l-9 9" strokeLinecap="round" />
				<path d="M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" strokeLinecap="round" strokeLinejoin="round" />
		</>
	),
};

function IconButton({
	label,
	disabled,
	onClick,
	children,
}: {
	label: string;
	disabled?: boolean;
	onClick(): void;
	children: JSX.Element;
}) {
	return (
		<button
			type="button"
			title={label}
			aria-label={label}
			disabled={disabled}
			onClick={onClick}
			className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent"
		>
			<svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
				{children}
			</svg>
		</button>
	);
}

/** 交互模式顶部的导航条：前进后退刷新、当前路径、跳页面、设备类别。纯展示，状态归 InteractionView。 */
export function InteractionToolbar({
	path,
	canBack,
	canForward,
	frames,
	currentFrameId,
	mode,
	deviceId,
	onPickDevice,
	onBack,
	onForward,
	onReload,
	onHome,
	onPickFrame,
	onPickMode,
	onOpenExternal,
}: InteractionToolbarProps) {
	const { t } = useTranslation();
	return (
		<>
		<div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
			<IconButton label={t("interaction.back")} disabled={!canBack} onClick={onBack}>
				{icons.back}
			</IconButton>
			<IconButton label={t("interaction.forward")} disabled={!canForward} onClick={onForward}>
				{icons.forward}
			</IconButton>
			<IconButton label={t("interaction.reload")} onClick={onReload}>
				{icons.reload}
			</IconButton>
			<IconButton label={t("interaction.home")} onClick={onHome}>
				{icons.home}
			</IconButton>
			<span
				className="max-w-32 truncate rounded-lg bg-muted px-2 py-1 text-xs text-muted-foreground"
				title={path}
			>
				{path}
			</span>
			<select
				value={currentFrameId ?? ""}
				onChange={(event) => event.target.value && onPickFrame(event.target.value)}
				title={t("interaction.pages")}
				aria-label={t("interaction.pages")}
				className="min-w-14 max-w-32 truncate rounded-lg border-none bg-muted px-1.5 py-1 text-xs text-foreground outline-none focus:outline-none"
			>
				{currentFrameId === null ? <option value="">{t("interaction.pages")}</option> : null}
				{frames.map((frame) => (
					<option key={frame.id} value={frame.id}>
						{frame.title}
					</option>
				))}
			</select>
		</div>
		<div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
			{mode === "mobile" ? (
				<select
					value={deviceId ?? ""}
					onChange={(event) => onPickDevice(event.target.value || null)}
					title={t("interaction.device")}
					aria-label={t("interaction.device")}
					className="min-w-14 max-w-32 truncate rounded-lg border-none bg-muted px-1.5 py-1 text-xs text-foreground outline-none focus:outline-none"
				>
					<option value="">{t("interaction.device.follow")}</option>
					{PHONE_PRESETS.map((preset) => (
						<option key={preset.id} value={preset.id}>
							{preset.name}
						</option>
					))}
				</select>
			) : null}
			<div className="flex shrink-0 items-center rounded-lg bg-muted p-0.5" role="radiogroup" aria-label={t("interaction.deviceType")}>
				{INTERACTION_MODES.map((entry) => (
					// biome-ignore lint/a11y/useSemanticElements: segmented control, not a form field
					<button
						key={entry}
						type="button"
						role="radio"
						aria-checked={entry === mode}
						onClick={() => onPickMode(entry)}
						className={`rounded-md px-2 py-0.5 text-xs transition-colors ${
							entry === mode ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
						}`}
					>
						{t(`interaction.mode.${entry}`)}
					</button>
				))}
			</div>
			<IconButton label={t("interaction.openExternal")} onClick={onOpenExternal}>
				{icons.external}
			</IconButton>
		</div>
		</>
	);
}

import { useTranslation } from "@vetta-org/plugin-sdk";
import type { ReactNode } from "react";
import type { CornerDensity } from "./responsive";
import { ExportMenu, type MaterialAction, type MaterialProgress } from "./ExportMenu";

interface CanvasCornerActionsProps {
	/** 查看模式的横幅压在画布顶部，按钮组要给它让位。 */
	offsetTop: number;
	historyOpen: boolean;
	onExport(): void;
	/** 「下载素材」下拉：每帧完整内容的原图 / PDF，直接落文件（与渲染图工作台分开）。 */
	materials: {
		selectedCount: number;
		totalCount: number;
		progress: MaterialProgress | null;
		onPick(action: MaterialAction): void;
	};
	onToggleHistory(): void;
	/** 画布变窄时的档位（见 responsive.ts）；缺省 full。 */
	density?: CornerDensity;
	/** 按钮组最右端的内容（设计 / 交互开关）。 */
	trailing?: ReactNode;
}

const icons = {
	history: (
		<svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
			<path d="M3 12a9 9 0 1 0 3-6.7L3 8" strokeLinecap="round" strokeLinejoin="round" />
			<path d="M3 4v4h4" strokeLinecap="round" strokeLinejoin="round" />
			<path d="M12 7.5V12l3 2" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	),
};

function Action({
	label,
	showLabel = false,
	active,
	onClick,
	children,
}: {
	label: string;
	/** true 时把 label 写在图标右边（打开面板类的动作，纯 icon 认不出来）。 */
	showLabel?: boolean;
	/** 对应面板开着时高亮；一次性动作传 false。 */
	active: boolean;
	onClick(): void;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			title={label}
			aria-label={label}
			aria-pressed={active}
			onClick={onClick}
			className={`flex h-8 items-center justify-center rounded-full border border-border transition-colors ${
				showLabel ? "gap-1.5 px-3 text-xs font-medium" : "w-8"
			} ${active ? "bg-primary/10 text-primary" : "bg-popover text-foreground hover:bg-accent"}`}
		>
			{children}
			{showLabel ? <span className="whitespace-nowrap">{label}</span> : null}
		</button>
	);
}

/**
 * 画布右上角的动作按钮组：版本历史 / 导出 / 运行；各自独立的胶囊，不再合在一条 bar 上。
 *
 * 不放进 ControlBar：那一排是「用什么工具画」（选择、拖手、画框、备注、缩放；备注显隐开关也在那里），
 * 这些不是画布工具，混进去还会让本来就长的 dock 再长一截。
 */
export function CanvasCornerActions({
	offsetTop,
	historyOpen,
	onExport,
	materials,
	onToggleHistory,
	density = "full",
	trailing,
}: CanvasCornerActionsProps) {
	const { t } = useTranslation();
	return (
		<div
			style={{ top: 12 + offsetTop }}
			className="pointer-events-auto absolute right-3 z-40 flex items-center gap-2"
			// 同历史抽屉：不截断的话画布根会捕获指针，按钮点不动。
			onPointerDown={(event) => event.stopPropagation()}
			onPointerMove={(event) => event.stopPropagation()}
			onPointerUp={(event) => event.stopPropagation()}
		>
			<Action label={t("controlbar.history")} showLabel={density === "full"} active={historyOpen} onClick={onToggleHistory}>
				{icons.history}
			</Action>
			<ExportMenu
				selectedCount={materials.selectedCount}
				totalCount={materials.totalCount}
				progress={materials.progress}
				onPick={materials.onPick}
				onMakeMockup={onExport}
				iconOnly={density !== "full"}
			/>
			{trailing}
		</div>
	);
}

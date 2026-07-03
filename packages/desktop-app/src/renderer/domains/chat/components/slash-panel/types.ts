import type { SkillInfo } from "@preload/api";

export interface SlashPanelProps {
	open: boolean;
	onClose: () => void;
	onSelect: (skill: SkillInfo) => void;
	filter: string;
	/**
	 * "top"（默认）面板从锚点上方弹出，匹配会话页 InputBar 在屏幕底部的形态。
	 * "bottom" 朝下展开，用于面板锚点位于容器顶部、上方被 overflow 裁切的场景
	 * （如 Dialog 顶部的 prompt 区）。
	 */
	placement?: "top" | "bottom";
	/** 当前会话/项目 cwd，用于列出项目级 `<cwd>/.agents/skills` 与 `<cwd>/.vetta/skills`。 */
	cwd?: string;
	className?: string;
	classNames?: SlashPanelClassNames;
}

export interface SlashPanelClassNames {
	root?: string;
	content?: string;
	header?: string;
	list?: string;
	item?: string;
}

export interface SlashPanelItemModel {
	skill: SkillInfo;
	index: number;
	active: boolean;
	sourceLabel: string;
}

export interface SlashPanelLabels {
	header: string;
	resultCount: string;
	emptyNoMatch: string;
	emptyNoSkills: string;
	scenesSection: string;
	skillsSection: string;
}

export interface SlashPanelViewProps {
	open: boolean;
	placement: "top" | "bottom";
	normalizedFilter: string;
	scenes: SlashPanelItemModel[];
	standardSkills: SlashPanelItemModel[];
	allItemsCount: number;
	labels: SlashPanelLabels;
	panelRef: React.RefObject<HTMLDivElement | null>;
	className?: string;
	classNames?: SlashPanelClassNames;
	onHoverItem: (index: number) => void;
	onSelectItem: (skill: SkillInfo) => void;
}

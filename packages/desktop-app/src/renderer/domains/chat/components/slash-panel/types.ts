import type { SkillInfo } from "@preload/api";
import type {
	SlashPanelClassNames,
	SlashPanelLabels,
	SlashPanelSkillItem,
	SlashPanelItemModel as ThemeSlashPanelItemModel,
	SlashPanelViewProps as ThemeSlashPanelViewProps,
} from "@vetta/theme-ui/chat";

export type { SlashPanelClassNames, SlashPanelLabels, SlashPanelSkillItem };

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

/** Host keeps full SkillInfo; view only needs the render subset. */
export interface SlashPanelItemModel extends Omit<ThemeSlashPanelItemModel, "skill"> {
	skill: SkillInfo;
}

export interface SlashPanelViewProps
	extends Omit<ThemeSlashPanelViewProps, "scenes" | "standardSkills" | "onSelectItem"> {
	scenes: SlashPanelItemModel[];
	standardSkills: SlashPanelItemModel[];
	onSelectItem: (skill: SkillInfo) => void;
}

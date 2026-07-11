import type { ComponentPropsWithoutRef } from "react";

export interface NewSessionSkillItem {
	readonly alias?: string;
	readonly description: string;
	readonly name: string;
}

export interface NewSessionSceneItem {
	readonly alias?: string;
	readonly description: string;
	readonly downloadCount?: number;
	readonly name: string;
	readonly state: "active" | "disabled" | "uninstalled";
	readonly version?: string;
}

export interface NewSessionSkillSelection {
	readonly alias?: string;
	readonly name: string;
	readonly type?: string;
}

export type NewSessionSelection = NewSessionSkillSelection | null;

export type NewSessionSceneActionState = "idle" | "loading" | "error";

export interface NewSessionGuidingWordsGroup {
	readonly id: string;
	readonly name: string;
	readonly pageKey: number;
	readonly words: readonly string[];
}

export interface NewSessionGuidingWordsProps extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
	readonly groups: readonly NewSessionGuidingWordsGroup[];
	readonly mounted: boolean;
	readonly onPick: (word: string) => void;
}

export interface NewSessionSkillBadgeRowLabels {
	readonly scrollLeft: string;
	readonly scrollRight: string;
}

export interface NewSessionSkillBadgeRowProps extends Omit<ComponentPropsWithoutRef<"div">, "children" | "onSelect"> {
	readonly labels: NewSessionSkillBadgeRowLabels;
	readonly onSelect: (skill: NewSessionSkillItem) => void;
	readonly selected: NewSessionSelection;
	readonly skills: readonly NewSessionSkillItem[];
}

export interface NewSessionSceneCarouselLabels {
	readonly installPrompt: string;
	readonly next: string;
	readonly previous: string;
}

export interface NewSessionSceneCarouselProps extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
	readonly actions: Readonly<Record<string, NewSessionSceneActionState>>;
	readonly labels: NewSessionSceneCarouselLabels;
	readonly onSceneClick: (scene: NewSessionSceneItem) => void;
	readonly scenes: readonly NewSessionSceneItem[];
	readonly selected: NewSessionSelection;
}

/** 新会话页欢迎区（标题/副标题/头像/场景轮播）。主题可覆盖以替换装饰与布局。 */
export interface NewSessionHeroProps extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
	/** 默认实现里 BotAvatar 的 idle 手势循环；主题若不渲染头像可忽略。 */
	readonly avatarAutoplay: boolean;
	readonly greetingTitle: string;
	readonly mounted: boolean;
	readonly onSceneClick: (scene: NewSessionSceneItem) => void;
	readonly sceneActions: Readonly<Record<string, NewSessionSceneActionState>>;
	/** 场景轮播文案（host 已 i18n）；主题若复用场景轮播应透传。 */
	readonly sceneLabels: NewSessionSceneCarouselLabels;
	readonly scenes: readonly NewSessionSceneItem[];
	readonly selected: NewSessionSelection;
	readonly subtitle: string;
}

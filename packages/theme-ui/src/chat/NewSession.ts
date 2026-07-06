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

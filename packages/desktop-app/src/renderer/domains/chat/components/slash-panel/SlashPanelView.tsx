import type { SkillInfo } from "@preload/api";
import {
	SlashPanelView as ThemeSlashPanelView,
	type SlashPanelViewProps as ThemeSlashPanelViewProps,
} from "@vetta/theme-ui/chat";
import type { SlashPanelViewProps } from "./types";

export type {
	SlashPanelClassNames,
	SlashPanelItemModel,
	SlashPanelLabels,
	SlashPanelSkillItem,
	SlashPanelViewProps,
} from "./types";

/** Adapter: host SkillInfo is a structural superset of the theme-ui skill render shape. */
export function SlashPanelView(props: SlashPanelViewProps): JSX.Element {
	return (
		<ThemeSlashPanelView
			{...(props as unknown as ThemeSlashPanelViewProps)}
			onSelectItem={(skill) => props.onSelectItem(skill as SkillInfo)}
		/>
	);
}

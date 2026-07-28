import { useThemeComponent } from "@vetta/theme-sdk";
import { useSlashPanelModel } from "../hooks/useSlashPanelModel";
import { SlashPanelView } from "./slash-panel/SlashPanelView";
import type { SlashPanelProps } from "./slash-panel/types";

export function SlashPanel(props: SlashPanelProps): JSX.Element {
	const model = useSlashPanelModel(props);
	const ThemedSlashPanelView = useThemeComponent("chat.slashPanelView", SlashPanelView);
	return <ThemedSlashPanelView {...model.viewProps} />;
}

export type { SlashPanelProps, SlashPanelViewProps } from "./slash-panel/types";

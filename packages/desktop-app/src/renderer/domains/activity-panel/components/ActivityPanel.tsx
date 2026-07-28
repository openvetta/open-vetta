import { useThemeComponent } from "@vetta/theme-sdk";
import { useActivityPanelModel } from "../hooks/useActivityPanelModel";
import { ActivityPanelFrame } from "./activity-panel/ActivityPanelFrame";
import { ActivityPanelView } from "./activity-panel/ActivityPanelView";
import type { ActivityPanelProps } from "./activity-panel/types";

export function ActivityPanel(props: ActivityPanelProps = {}): JSX.Element {
	const { actions, model } = useActivityPanelModel(props);
	const Frame = useThemeComponent("activity.panelFrame", ActivityPanelFrame);
	return <ActivityPanelView actions={actions} Frame={Frame} model={model} />;
}

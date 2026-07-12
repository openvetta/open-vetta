import { FlowingPanelView } from "@vetta/theme-ui/flowing";
import { useFlowingPanelModel } from "../hooks/useFlowingPanelModel";

export function FlowingPanel(): JSX.Element {
	const model = useFlowingPanelModel();
	return <FlowingPanelView {...model} />;
}

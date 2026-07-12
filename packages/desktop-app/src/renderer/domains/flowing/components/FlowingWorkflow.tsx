import { FlowingWorkflowView } from "@vetta/theme-ui/flowing";
import { useFlowingWorkflowModel } from "../hooks/useFlowingWorkflowModel";

type FlowingWorkflowProps = {
	flowingId: number;
};

export function FlowingWorkflow({ flowingId }: FlowingWorkflowProps) {
	const model = useFlowingWorkflowModel(flowingId);
	if (!model) return null;
	return <FlowingWorkflowView {...model} />;
}

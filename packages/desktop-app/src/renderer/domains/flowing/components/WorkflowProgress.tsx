import type { WorkflowInstance } from "@shared/lib/api";
import { WorkflowProgressView } from "@vetta/theme-ui/flowing";
import { useWorkflowProgressModel } from "../hooks/useWorkflowProgressModel";

interface WorkflowProgressProps {
	instance: WorkflowInstance;
}

export function WorkflowProgress({ instance }: WorkflowProgressProps): JSX.Element {
	const model = useWorkflowProgressModel(instance);
	return <WorkflowProgressView {...model} />;
}

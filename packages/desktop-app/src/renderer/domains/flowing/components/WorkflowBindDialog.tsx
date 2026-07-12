import { useWorkflowBindDialogModel } from "../hooks/useWorkflowBindDialogModel";
import { WorkflowBindDialogView } from "./WorkflowBindDialogView";

interface WorkflowBindDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	projectDir: string;
	projectName: string;
	flowingId?: number;
}

export function WorkflowBindDialog(props: WorkflowBindDialogProps): JSX.Element {
	const model = useWorkflowBindDialogModel(props);
	return <WorkflowBindDialogView {...model} />;
}

import { useThemeComponent } from "@vetta/theme-sdk";
import { useWorkflowCompleteDialogModel } from "../hooks/useWorkflowCompleteDialogModel";
import { WorkflowCompleteDialogView } from "./WorkflowCompleteDialogView";

export function WorkflowCompleteDialog(): JSX.Element {
	const model = useWorkflowCompleteDialogModel();
	const ThemedWorkflowCompleteDialogView = useThemeComponent(
		"root.workflowCompleteDialogView",
		WorkflowCompleteDialogView,
	);
	return <ThemedWorkflowCompleteDialogView {...model} />;
}

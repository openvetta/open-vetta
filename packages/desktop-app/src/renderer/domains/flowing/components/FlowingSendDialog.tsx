import { useThemeComponent } from "@vetta/theme-sdk";
import { useFlowingSendDialogModel } from "../hooks/useFlowingSendDialogModel";
import { FlowingSendDialogView } from "./FlowingSendDialogView";

export function FlowingSendDialog(): JSX.Element {
	const model = useFlowingSendDialogModel();
	const ThemedFlowingSendDialogView = useThemeComponent("root.flowingSendDialogView", FlowingSendDialogView);
	return <ThemedFlowingSendDialogView {...model} />;
}

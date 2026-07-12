import type { Button } from "../../components/ui/button";
type HostButton = typeof Button;
export type { HostButton as _HostPrimitiveHoldButton };
import { useThemeComponent } from "@vetta/theme-sdk";
import { SchedulerEditApprovalDrawerView } from "./SchedulerEditApprovalDrawerView";
import type { SchedulerUpdateApprovalModel } from "./useSchedulerUpdateApprovalModel";

export function SchedulerUpdateApprovalView(model: SchedulerUpdateApprovalModel): JSX.Element {
	const ThemedSchedulerEditApprovalDrawerView = useThemeComponent(
		"root.approval.schedulerEditView",
		SchedulerEditApprovalDrawerView,
	);
	return <ThemedSchedulerEditApprovalDrawerView {...model.drawer} />;
}

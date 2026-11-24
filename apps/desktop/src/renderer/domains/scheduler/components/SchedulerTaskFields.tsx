import type { AutomationDraft } from "../automation-draft";
import { useSchedulerTaskFieldsModel } from "../hooks/useSchedulerTaskFieldsModel";
import { SchedulerTaskFieldsView } from "./SchedulerTaskFieldsView";

export type { AutomationDraft } from "../automation-draft";

interface SchedulerTaskFieldsProps {
	value: AutomationDraft;
	onChange: (value: AutomationDraft) => void;
	namePlaceholder?: string;
	showEnabled?: boolean;
	/** 插件与 Agent 的接口不含 Claw 发送，审批表单关掉这一项。 */
	showClaw?: boolean;
	promptMinHeight?: number;
}

export function SchedulerTaskFields({
	value,
	onChange,
	namePlaceholder,
	showEnabled = false,
	showClaw = true,
	promptMinHeight = 120,
}: SchedulerTaskFieldsProps): JSX.Element {
	return (
		<SchedulerTaskFieldsView
			{...useSchedulerTaskFieldsModel({ namePlaceholder, onChange, value, showEnabled })}
			promptMinHeight={promptMinHeight}
			showClaw={showClaw}
		/>
	);
}

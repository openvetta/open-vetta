import {
	WorkflowBindDialogView as ThemeWorkflowBindDialogView,
	type WorkflowBindDialogViewProps as ThemeProps,
} from "@vetta/theme-ui/flowing";
import type { WorkflowTemplate } from "@shared/lib/api";

export interface WorkflowBindDialogViewProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	loading: boolean;
	workflows: readonly WorkflowTemplate[];
	selectedId: number | null;
	onSelect: (id: number) => void;
	binding: boolean;
	error: string | null;
	onBind: () => void;
}

/** Desktop adapter — keep legacy Chinese copy for zero UI/behavior drift. */
export function WorkflowBindDialogView(props: WorkflowBindDialogViewProps): JSX.Element {
	const themeProps: ThemeProps = {
		...props,
		workflows: props.workflows,
		labels: {
			title: "绑定工作流",
			description: "选择一个工作流模板，绑定到当前项目",
			empty: "暂无可用工作流",
			stageCount: (n) => `${n} 个阶段`,
			cancel: "取消",
			binding: "绑定中",
			bind: "绑定",
		},
	};
	return <ThemeWorkflowBindDialogView {...themeProps} />;
}

import { bindWorkflow, fetchAvailableWorkflows, type WorkflowInstance, type WorkflowTemplate } from "@shared/lib/api";
import { authTokenAtom, workflowInstanceAtom } from "@shared/store/atoms";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import type { WorkflowBindDialogViewProps } from "../components/WorkflowBindDialogView";

export function useWorkflowBindDialogModel(input: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	projectDir: string;
	projectName: string;
	flowingId?: number;
}): WorkflowBindDialogViewProps {
	const token = useAtomValue(authTokenAtom);
	const setWorkflowInstance = useSetAtom(workflowInstanceAtom);

	const [workflows, setWorkflows] = useState<WorkflowTemplate[]>([]);
	const [loading, setLoading] = useState(false);
	const [selectedId, setSelectedId] = useState<number | null>(null);
	const [binding, setBinding] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!input.open || !token) return;
		setLoading(true);
		setError(null);
		fetchAvailableWorkflows(token)
			.then((list) => {
				setWorkflows(list);
				setSelectedId(null);
			})
			.catch((err) => {
				setError(err instanceof Error ? err.message : "加载工作流失败");
			})
			.finally(() => setLoading(false));
	}, [input.open, token]);

	const handleBind = useCallback(async () => {
		if (!token || selectedId === null) return;
		setBinding(true);
		setError(null);
		try {
			const instance: WorkflowInstance = await bindWorkflow(token, {
				workflow_id: selectedId,
				project_name: input.projectName,
				flowing_id: input.flowingId,
			});

			await window.vetta.flowing.writeMeta(input.projectDir, {
				type: "flowing",
				flowingId: instance.flowing_id,
				workflowInstanceId: instance.id,
			});

			setWorkflowInstance(instance);
			input.onOpenChange(false);
		} catch (err) {
			setError(err instanceof Error ? err.message : "绑定工作流失败");
		} finally {
			setBinding(false);
		}
	}, [token, selectedId, input, setWorkflowInstance]);

	return {
		open: input.open,
		onOpenChange: input.onOpenChange,
		loading,
		workflows,
		selectedId,
		onSelect: setSelectedId,
		binding,
		error,
		onBind: () => void handleBind(),
	};
}

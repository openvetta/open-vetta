import { completeWorkflowStage, uploadFlowingFile } from "@shared/lib/api";
import { pathBasename } from "@shared/lib/utils";
import { activeSessionAtom, authTokenAtom, selectedFilesAtom, workflowInstanceAtom } from "@shared/store/atoms";
import { workflowCompleteDialogOpenAtom } from "@shared/store/flowing-atoms";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { WorkflowCompleteDialogViewProps } from "../components/WorkflowCompleteDialogView";

export type WorkflowCompleteDialogModel = WorkflowCompleteDialogViewProps;

export function useWorkflowCompleteDialogModel(): WorkflowCompleteDialogModel {
	const { t } = useTranslation("common");
	const [open, setOpen] = useAtom(workflowCompleteDialogOpenAtom);
	const token = useAtomValue(authTokenAtom);
	const activeSession = useAtomValue(activeSessionAtom);
	const [selectedFiles, setSelectedFiles] = useAtom(selectedFilesAtom);
	const workflowInstance = useAtomValue(workflowInstanceAtom);
	const setWorkflowInstance = useSetAtom(workflowInstanceAtom);

	const [message, setMessage] = useState("");
	const [completing, setCompleting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleAddFiles = useCallback(async () => {
		const defaultPath = activeSession?.cwd;
		const files = await window.vetta.dialog.selectFiles(defaultPath);
		if (files.length > 0) {
			setSelectedFiles((prev) => {
				const existing = new Set(prev);
				const merged = [...prev];
				for (const f of files) {
					if (!existing.has(f)) merged.push(f);
				}
				return merged;
			});
		}
	}, [activeSession, setSelectedFiles]);

	const handleRemoveFile = useCallback(
		(filePath: string) => {
			setSelectedFiles((prev) => prev.filter((f) => f !== filePath));
		},
		[setSelectedFiles],
	);

	const handleComplete = useCallback(async () => {
		if (!workflowInstance || !token || !activeSession) return;

		setCompleting(true);
		setError(null);
		try {
			const projectDir = activeSession.cwd;
			let storageKey: string | undefined;
			let fileLabels: string[] | undefined;

			if (selectedFiles.length > 0) {
				const zipBuffer = await window.vetta.flowing.packFiles(projectDir, selectedFiles, message);
				const blob = new Blob([zipBuffer], { type: "application/zip" });
				storageKey = await uploadFlowingFile(token, workflowInstance.flowing_id, blob);
				fileLabels = selectedFiles.map((p) => pathBasename(p));
			}

			await completeWorkflowStage(token, workflowInstance.id, {
				storage_key: storageKey,
				file_list: fileLabels,
				message: message || undefined,
			});

			setWorkflowInstance({
				...workflowInstance,
				status: "completed",
			});

			setOpen(false);
			setSelectedFiles([]);
			setMessage("");
		} catch (err) {
			setError(err instanceof Error ? err.message : t("workflowCompleteDialog.error"));
		} finally {
			setCompleting(false);
		}
	}, [
		workflowInstance,
		token,
		activeSession,
		selectedFiles,
		message,
		setOpen,
		setSelectedFiles,
		setWorkflowInstance,
		t,
	]);

	const currentStageName = workflowInstance
		? (workflowInstance.stages[workflowInstance.current_stage]?.name ?? "")
		: "";

	return {
		completing,
		error,
		files: selectedFiles.map((filePath) => ({ label: pathBasename(filePath), path: filePath })),
		labels: {
			add: t("flowingSendDialog.add"),
			cancel: t("actions.cancel"),
			complete: t("workflowCompleteDialog.complete"),
			completing: t("workflowCompleteDialog.completing"),
			description: t("workflowCompleteDialog.description", { stageName: currentStageName }),
			emptyFiles: t("workflowCompleteDialog.emptyFiles"),
			files: t("workflowCompleteDialog.files"),
			message: t("workflowCompleteDialog.message"),
			messageOptional: t("flowingSendDialog.optional"),
			messagePlaceholder: t("workflowCompleteDialog.messagePlaceholder"),
			title: t("workflowCompleteDialog.title"),
		},
		message,
		onAddFiles: handleAddFiles,
		onComplete: handleComplete,
		onMessageChange: setMessage,
		onOpenChange: setOpen,
		onRemoveFile: handleRemoveFile,
		open,
	};
}

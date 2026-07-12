import {
	type ColleagueInfo,
	completeWorkflowStage,
	fetchColleagues,
	fetchNextStageMembers,
	type NextStageMembers,
} from "@shared/lib/api";
import { pathBasename } from "@shared/lib/utils";
import {
	activeSessionAtom,
	authTokenAtom,
	flowingSendDialogOpenAtom,
	selectedFilesAtom,
	workflowInstanceAtom,
} from "@shared/store/atoms";
import { useAtom, useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FlowingSendDialogViewProps } from "../components/FlowingSendDialogView";
import { useFlowingSend } from "./useFlowingSend";

export type FlowingSendDialogModel = FlowingSendDialogViewProps;

export function useFlowingSendDialogModel(): FlowingSendDialogModel {
	const { t } = useTranslation("common");
	const [open, setOpen] = useAtom(flowingSendDialogOpenAtom);
	const token = useAtomValue(authTokenAtom);
	const activeSession = useAtomValue(activeSessionAtom);
	const [selectedFiles, setSelectedFiles] = useAtom(selectedFilesAtom);
	const workflowInstance = useAtomValue(workflowInstanceAtom);

	const [colleagues, setColleagues] = useState<ColleagueInfo[]>([]);
	const [selectedReceivers, setSelectedReceivers] = useState<Set<number>>(new Set());
	const [message, setMessage] = useState("");
	const { sending, error, send } = useFlowingSend();
	const [workflowError, setWorkflowError] = useState<string | null>(null);
	const [nextStageInfo, setNextStageInfo] = useState<NextStageMembers | null>(null);

	const isWorkflowBound = workflowInstance != null && workflowInstance.status === "active";

	useEffect(() => {
		if (!open || !token) return;
		setWorkflowError(null);
		setNextStageInfo(null);

		if (isWorkflowBound) {
			void fetchNextStageMembers(token, workflowInstance.id)
				.then((info) => {
					setNextStageInfo(info);
					setColleagues(info.members);
				})
				.catch((err) => {
					setWorkflowError(err instanceof Error ? err.message : t("flowingSendDialog.nextStageMembersError"));
					setColleagues([]);
				});
		} else {
			void fetchColleagues(token).then(setColleagues).catch(console.error);
		}
	}, [open, token, isWorkflowBound, workflowInstance?.id, t]);

	const toggleReceiver = useCallback((id: number) => {
		setSelectedReceivers((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}, []);

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

	const handleSend = useCallback(async () => {
		if (!activeSession || selectedReceivers.size === 0 || selectedFiles.length === 0) return;

		const projectDir = activeSession.cwd;
		const projectName = pathBasename(projectDir);

		const meta = await window.vetta.flowing.readMeta(projectDir);
		const existingFlowingId =
			meta?.type === "flowing" && typeof meta.flowingId === "number" ? meta.flowingId : undefined;

		if (isWorkflowBound && token) {
			try {
				await completeWorkflowStage(token, workflowInstance.id);
			} catch (err) {
				setWorkflowError(err instanceof Error ? err.message : t("flowingSendDialog.completeStageError"));
				return;
			}
		}

		const result = await send({
			projectDir,
			projectName,
			flowingId: existingFlowingId,
			receiverIds: [...selectedReceivers],
			message,
			filePaths: selectedFiles,
		});

		if (result && result.length > 0) {
			const flowingId = result[0].flowing_id;
			await window.vetta.flowing.writeMeta(projectDir, {
				...meta,
				type: "flowing",
				flowingId,
			});

			setOpen(false);
			setSelectedReceivers(new Set());
			setMessage("");
			setSelectedFiles([]);
			setWorkflowError(null);
			setNextStageInfo(null);
		}
	}, [
		activeSession,
		selectedReceivers,
		selectedFiles,
		message,
		send,
		setOpen,
		setSelectedFiles,
		isWorkflowBound,
		token,
		workflowInstance?.id,
		t,
	]);

	const canSend = selectedReceivers.size > 0 && selectedFiles.length > 0;

	const selectedReceiverNames = useMemo(() => {
		if (selectedReceivers.size === 0) return "";
		return colleagues
			.filter((c) => selectedReceivers.has(c.id))
			.map((c) => c.username)
			.join(", ");
	}, [colleagues, selectedReceivers]);

	const displayError = workflowError ?? error;

	return {
		canSend,
		colleagues,
		description:
			isWorkflowBound && nextStageInfo
				? t("flowingSendDialog.nextStageDescription", { stageName: nextStageInfo.stage_name })
				: t("flowingSendDialog.description"),
		displayError,
		files: selectedFiles.map((filePath) => ({ label: pathBasename(filePath), path: filePath })),
		isWorkflowBound,
		labels: {
			add: t("flowingSendDialog.add"),
			cancel: t("actions.cancel"),
			emptyFiles: t("flowingSendDialog.emptyFiles"),
			emptyMembers: t("flowingSendDialog.emptyMembers"),
			emptyNextStageMembers: t("flowingSendDialog.emptyNextStageMembers"),
			files: t("flowingSendDialog.files"),
			message: t("flowingSendDialog.message"),
			messageOptional: t("flowingSendDialog.optional"),
			messagePlaceholder: t("flowingSendDialog.messagePlaceholder"),
			nextStageMembers: t("flowingSendDialog.nextStageMembers"),
			receivers: t("flowingSendDialog.receivers"),
			selectedSummary: t("flowingSendDialog.selectedSummary", {
				count: selectedFiles.length,
				receivers: selectedReceiverNames,
			}),
			send: t("flowingSendDialog.send"),
			sending: t("flowingSendDialog.sending"),
			title: t("flowingSendDialog.title"),
		},
		message,
		onAddFiles: handleAddFiles,
		onMessageChange: setMessage,
		onOpenChange: setOpen,
		onRemoveFile: handleRemoveFile,
		onSend: handleSend,
		onToggleReceiver: toggleReceiver,
		open,
		selectedReceiverIds: [...selectedReceivers],
		sending,
	};
}

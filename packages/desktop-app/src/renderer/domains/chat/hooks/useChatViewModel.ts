import {
	activeInputActionIdsAtom,
	activeSessionAtom,
	activityPanelOpenAtom,
	authUserAtom,
	chatMessagesAtom,
	closeInlineFilePreviewAtom,
	defaultConversationCwdAtom,
	editImageAttachmentAtom,
	getProjectDisplayName,
	inlineFilePreviewContextReadonlyAtom,
	isStreamingAtom,
	knowledgeRetrievalActiveAtom,
	pageHeaderTitleAtom,
	pendingEditImageIdAtom,
	sessionDisplayLabel,
	sessionsMapAtom,
	workflowCompleteDialogOpenAtom,
	workflowInstanceAtom,
} from "@shared/store/atoms";
import { useThemeSurface } from "@vetta/theme-sdk/appearance";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ChatViewModelResult } from "../components/chat-view/types";

export function useChatViewModel(): ChatViewModelResult {
	const { t } = useTranslation("chat");
	const surface = useThemeSurface("chat.view");
	const activeSession = useAtomValue(activeSessionAtom);
	const messages = useAtomValue(chatMessagesAtom);
	const isStreaming = useAtomValue(isStreamingAtom);
	const [panelOpen, setPanelOpen] = useAtom(activityPanelOpenAtom);
	const setWorkflowCompleteOpen = useSetAtom(workflowCompleteDialogOpenAtom);
	const workflowInstance = useAtomValue(workflowInstanceAtom);
	const authUser = useAtomValue(authUserAtom);
	const setHeaderTitle = useSetAtom(pageHeaderTitleAtom);
	const inlinePreviewActive = useAtomValue(inlineFilePreviewContextReadonlyAtom) !== null;
	const closeInlinePreview = useSetAtom(closeInlineFilePreviewAtom);
	const defaultCwd = useAtomValue(defaultConversationCwdAtom);
	const sessionsMap = useAtomValue(sessionsMapAtom);
	const setEditImageAttachment = useSetAtom(editImageAttachmentAtom);
	const setPendingEditImageId = useSetAtom(pendingEditImageIdAtom);
	const setActiveInputActionIds = useSetAtom(activeInputActionIdsAtom);
	const setKnowledgeRetrievalActive = useSetAtom(knowledgeRetrievalActiveAtom);

	const prevRuntimeIdRef = useRef<string | undefined>(undefined);
	useEffect(() => {
		const previousRuntimeId = prevRuntimeIdRef.current;
		const currentRuntimeId = activeSession?.runtimeId;
		prevRuntimeIdRef.current = currentRuntimeId;
		if (previousRuntimeId == null || previousRuntimeId === currentRuntimeId) return;
		setEditImageAttachment(null);
		setPendingEditImageId(null);
		setActiveInputActionIds(new Set());
		setKnowledgeRetrievalActive(false);
	}, [
		activeSession?.runtimeId,
		setActiveInputActionIds,
		setEditImageAttachment,
		setKnowledgeRetrievalActive,
		setPendingEditImageId,
	]);

	const [pinned, setPinned] = useState(false);
	const [exporting, setExporting] = useState(false);
	useEffect(() => {
		void window.vetta.window.isAlwaysOnTop().then(setPinned);
	}, []);

	const togglePin = useCallback(async () => {
		const next = await window.vetta.window.toggleAlwaysOnTop();
		setPinned(next);
	}, []);
	const finishExport = useCallback(() => setExporting(false), []);
	const openExport = useCallback(() => setExporting(true), []);
	const openWorkflowComplete = useCallback(() => setWorkflowCompleteOpen(true), [setWorkflowCompleteOpen]);
	const togglePanel = useCallback(() => {
		if (inlinePreviewActive) {
			closeInlinePreview();
			setPanelOpen(false);
			return;
		}
		setPanelOpen((open) => !open);
	}, [closeInlinePreview, inlinePreviewActive, setPanelOpen]);

	const isLastStage =
		workflowInstance != null &&
		workflowInstance.status === "active" &&
		authUser != null &&
		workflowInstance.current_stage === workflowInstance.stages.length - 1 &&
		workflowInstance.stages[workflowInstance.current_stage]?.member_ids.includes(authUser.id);

	const sessionTitle = useMemo(() => {
		if (!activeSession) return null;
		for (const list of sessionsMap.values()) {
			const found = list.find((session) => session.path === activeSession.sessionPath);
			if (found) return sessionDisplayLabel(found);
		}
		return getProjectDisplayName(activeSession.cwd, defaultCwd);
	}, [activeSession, defaultCwd, sessionsMap]);

	useEffect(() => {
		setHeaderTitle(sessionTitle);
		return () => setHeaderTitle(null);
	}, [sessionTitle, setHeaderTitle]);

	return {
		actions: {
			finishExport,
			openExport,
			openWorkflowComplete,
			togglePanel,
			togglePin,
		},
		model: {
			exporting,
			exportTitle: sessionTitle ?? t("chatView.defaultSessionTitle"),
			header: {
				completeLabel: t("chatView.completeButton.label"),
				exportDisabled: messages.length === 0 || isStreaming || exporting,
				exporting,
				exportTitle: t("chatView.exportButton.title"),
				isLastStage,
				panelOpen,
				panelTitle: panelOpen ? t("chatView.panelButton.open") : t("chatView.panelButton.closed"),
				pinTitle: pinned ? t("chatView.pinButton.pinned") : t("chatView.pinButton.unpinned"),
				pinned,
			},
			isStreaming,
			messages,
			rootClassName: surface?.rootClassName,
			sessionId: activeSession?.sessionPath ?? null,
		},
	};
}

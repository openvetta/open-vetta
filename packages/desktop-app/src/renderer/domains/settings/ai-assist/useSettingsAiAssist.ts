import { i18n } from "@shared/i18n";
import { defaultConversationCwdAtom, openSessionFnRef, sendMessageFnRef } from "@shared/store/atoms";
import { useAtomValue } from "jotai";
import { useCallback, useMemo, useState } from "react";
import { buildSettingsAiAssistPromptParts } from "./buildPrompt";
import { getSettingsAiAssistEntry, type SettingsAiAssistCatalogEntry, type SettingsAiAssistTabId } from "./catalog";

export interface SettingsAiAssistModel {
	entry: SettingsAiAssistCatalogEntry;
	dialogOpen: boolean;
	intent: string;
	submitting: boolean;
	submitError: string | null;
	openDialog: () => void;
	closeDialog: () => void;
	setIntent: (value: string) => void;
	applyExample: (text: string) => void;
	submit: () => Promise<void>;
}

export function useSettingsAiAssist(tabId: SettingsAiAssistTabId): SettingsAiAssistModel | null {
	const entry = getSettingsAiAssistEntry(tabId);
	const defaultConversationCwd = useAtomValue(defaultConversationCwdAtom);

	const [dialogOpen, setDialogOpen] = useState(false);
	const [intent, setIntent] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);

	const openDialog = useCallback(() => {
		setSubmitError(null);
		setDialogOpen(true);
	}, []);

	const closeDialog = useCallback(() => {
		if (submitting) return;
		setDialogOpen(false);
		setSubmitError(null);
	}, [submitting]);

	const applyExample = useCallback((text: string) => {
		setIntent(text);
		setSubmitError(null);
	}, []);

	const submit = useCallback(async () => {
		if (!entry) return;
		const openSession = openSessionFnRef.current;
		const sendMessage = sendMessageFnRef.current;
		const cwd = defaultConversationCwd?.trim() ?? "";
		if (!cwd || !openSession || !sendMessage) {
			setSubmitError(i18n.t("settings:aiAssist.error.noWorkspace"));
			return;
		}

		// displayText → user bubble / history; agentInstruction → metadata → display:false inject.
		const { displayText, agentInstruction } = buildSettingsAiAssistPromptParts(entry, intent);
		setSubmitting(true);
		setSubmitError(null);
		try {
			await openSession(cwd);
			await sendMessage(displayText, {
				metadata: {
					settingsAssistInstruction: agentInstruction,
					settingsAssistTabId: entry.tabId,
				},
				settingsAssistTabId: entry.tabId,
			});
			setDialogOpen(false);
			setIntent("");
		} catch (error) {
			console.warn("[SettingsAiAssist] start chat failed", error);
			const message = error instanceof Error ? error.message : String(error);
			setSubmitError(
				message
					? i18n.t("settings:aiAssist.error.startFailedWithReason", { message })
					: i18n.t("settings:aiAssist.error.startFailed"),
			);
		} finally {
			setSubmitting(false);
		}
	}, [defaultConversationCwd, entry, intent]);

	return useMemo(() => {
		if (!entry) return null;
		return {
			entry,
			dialogOpen,
			intent,
			submitting,
			submitError,
			openDialog,
			closeDialog,
			setIntent,
			applyExample,
			submit,
		};
	}, [entry, dialogOpen, intent, submitting, submitError, openDialog, closeDialog, applyExample, submit]);
}

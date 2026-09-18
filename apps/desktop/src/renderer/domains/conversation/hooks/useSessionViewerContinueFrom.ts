import type { DesktopApi } from "@preload/api";
import { type ConfirmDialogState, confirmDialogAtom, openSessionFnRef } from "@shared/store/atoms";
import type { TFunction } from "i18next";
import { useSetAtom } from "jotai";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

const CONTINUE_FROM_ERROR = {
	NO_DEFAULT_MODEL: "EXTERNAL_SESSION_CONTINUE_NO_DEFAULT_MODEL",
	EMPTY_BRIEFING: "EXTERNAL_SESSION_CONTINUE_EMPTY_BRIEFING",
} as const;

type ContinueFromResult = Awaited<ReturnType<DesktopApi["session"]["continueFromExternal"]>>;

export interface SessionViewerContinueFromModel {
	readonly enabled: boolean;
	readonly continuing: boolean;
	readonly error: string | null;
	readonly onContinue: () => void;
}

export function useSessionViewerContinueFrom(input: {
	readonly sessionPath: string;
	readonly enabled: boolean;
}): SessionViewerContinueFromModel {
	const { t } = useTranslation("chat");
	const setConfirm = useSetAtom(confirmDialogAtom);
	const [continuing, setContinuing] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const onContinue = useCallback(() => {
		if (!input.enabled || !input.sessionPath || continuing) return;
		setError(null);
		setConfirm({
			title: t("sessionViewer.continueFrom.quotaTitle"),
			message: t("sessionViewer.continueFrom.quotaMessage"),
			confirmLabel: t("sessionViewer.continueFrom.quotaConfirm"),
			cancelLabel: t("sessionViewer.continueFrom.quotaCancel"),
			onConfirm: () => {
				void runContinueFrom({
					sessionPath: input.sessionPath,
					t,
					setContinuing,
					setError,
					setConfirm,
				});
			},
		});
	}, [continuing, input.enabled, input.sessionPath, setConfirm, t]);

	return {
		enabled: input.enabled,
		continuing,
		error,
		onContinue,
	};
}

async function runContinueFrom(input: {
	readonly sessionPath: string;
	readonly cwdOverride?: string;
	readonly t: TFunction<"chat">;
	readonly setContinuing: (value: boolean) => void;
	readonly setError: (value: string | null) => void;
	readonly setConfirm: (value: ConfirmDialogState | null) => void;
}): Promise<void> {
	input.setContinuing(true);
	try {
		const result = await window.vetta.session.continueFromExternal({
			sessionPath: input.sessionPath,
			...(input.cwdOverride === undefined ? {} : { cwdOverride: input.cwdOverride }),
		});
		if (result.kind === "cwd_missing") {
			await recoverMissingCwd(result, input);
			return;
		}
		await openCreatedSession(result);
	} catch (error) {
		input.setError(mapContinueFromError(error, input.t));
	} finally {
		input.setContinuing(false);
	}
}

async function recoverMissingCwd(
	result: Extract<ContinueFromResult, { kind: "cwd_missing" }>,
	input: {
		readonly sessionPath: string;
		readonly t: TFunction<"chat">;
		readonly setContinuing: (value: boolean) => void;
		readonly setError: (value: string | null) => void;
		readonly setConfirm: (value: ConfirmDialogState | null) => void;
	},
): Promise<void> {
	const selected = await askForReplacementCwd(result.suggestedCwd, input);
	if (!selected) return;
	await runContinueFrom({ ...input, cwdOverride: selected });
}

function askForReplacementCwd(
	suggestedCwd: string,
	input: {
		readonly t: TFunction<"chat">;
		readonly setConfirm: (value: ConfirmDialogState | null) => void;
	},
): Promise<string | null> {
	return new Promise((resolve) => {
		input.setConfirm({
			title: input.t("sessionViewer.continueFrom.cwdMissingTitle"),
			message: input.t("sessionViewer.continueFrom.cwdMissingMessage", { path: suggestedCwd }),
			confirmLabel: input.t("sessionViewer.continueFrom.cwdMissingConfirm"),
			cancelLabel: input.t("sessionViewer.continueFrom.cwdMissingCancel"),
			onConfirm: () => {
				void window.vetta.dialog.selectFolder().then(resolve);
			},
			onCancel: () => resolve(null),
		});
	});
}

async function openCreatedSession(result: Extract<ContinueFromResult, { kind: "created" }>): Promise<void> {
	const openSession = openSessionFnRef.current;
	if (!openSession) throw new Error("OPEN_SESSION_UNAVAILABLE");
	await openSession(result.cwd, result.sessionPath);
}

function mapContinueFromError(error: unknown, t: TFunction<"chat">): string {
	const message = error instanceof Error ? error.message : String(error);
	if (message === CONTINUE_FROM_ERROR.NO_DEFAULT_MODEL) {
		return t("sessionViewer.continueFrom.error.noDefaultModel");
	}
	if (message === CONTINUE_FROM_ERROR.EMPTY_BRIEFING) {
		return t("sessionViewer.continueFrom.error.emptyBriefing");
	}
	if (message === "OPEN_SESSION_UNAVAILABLE") {
		return t("sessionViewer.continueFrom.error.openFailed");
	}
	return message || t("sessionViewer.continueFrom.error.generic");
}

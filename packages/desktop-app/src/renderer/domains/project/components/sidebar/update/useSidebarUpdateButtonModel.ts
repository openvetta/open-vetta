import { updaterRestartDialogOpenAtom, updaterStateAtom } from "@shared/store/atoms";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

export interface SidebarUpdateButtonModel {
	phase: "available" | "downloading" | "ready" | "error";
	progress?: number;
	title: string;
	onClick: () => void;
}

export function useSidebarUpdateButtonModel(): SidebarUpdateButtonModel | null {
	const { t } = useTranslation("project");
	const state = useAtomValue(updaterStateAtom);
	const openRestartDialog = useSetAtom(updaterRestartDialogOpenAtom);

	const onClick = useCallback(() => {
		if (state.phase === "available") {
			void window.vetta.updater.download();
			return;
		}
		if (state.phase === "ready") {
			openRestartDialog(true);
			return;
		}
		if (state.phase === "error") {
			void window.vetta.updater.check();
		}
		// downloading / installing：忽略
	}, [state.phase, openRestartDialog]);

	if (state.phase === "idle" || state.phase === "checking" || state.phase === "installing") {
		return null;
	}

	if (state.phase === "available") {
		return {
			phase: state.phase,
			title: t("update.newVersion", { version: state.latestVersion ?? "" }),
			onClick,
		};
	}
	if (state.phase === "downloading") {
		const pct = state.progress ? Math.round(state.progress * 100) : 0;
		return {
			phase: state.phase,
			progress: state.progress,
			title: t("update.downloading", { version: state.latestVersion ?? "", pct }),
			onClick,
		};
	}
	if (state.phase === "ready") {
		return {
			phase: state.phase,
			title: t("update.ready", { version: state.latestVersion ?? "" }),
			onClick,
		};
	}
	return {
		phase: state.phase,
		title: state.error ?? t("update.checkFailed"),
		onClick,
	};
}

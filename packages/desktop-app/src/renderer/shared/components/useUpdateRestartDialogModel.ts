import { updaterRestartDialogOpenAtom, updaterStateAtom } from "@shared/store/atoms";
import { useAtom, useAtomValue } from "jotai";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { UpdateRestartDialogViewProps } from "./UpdateRestartDialogView";

export type UpdateRestartDialogModel = UpdateRestartDialogViewProps;

export function useUpdateRestartDialogModel(): UpdateRestartDialogModel {
	const { t } = useTranslation("common");
	const [open, setOpen] = useAtom(updaterRestartDialogOpenAtom);
	const state = useAtomValue(updaterStateAtom);
	const overlayRef = useRef<HTMLDivElement>(null);

	const close = () => setOpen(false);

	useEffect(() => {
		if (!open) return;
		function handleKey(e: KeyboardEvent) {
			if (e.key === "Escape") setOpen(false);
		}
		document.addEventListener("keydown", handleKey);
		return () => document.removeEventListener("keydown", handleKey);
	}, [open, setOpen]);

	const visible = open && state.phase === "ready";

	const handleInstall = () => {
		setOpen(false);
		void window.vetta.updater.install();
	};

	return {
		labels: {
			install: t("updateRestart.install"),
			later: t("updateRestart.later"),
			message: t("updateRestart.message", {
				currentVersion: state.currentVersion,
				latestVersion: state.latestVersion,
			}),
			title: t("updateRestart.title"),
		},
		onClose: close,
		onInstall: handleInstall,
		overlayRef,
		releaseNote: state.releaseNote,
		visible,
	};
}

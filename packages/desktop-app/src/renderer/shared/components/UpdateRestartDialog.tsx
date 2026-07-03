import { updaterRestartDialogOpenAtom, updaterStateAtom } from "@shared/store/atoms";
import { useThemeComponent } from "@vetta/theme-sdk";
import { useAtom, useAtomValue } from "jotai";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { UpdateRestartDialogView } from "./UpdateRestartDialogView";

export function UpdateRestartDialog(): JSX.Element {
	const { t } = useTranslation("common");
	const [open, setOpen] = useAtom(updaterRestartDialogOpenAtom);
	const state = useAtomValue(updaterStateAtom);
	const overlayRef = useRef<HTMLDivElement>(null);
	const ThemedUpdateRestartDialogView = useThemeComponent(
		"root.updateRestartDialogView",
		UpdateRestartDialogView,
	);

	const close = () => setOpen(false);

	useEffect(() => {
		if (!open) return;
		function handleKey(e: KeyboardEvent) {
			if (e.key === "Escape") close();
		}
		document.addEventListener("keydown", handleKey);
		return () => document.removeEventListener("keydown", handleKey);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open]);

	// 仅在 ready 阶段显示（其它状态切回时 hook 已经控制开关）
	const visible = open && state.phase === "ready";

	const handleInstall = () => {
		setOpen(false);
		void window.vetta.updater.install();
	};

	return (
		<ThemedUpdateRestartDialogView
			labels={{
				install: t("updateRestart.install"),
				later: t("updateRestart.later"),
				message: t("updateRestart.message", {
					currentVersion: state.currentVersion,
					latestVersion: state.latestVersion,
				}),
				title: t("updateRestart.title"),
			}}
			onClose={close}
			onInstall={handleInstall}
			overlayRef={overlayRef}
			releaseNote={state.releaseNote}
			visible={visible}
		/>
	);
}

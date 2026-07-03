import { useAtom } from "jotai";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useThemeComponent } from "@vetta/theme-sdk";
import { confirmDialogAtom } from "../../store/atoms";
import { ConfirmDialogView } from "./ConfirmDialogView";

export function ConfirmDialog(): JSX.Element | null {
	const { t } = useTranslation("common");
	const [state, setState] = useAtom(confirmDialogAtom);
	const overlayRef = useRef<HTMLDivElement>(null);
	const ThemedConfirmDialogView = useThemeComponent("root.confirmDialogView", ConfirmDialogView);

	const closeWithCancel = () => {
		state?.onCancel?.();
		setState(null);
	};

	useEffect(() => {
		if (!state) return;
		function handleKey(e: KeyboardEvent) {
			if (e.key === "Escape") {
				state?.onCancel?.();
				setState(null);
			}
		}
		document.addEventListener("keydown", handleKey);
		return () => document.removeEventListener("keydown", handleKey);
	}, [state, setState]);

	return (
		<ThemedConfirmDialogView
			labels={{
				cancel: t("actions.cancel"),
				confirm: t("actions.confirm"),
			}}
			onCancel={closeWithCancel}
			onConfirm={() => {
				state?.onConfirm();
				setState(null);
			}}
			overlayRef={overlayRef}
			state={state}
		/>
	);
}

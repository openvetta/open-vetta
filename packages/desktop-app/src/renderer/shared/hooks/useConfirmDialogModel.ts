import { useAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { ConfirmDialogViewProps } from "../components/ui/ConfirmDialogView";
import { confirmDialogAtom } from "../store/atoms";

export function useConfirmDialogModel(): ConfirmDialogViewProps {
	const { t } = useTranslation("common");
	const [state, setState] = useAtom(confirmDialogAtom);
	const overlayRef = useRef<HTMLDivElement>(null);

	const onCancel = useCallback(() => {
		state?.onCancel?.();
		setState(null);
	}, [setState, state]);

	const onConfirm = useCallback(() => {
		state?.onConfirm();
		setState(null);
	}, [setState, state]);

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

	return useMemo(
		() => ({
			labels: {
				cancel: t("actions.cancel"),
				confirm: t("actions.confirm"),
			},
			onCancel,
			onConfirm,
			overlayRef,
			state: state
				? {
						cancelLabel: state.cancelLabel,
						confirmLabel: state.confirmLabel,
						message: state.message,
						title: state.title,
						variant: state.variant,
					}
				: null,
		}),
		[onCancel, onConfirm, state, t],
	);
}

import { useShortcutScope } from "@shared/shortcuts";
import { useAtom } from "jotai";
import { useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { ConfirmDialogViewProps } from "../components/ui/ConfirmDialogView";
import { confirmDialogAtom } from "../store/atoms";

export function useConfirmDialogModel(): ConfirmDialogViewProps {
	const { t } = useTranslation("common");
	const [state, setState] = useAtom(confirmDialogAtom);
	const overlayRef = useRef<HTMLDivElement>(null);

	const onCancel = useCallback(() => {
		const current = state;
		current?.onCancel?.();
		setState((latest) => (latest === current ? null : latest));
	}, [setState, state]);

	const onConfirm = useCallback(() => {
		const current = state;
		current?.onConfirm(current.checkbox?.checked ?? false);
		setState((latest) => (latest === current ? null : latest));
	}, [setState, state]);

	const onSecondary = useCallback(() => {
		const current = state;
		current?.onSecondary?.();
		setState((latest) => (latest === current ? null : latest));
	}, [setState, state]);

	const onCheckboxCheckedChange = useCallback(
		(checked: boolean) => {
			setState((current) =>
				current?.checkbox ? { ...current, checkbox: { ...current.checkbox, checked } } : current,
			);
		},
		[setState],
	);

	useShortcutScope({
		id: "modal:confirm-dialog",
		kind: "modal",
		active: state != null,
		exclusive: true,
		bindings: [
			{
				key: "escape",
				run: () => {
					const current = state;
					current?.onCancel?.();
					setState((latest) => (latest === current ? null : latest));
				},
			},
		],
	});

	return useMemo(
		() => ({
			labels: {
				cancel: t("actions.cancel"),
				confirm: t("actions.confirm"),
			},
			onCancel,
			onCheckboxCheckedChange,
			onConfirm,
			onSecondary,
			overlayRef,
			state: state
				? {
						cancelLabel: state.cancelLabel,
						checkbox: state.checkbox,
						confirmLabel: state.confirmLabel,
						message: state.message,
						secondaryLabel: state.secondaryLabel,
						title: state.title,
						variant: state.variant,
					}
				: null,
		}),
		[onCancel, onCheckboxCheckedChange, onConfirm, onSecondary, state, t],
	);
}

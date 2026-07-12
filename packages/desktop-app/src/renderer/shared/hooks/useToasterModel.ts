import type { ToasterViewProps } from "@vetta/theme-ui/overlays";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { dismissToast, toastsAtom } from "../store/toast-atoms";

export function useToasterModel(): ToasterViewProps {
	const toasts = useAtomValue(toastsAtom);

	return useMemo(
		() => ({
			closeTitle: "关闭",
			onAction: (id: string) => {
				const toast = toasts.find((item) => item.id === id);
				toast?.action?.onClick();
				dismissToast(id);
			},
			onDismiss: dismissToast,
			toasts: toasts.map((toast) => ({
				actionLabel: toast.action?.label,
				id: toast.id,
				message: toast.message,
				title: toast.title,
				variant: toast.variant,
			})),
		}),
		[toasts],
	);
}

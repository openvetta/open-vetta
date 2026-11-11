import { updaterRestartDialogOpenAtom, updaterStateAtom } from "@shared/store/atoms";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

export interface SidebarUpdateButtonModel {
	label: string;
	onOpen: () => void;
}

/** 下载完成（phase === "ready"）后才返回 model；其余阶段返回 null，图标不出现。 */
export function useSidebarUpdateButtonModel(): SidebarUpdateButtonModel | null {
	const { t } = useTranslation("project");
	const state = useAtomValue(updaterStateAtom);
	const openDialog = useSetAtom(updaterRestartDialogOpenAtom);

	const onOpen = useCallback(() => {
		openDialog(true);
	}, [openDialog]);

	if (state.phase !== "ready") return null;

	return {
		label: t("update.bannerReady", { version: state.latestVersion ?? "" }),
		onOpen,
	};
}

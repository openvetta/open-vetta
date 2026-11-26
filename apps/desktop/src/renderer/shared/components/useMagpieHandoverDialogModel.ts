import { magpieHandoverDialogAtom } from "@shared/store/magpie-handover-atoms";
import type { MagpieHandoverDialogViewLabels } from "@vetta-org/theme-ui/overlays";
import { useAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/** 官方插件的包名:用户在 Magpie 插件页按它搜索。 */
export const MAGPIE_PLUGIN_NAME = "magpie-vetta";
const MAGPIE_PLUGIN_GUIDE_URL = "https://github.com/openvetta/magpie-vetta#readme";
const COPIED_RESET_MS = 1600;

export interface MagpieHandoverDialogModel {
	readonly visible: boolean;
	readonly defaultModelCleared: boolean;
	readonly noProvidersLeft: boolean;
	readonly copied: boolean;
	readonly labels: MagpieHandoverDialogViewLabels;
	readonly onCopyPluginName: () => void;
	readonly onOpenGuide: () => void;
	readonly onClose: () => void;
}

/**
 * Magpie 接入说明弹窗。两种打开方式共用一个视图:
 * - 升级后首次启动:主进程删掉了旧版在 Vetta 里启用的 Magpie,这里领取那次提示并弹出;只给一次,窗口重新加载不会再弹。
 * - 设置里 Magpie 一行的「接入说明」按钮:只讲怎么接入,不提移除,也没有默认模型的提示。
 */
export function useMagpieHandoverDialogModel(): MagpieHandoverDialogModel {
	const { t } = useTranslation("common");
	const [state, setState] = useAtom(magpieHandoverDialogAtom);
	const [copied, setCopied] = useState(false);
	const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		let cancelled = false;
		window.vetta.models
			.takeMagpieHandoverNotice()
			.then((next) => {
				if (!cancelled && next) {
					setState({
						reason: "upgrade",
						defaultModelCleared: next.defaultModelCleared,
						noProvidersLeft: next.noProvidersLeft,
					});
				}
			})
			.catch(() => {
				// 领不到就不弹:旧配置已经删了,设置页的 Magpie 一行也会提示去 Magpie 里接入。
			});
		return () => {
			cancelled = true;
			if (copiedTimer.current) clearTimeout(copiedTimer.current);
		};
	}, [setState]);

	const onCopyPluginName = useCallback(() => {
		void navigator.clipboard
			.writeText(MAGPIE_PLUGIN_NAME)
			.then(() => {
				setCopied(true);
				if (copiedTimer.current) clearTimeout(copiedTimer.current);
				copiedTimer.current = setTimeout(() => setCopied(false), COPIED_RESET_MS);
			})
			.catch(() => {});
	}, []);

	const onOpenGuide = useCallback(() => {
		void window.vetta.shell.openExternal(MAGPIE_PLUGIN_GUIDE_URL);
	}, []);

	const onClose = useCallback(() => setState(null), [setState]);
	const upgrade = state?.reason === "upgrade";

	return {
		visible: state !== null,
		defaultModelCleared: state?.reason === "upgrade" && state.defaultModelCleared,
		noProvidersLeft: state?.reason === "upgrade" && state.noProvidersLeft,
		copied,
		labels: {
			eyebrow: upgrade ? t("magpieHandover.eyebrow") : t("magpieHandover.guideEyebrow"),
			title: upgrade ? t("magpieHandover.title") : t("magpieHandover.guideTitle"),
			description: upgrade ? t("magpieHandover.description") : t("magpieHandover.guideDescription"),
			stepInstall: t("magpieHandover.stepInstall"),
			stepConnect: t("magpieHandover.stepConnect"),
			stepUse: t("magpieHandover.stepUse"),
			pluginName: MAGPIE_PLUGIN_NAME,
			pluginPublisher: t("magpieHandover.pluginPublisher"),
			copy: t("magpieHandover.copy"),
			copied: t("magpieHandover.copied"),
			defaultModelCleared: t("magpieHandover.defaultModelCleared"),
			noProvidersLeft: t("magpieHandover.noProvidersLeft"),
			primary: t("magpieHandover.primary"),
			guide: t("magpieHandover.guide"),
			close: t("magpieHandover.close"),
		},
		onCopyPluginName,
		onOpenGuide,
		onClose,
	};
}

import { lazy } from "react";
import { browserUrlByWorkspaceAtom, getBrowserUrlForWorkspace } from "@shared/store/atoms";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";

import { useActivityTabActivation } from "../registry/activation-context";
import { useActivityWorkspace } from "../registry/context";
import type { ActivityTabDefinition } from "../registry/types";

const BrowserPanel = lazy(() =>
	import("../components/BrowserPanel").then((module) => ({ default: module.BrowserPanel })),
);

/**
 * 浏览器页签常驻，但 guest webview 只在真正用到时才创建：没有地址又没被激活时保持空组件，
 * 避免每个工作空间打开面板就多一个 about:blank 的 Electron guest。激活后由 pinned 驻留接管。
 */
function BrowserActivityTab(): JSX.Element | null {
	const active = useActivityTabActivation();
	const workspace = useActivityWorkspace();
	const browserUrlMap = useAtomValue(browserUrlByWorkspaceAtom);
	const browserUrl = getBrowserUrlForWorkspace(browserUrlMap, workspace.id);
	if (!active && !browserUrl) return null;
	return <BrowserPanel />;
}

export const browserTabDefinition: ActivityTabDefinition = {
	id: "browser",
	order: 15,
	removable: true,
	source: "builtin",
	retention: "pinned",
	useMeta: () => {
		const { t } = useTranslation("chat");
		return {
			label: t("browser.tab"),
			icon: "icon-[mdi--web]",
		};
	},
	component: BrowserActivityTab,
};

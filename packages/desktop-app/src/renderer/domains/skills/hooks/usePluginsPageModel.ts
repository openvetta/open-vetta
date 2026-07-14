import { pageHeaderTitleHiddenAtom } from "@shared/store/atoms";
import { useSetAtom } from "jotai";
import type { RefObject } from "react";
import { useEffect, useRef } from "react";
import type { PluginsPanelHandle } from "./usePluginsPanelModel";

export interface PluginsPageModel {
	pluginsPanelRef: RefObject<PluginsPanelHandle | null>;
}

export function usePluginsPageModel(): PluginsPageModel {
	const pluginsPanelRef = useRef<PluginsPanelHandle>(null);
	const setHeaderTitleHidden = useSetAtom(pageHeaderTitleHiddenAtom);

	// 页面内已有大号标题，隐藏顶栏左上角路由标题。
	useEffect(() => {
		setHeaderTitleHidden(true);
		return () => setHeaderTitleHidden(false);
	}, [setHeaderTitleHidden]);

	return { pluginsPanelRef };
}

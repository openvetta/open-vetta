import { pageHeaderTitleHiddenAtom } from "@shared/store/atoms";
import { useSetAtom } from "jotai";
import { useEffect } from "react";
import { useAbilitiesModel } from "../hooks/useAbilitiesModel";
import { AbilitiesPageView } from "./AbilitiesPageView";

export function AbilitiesPage(): JSX.Element {
	const model = useAbilitiesModel();
	const setHeaderTitleHidden = useSetAtom(pageHeaderTitleHiddenAtom);

	// 页面内已有大号标题，隐藏顶栏左上角路由标题。
	useEffect(() => {
		setHeaderTitleHidden(true);
		return () => setHeaderTitleHidden(false);
	}, [setHeaderTitleHidden]);

	return <AbilitiesPageView model={model} />;
}

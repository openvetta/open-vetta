import { pageHeaderTitleHiddenAtom } from "@shared/store/atoms";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useSetAtom } from "jotai";
import { useCallback, useEffect } from "react";
import { useAbilitiesModel } from "../hooks/useAbilitiesModel";
import { AbilitiesPageView } from "./AbilitiesPageView";
import { AbilityDetailSheet } from "./detail/AbilityDetailSheet";

export function AbilitiesPage(): JSX.Element {
	const model = useAbilitiesModel();
	const setHeaderTitleHidden = useSetAtom(pageHeaderTitleHiddenAtom);
	const navigate = useNavigate();
	// 详情抽屉由 `?detail=<type>:<slug>` 驱动：深链可用，返回键即关闭。
	const { detail } = useSearch({ strict: false }) as { detail?: string };

	// 页面内已有大号标题，隐藏顶栏左上角路由标题。
	useEffect(() => {
		setHeaderTitleHidden(true);
		return () => setHeaderTitleHidden(false);
	}, [setHeaderTitleHidden]);

	const closeDetail = useCallback(() => {
		void navigate({ to: "/abilities", search: {}, replace: true });
	}, [navigate]);

	return (
		<>
			<AbilitiesPageView model={model} />
			<AbilityDetailSheet detailId={detail ?? null} model={model} onClose={closeDetail} />
		</>
	);
}

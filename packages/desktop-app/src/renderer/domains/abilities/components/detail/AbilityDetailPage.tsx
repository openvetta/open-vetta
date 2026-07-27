import { pageHeaderTitleHiddenAtom } from "@shared/store/atoms";
import { useParams, useRouter } from "@tanstack/react-router";
import { useSetAtom } from "jotai";
import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAbilitiesModel } from "../../hooks/useAbilitiesModel";
import { AbilityDetailView } from "./AbilityDetailView";

/** 路由入口：只做参数解析、返回行为与未找到兜底，渲染交给 AbilityDetailView。 */
export function AbilityDetailPage(): JSX.Element {
	const { t } = useTranslation("abilities");
	const params = useParams({ strict: false }) as { type?: string; slug?: string };
	const router = useRouter();
	const model = useAbilitiesModel();
	const setHeaderTitleHidden = useSetAtom(pageHeaderTitleHiddenAtom);

	useEffect(() => {
		setHeaderTitleHidden(true);
		return () => setHeaderTitleHidden(false);
	}, [setHeaderTitleHidden]);

	const onBack = useCallback(() => {
		router.history.back();
	}, [router]);

	const item = params.type && params.slug ? model.findById(`${params.type}:${params.slug}`) : null;

	if (!item) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-3 text-center">
				{model.loading ? (
					<span className="icon-[solar--refresh-linear] h-8 w-8 animate-spin text-muted-foreground/60" />
				) : (
					<>
						<span className="icon-[solar--ghost-linear] h-10 w-10 text-muted-foreground/50" />
						<p className="text-[13px] text-muted-foreground/70">{t("detail.notFound")}</p>
					</>
				)}
			</div>
		);
	}

	return <AbilityDetailView item={item} model={model} onBack={onBack} />;
}

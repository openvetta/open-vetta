import { useTranslation } from "react-i18next";

export function ProjectsPanelEmptyState(): JSX.Element {
	const { t } = useTranslation("project");

	return (
		<div className="flex flex-col items-center gap-2.5 px-4 py-10 text-center">
			<span className="icon-[solar--folder-open-linear] h-7 w-7 text-muted-foreground" />
			<p className="text-[11px] text-foreground">{t("sidebar.empty.title")}</p>
			<p className="text-[11px] text-muted-foreground">{t("sidebar.empty.description")}</p>
		</div>
	);
}

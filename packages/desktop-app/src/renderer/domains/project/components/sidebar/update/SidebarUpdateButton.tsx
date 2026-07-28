import { useTranslation } from "react-i18next";
import { SidebarUpdateIcon } from "./SidebarUpdateIcon";
import { useSidebarUpdateButtonModel } from "./useSidebarUpdateButtonModel";

export function SidebarUpdateButton(): JSX.Element | null {
	const model = useSidebarUpdateButtonModel();
	const { t } = useTranslation("project");

	if (!model) return null;

	return (
		<button
			type="button"
			onClick={model.onClick}
			title={model.title}
			className="no-drag relative flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
		>
			<SidebarUpdateIcon
				downloadProgressLabel={t("update.downloadProgress")}
				phase={model.phase}
				progress={model.progress}
			/>
		</button>
	);
}

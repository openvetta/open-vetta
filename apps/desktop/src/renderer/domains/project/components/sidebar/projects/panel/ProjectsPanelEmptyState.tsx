import { AddProjectMenu } from "../../add-project/AddProjectMenu";
import { ProjectsPanelEmptyState as ThemeProjectsPanelEmptyState } from "@vetta-org/theme-ui/sidebar/ProjectsPanelEmptyState";
import { useTranslation } from "react-i18next";

/** Desktop adapter: injects i18n into props-driven empty state. */
export function ProjectsPanelEmptyState(): JSX.Element {
	const { t } = useTranslation("project");
	return (
		<ThemeProjectsPanelEmptyState
			action={<AddProjectMenu variant="primary" />}
			labels={{ title: t("sidebar.empty.title") }}
		/>
	);
}

import { useTranslation } from "react-i18next";
import { SkillDetailDialogView } from "@vetta/theme-ui/skills";
import type { MergedSkill } from "../hooks/useSkillsPageModel";

export function SkillDetailDialog({
	skill,
	onClose,
}: {
	skill: MergedSkill | null;
	onClose: () => void;
}): JSX.Element | null {
	const { t } = useTranslation("skills");

	if (!skill) return null;

	return (
		<SkillDetailDialogView
			skill={{
				name: skill.name,
				alias: skill.alias,
				type: skill.type,
				version: skill.version,
				author: skill.author,
				downloadCount: skill.downloadCount,
				tags: skill.tags,
				description: skill.description,
				license: skill.license,
			}}
			onClose={onClose}
			showNotInstalledHint={!skill.installed}
			labels={{
				typeLabel: t("detail.type"),
				typeNoun: skill.type === "scene" ? t("typeNoun.scene") : t("typeNoun.capability"),
				nameLabel: t("detail.name"),
				versionLabel: t("detail.version"),
				authorLabel: t("detail.author"),
				downloadsLabel: t("detail.downloads"),
				descriptionLabel: t("detail.description"),
				notInstalledHint: t("detail.notInstalledHint"),
			}}
		/>
	);
}

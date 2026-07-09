import { SkillPromptArea } from "@domains/chat/components/SkillPromptArea";
import type { SelectedSkill } from "@shared/store/atoms";
import { useTranslation } from "react-i18next";

export function BatchProjectPromptField({
	prompt,
	promptMinHeight,
	skill,
	onPromptChange,
	onSkillChange,
}: {
	prompt: string;
	promptMinHeight: number;
	skill: SelectedSkill | null;
	onPromptChange: (prompt: string) => void;
	onSkillChange: (skill: SelectedSkill | null) => void;
}): JSX.Element {
	const { t } = useTranslation("batch-tasks");

	return (
		<SkillPromptArea
			prompt={prompt}
			onPromptChange={onPromptChange}
			skill={skill}
			onSkillChange={onSkillChange}
			placeholder={t("form.promptPlaceholder")}
			minHeight={promptMinHeight}
		/>
	);
}

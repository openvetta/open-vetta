import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { SkillInfo } from "@preload/api";
import { useThemeComponent } from "@vetta/theme-sdk";
import {
	DefaultSkillBadgeRow,
	type NewSessionSkillItem,
} from "@vetta/theme-ui/chat";
import type { SkillSelection } from "./types";

export { DefaultSkillBadgeRow } from "@vetta/theme-ui/chat";

interface SkillBadgeRowProps {
	onSelect: (skill: SkillInfo) => void;
	selected: SkillSelection;
	skills: SkillInfo[];
}

/** Connected: i18n labels + registry, pure badge row in theme-ui. */
export function SkillBadgeRow({ skills, selected, onSelect }: SkillBadgeRowProps): JSX.Element {
	const { t } = useTranslation("chat");
	const ThemedSkillBadgeRow = useThemeComponent("chat.newSessionSkillBadgeRow", DefaultSkillBadgeRow);
	const handleSelect = useCallback(
		(skill: NewSessionSkillItem) => {
			const matched = skills.find((item) => item.name === skill.name);
			if (matched) {
				onSelect(matched);
			}
		},
		[onSelect, skills],
	);

	return (
		<ThemedSkillBadgeRow
			labels={{
				scrollLeft: t("newSession.skillScrollLeft"),
				scrollRight: t("newSession.skillScrollRight"),
			}}
			onSelect={handleSelect}
			selected={selected}
			skills={skills}
		/>
	);
}

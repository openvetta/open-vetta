import { sanctumAchievements, type SanctumAchievement } from "./achievements";
import type { RealmDetailView, SanctumCultivationView } from "./types";

export function getRealmDetailView(achievement: SanctumAchievement, cultivation: SanctumCultivationView): RealmDetailView {
	const index = sanctumAchievements.findIndex((item) => item.id === achievement.id);
	const progressBase = achievement.level <= cultivation.level ? 1 : Math.max(0.18, 1 - (achievement.level - cultivation.level) * 0.18);
	const requirementTemplates = [
		{ icon: "icon-[solar--document-text-bold]", label: "正式文稿", target: 5 },
		{ icon: "icon-[solar--document-add-bold]", label: "知识库引用", target: 2 },
		{ icon: "icon-[solar--chart-2-bold]", label: "数据分析", target: 1 },
		{ icon: "icon-[solar--settings-bold]", label: "自动化任务", target: 1 },
	] as const;

	return {
		achieved: cultivation.achievedRealmIds.includes(achievement.id),
		achievement,
		definition:
			achievement.level <= cultivation.level
				? `${achievement.name}已稳定成形，代表你在多工具协同与真实业务推进中具备可靠积累。`
				: `${achievement.name}尚未达成，需要继续累积真实使用数据，完成关键能力条件后即可突破。`,
		nextRealmName: sanctumAchievements[index + 1]?.name ?? null,
		previousRealmName: sanctumAchievements[index - 1]?.name ?? null,
		requirements: requirementTemplates.map((requirement, requirementIndex) => ({
			current: Math.min(
				requirement.target,
				Math.floor(requirement.target * progressBase + (requirementIndex === 0 ? achievement.level % 3 : 0)),
			),
			icon: requirement.icon,
			label: requirement.label,
			target: requirement.target,
		})),
	};
}

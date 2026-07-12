import type { Button } from "@shared/components/ui/button";
type HostButton = typeof Button;
export type { HostButton as _HostPrimitiveHoldButton };
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import type { ActionState, MergedSkill } from "../hooks/useSkillsPageModel";
import { SceneCard } from "./SceneCard";
import { SkillCard } from "./SkillCard";

const easeOut = [0.22, 1, 0.36, 1] as const;

export function SkillTagGroup({
	tag,
	skills,
	onInstall,
	onToggle,
	onUninstall,
	onPreview,
	actionStates,
}: {
	tag: string;
	skills: MergedSkill[];
	onInstall: (skill: MergedSkill) => void;
	onToggle: (name: string) => void;
	onUninstall: (name: string, type: "skill" | "scene") => void;
	onPreview?: (skill: MergedSkill) => void;
	actionStates: Record<string, ActionState>;
}): JSX.Element {
	const { t } = useTranslation("skills");
	const enabledInGroup = skills.filter((s) => s.enabled).length;
	const isScene = skills[0]?.type === "scene";

	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.4, ease: easeOut }}
		>
			<div className="mb-3 flex items-baseline gap-2">
				<h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60">
					{tag}
				</h3>
				<span className="text-[11px] tabular-nums text-muted-foreground/40">
					{skills.length}
				</span>
				{enabledInGroup > 0 && (
					<>
						<span className="text-muted-foreground/25">·</span>
						<span className="text-[11px] text-emerald-400/80">
							{t("group.enabledCount", { n: enabledInGroup })}
						</span>
					</>
				)}
			</div>
			<motion.div
				className={
					isScene
						? "grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2.5"
						: "grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-x-2 gap-y-0.5"
				}
				initial="hidden"
				animate="show"
				variants={{
					hidden: {},
					show: { transition: { staggerChildren: 0.04 } },
				}}
			>
				{skills.map((skill) =>
					isScene ? (
						<SceneCard
							key={skill.name}
							scene={skill}
							onInstall={onInstall}
							onToggle={onToggle}
							onUninstall={onUninstall}
							onPreview={onPreview}
							actionState={actionStates[skill.name] ?? "idle"}
						/>
					) : (
						<SkillCard
							key={skill.name}
							skill={skill}
							onInstall={onInstall}
							onToggle={onToggle}
							onUninstall={onUninstall}
							onPreview={onPreview}
							actionState={actionStates[skill.name] ?? "idle"}
						/>
					),
				)}
			</motion.div>
		</motion.div>
	);
}

import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@shared/components/ui/dialog";
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

	const typeNoun = skill.type === "scene" ? t("typeNoun.scene") : t("typeNoun.skill");

	return (
		<Dialog
			open={true}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="text-lg font-bold">
						{skill.alias || skill.name}
					</DialogTitle>
				</DialogHeader>
				<div className="mt-2 space-y-4 text-sm">
					{skill.alias && skill.alias !== skill.name && (
						<div className="rounded-lg bg-muted/50 px-3 py-2">
							<span className="text-muted-foreground">{t("detail.name")}: </span>
							<span className="font-mono text-[13px]">{skill.name}</span>
						</div>
					)}

					<div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-muted/30 px-3 py-3">
						<div>
							<span className="text-muted-foreground">{t("detail.type")}</span>
							<p className="font-medium">{typeNoun}</p>
						</div>
						{skill.version && (
							<div>
								<span className="text-muted-foreground">{t("detail.version")}</span>
								<p className="font-medium">{skill.version}</p>
							</div>
						)}
						{skill.author && (
							<div>
								<span className="text-muted-foreground">{t("detail.author")}</span>
								<p className="font-medium">{skill.author}</p>
							</div>
						)}
						{skill.downloadCount != null && (
							<div>
								<span className="text-muted-foreground">{t("detail.downloads")}</span>
								<p className="font-medium">{skill.downloadCount.toLocaleString()}</p>
							</div>
						)}
					</div>

					{skill.tags && skill.tags.length > 0 && (
						<div className="flex flex-wrap gap-1.5">
							{skill.tags.map((tag) => (
								<span
									key={tag}
									className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] text-primary/80"
								>
									{tag}
								</span>
							))}
						</div>
					)}

					{skill.description && (
						<div>
							<h4 className="mb-1.5 text-[13px] font-semibold text-foreground/70">
								{t("detail.description")}
							</h4>
							<p className="leading-relaxed text-muted-foreground whitespace-pre-line">
								{skill.description}
							</p>
						</div>
					)}

					{skill.type === "skill" && (
						<>
							{skill.license && (
								<div className="flex items-center gap-1 text-muted-foreground/60">
									<span className="icon-[mdi--scale-balance] h-3.5 w-3.5" />
									<span className="text-[12px]">{skill.license}</span>
								</div>
							)}

							<div className="rounded-lg border border-dashed border-muted-foreground/20 bg-muted/20 px-3 py-2.5 text-[12px] text-muted-foreground/60">
								<p>{t("detail.notInstalledHint")}</p>
							</div>
						</>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}

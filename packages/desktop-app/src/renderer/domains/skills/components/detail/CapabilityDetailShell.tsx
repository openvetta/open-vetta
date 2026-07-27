import { SkillDefaultIcon, SkillTypeIcon } from "@vetta/theme-ui/skills";
import { Button, cn } from "@vetta/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { CapabilityDetailViewModel } from "../../detail/types";
import { CapabilityDetailSectionView } from "./CapabilityDetailSections";

function DetailIcon({ icon }: { icon: CapabilityDetailViewModel["icon"] }): JSX.Element {
	const [failed, setFailed] = useState(false);

	if (icon.kind === "skill") {
		return (
			<div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border/40 bg-accent/50 text-foreground">
				<SkillTypeIcon type={icon.skillType} icon={icon.icon} className="h-6 w-6" />
			</div>
		);
	}

	const showImage = Boolean(icon.url) && !failed;
	return (
		<div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border/40 bg-accent/50">
			{showImage && icon.url ? (
				<img src={icon.url} alt="" className="h-full w-full object-contain" onError={() => setFailed(true)} />
			) : (
				<SkillDefaultIcon className="h-6 w-6" />
			)}
		</div>
	);
}

export function CapabilityDetailShell({
	view,
	onPrimary,
	onSecondary,
	onOpenPermissionDetails,
}: {
	view: CapabilityDetailViewModel;
	onPrimary: () => void;
	onSecondary: (kind: CapabilityDetailViewModel["secondaryActions"][number]) => void;
	onOpenPermissionDetails?: () => void;
}): JSX.Element {
	const { t } = useTranslation("skills");

	const statusLabel = t(`capabilities.detail.status.${view.status}`);
	const primaryLabel =
		view.primaryAction === "none" ? null : t(`capabilities.detail.primary.${view.primaryAction}`);

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="shrink-0 border-b border-border/60 px-6 pb-6 pt-6">
				<div className="flex items-start gap-4">
					<DetailIcon icon={view.icon} />
					<div className="min-w-0 flex-1">
						<div className="flex flex-wrap items-center gap-2">
							<h2 className="truncate text-[17px] font-semibold leading-snug text-foreground">
								{view.title}
							</h2>
							<span
								className={cn(
									"inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium",
									view.status === "enabled" && "bg-emerald-500/15 text-emerald-400",
									view.status === "setup_required" && "bg-amber-500/15 text-amber-400",
									view.status === "available" && "bg-muted text-muted-foreground",
									view.status === "disabled" && "bg-muted text-muted-foreground",
									view.status === "readonly" && "bg-accent/60 text-muted-foreground/80",
								)}
							>
								{statusLabel}
							</span>
						</div>
						{view.summary ? (
							<p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-muted-foreground">
								{view.summary}
							</p>
						) : null}
						{view.developer ? (
							<p className="mt-2 text-[12px] text-muted-foreground/75">
								{t("capabilities.detail.developerLabel", { name: view.developer })}
							</p>
						) : null}
						{view.tags.length > 0 ? (
							<div className="mt-3 flex flex-wrap gap-1.5">
								{view.tags.map((tag) => (
									<span
										key={tag}
										className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary/90"
									>
										{tag}
									</span>
								))}
							</div>
						) : null}
					</div>
				</div>

				{primaryLabel ? (
					<div className="mt-5">
						<Button className="w-full" size="lg" disabled={view.busy} onClick={onPrimary}>
							{view.busy ? (
								<span className="icon-[solar--refresh-linear] h-4 w-4 animate-spin" />
							) : (
								<span className="icon-[solar--play-circle-bold] h-4 w-4" />
							)}
							{primaryLabel}
						</Button>
					</div>
				) : null}

				{view.secondaryActions.length > 0 ? (
					<div className="mt-3 flex flex-wrap gap-2">
						{view.secondaryActions.map((kind) => (
							<Button
								key={kind}
								variant="ghost"
								size="sm"
								disabled={view.busy}
								className={cn(kind === "remove" && "text-destructive hover:text-destructive")}
								onClick={() => onSecondary(kind)}
							>
								{t(`capabilities.detail.secondary.${kind}`)}
							</Button>
						))}
					</div>
				) : null}
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
				<div className="flex flex-col gap-7">
					{view.sections.map((section) => (
						<CapabilityDetailSectionView
							key={section.id}
							section={section}
							detailLinkLabel={t("capabilities.detail.section.viewPermissionDetails")}
							reviewsCountLabel={
								section.type === "reviews" && section.count != null
									? t("capabilities.detail.reviewsFromCount", { count: section.count })
									: ""
							}
							onOpenPermissionDetails={onOpenPermissionDetails}
							canOpenPermissionDetails={view.canOpenPermissionDetails}
						/>
					))}
				</div>
			</div>
		</div>
	);
}

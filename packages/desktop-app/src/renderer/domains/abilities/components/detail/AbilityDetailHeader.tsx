import { Button, cn } from "@vetta/ui";
import { useTranslation } from "react-i18next";
import {
	resolveAbilityPrimaryAction,
	resolveAbilitySecondaryActions,
	resolveAbilityStatus,
	type AbilitySecondaryAction,
} from "../../lib/ability-detail-actions";
import { useAbilityText } from "../../hooks/useAbilityText";
import type { AbilityItem } from "../../types";
import { AbilityIcon } from "../AbilityIcon";
import { AbilityStatusBadges, AbilityTypeBadge } from "../AbilityBadges";

/** 通用壳层：返回 / 图标 / 标题 / 作者 / 版本 / 状态 / 描述 / 主次 CTA。 */
export function AbilityDetailHeader({
	item,
	onBack,
	onPrimary,
	onSecondary,
}: {
	item: AbilityItem;
	onBack: () => void;
	onPrimary: () => void;
	onSecondary: (kind: AbilitySecondaryAction) => void;
}): JSX.Element {
	const { t } = useTranslation("abilities");
	const { title, description } = useAbilityText()(item);
	const status = resolveAbilityStatus(item);
	const primary = resolveAbilityPrimaryAction(item, status);
	const secondaries = resolveAbilitySecondaryActions(item, status);

	return (
		<div className="border-b border-border/60 pb-6">
			{/* 返回按钮与图标左对齐：抵消 size=sm 的 px-2.5 */}
			<Button variant="ghost" size="sm" className="-ml-2.5 mb-3" onClick={onBack}>
				<span className="icon-[solar--alt-arrow-left-linear] h-3.5 w-3.5" />
				{t("detail.back")}
			</Button>

			<div className="flex items-start gap-4">
				<AbilityIcon icon={item.icon} type={item.type} className="h-14 w-14 rounded-2xl" iconClassName="h-7 w-7" />
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<h1 className="truncate text-[19px] font-semibold leading-snug text-foreground">{title}</h1>
						<AbilityTypeBadge item={item} />
						<span
							className={cn(
								"inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium",
								status === "enabled" && "bg-emerald-500/15 text-emerald-400",
								status === "setup_required" && "bg-amber-500/15 text-amber-400",
								(status === "available" || status === "disabled") && "bg-muted text-muted-foreground",
								status === "readonly" && "bg-accent/60 text-muted-foreground/80",
							)}
						>
							{t(`detail.status.${status}`)}
						</span>
						<AbilityStatusBadges item={item} />
					</div>

					<dl className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground/70">
						{item.author ? (
							<span>
								<dt className="inline">{t("detail.meta.author")}</dt>
								<dd className="ml-1 inline text-foreground/80">{item.author}</dd>
							</span>
						) : null}
						{item.version ? (
							<span>
								<dt className="inline">{t("detail.meta.version")}</dt>
								<dd className="ml-1 inline tabular-nums text-foreground/80">{item.version}</dd>
							</span>
						) : null}
						{item.localVersion && item.localVersion !== item.version ? (
							<span>
								<dt className="inline">{t("detail.meta.localVersion")}</dt>
								<dd className="ml-1 inline tabular-nums text-foreground/80">{item.localVersion}</dd>
							</span>
						) : null}
						{item.downloadCount > 0 ? (
							<span>
								<dt className="inline">{t("detail.meta.downloads")}</dt>
								<dd className="ml-1 inline tabular-nums text-foreground/80">{item.downloadCount}</dd>
							</span>
						) : null}
						{item.license ? (
							<span>
								<dt className="inline">{t("detail.meta.license")}</dt>
								<dd className="ml-1 inline text-foreground/80">{item.license}</dd>
							</span>
						) : null}
					</dl>
				</div>
			</div>

			{/* 描述与标签落在图标下方，与图标左对齐 */}
			{description ? (
				<p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">{description}</p>
			) : null}

			{item.tags.length > 0 ? (
				<div className="mt-3 flex flex-wrap gap-1.5">
					{item.tags.map((tag) => (
						<span
							key={tag}
							className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary/90"
						>
							{tag}
						</span>
					))}
				</div>
			) : null}

			{primary !== "none" ? (
				<div className="mt-5">
					<Button className="w-full" size="lg" disabled={item.busy} onClick={onPrimary}>
						{item.busy ? (
							<span className="icon-[solar--refresh-linear] h-4 w-4 animate-spin" />
						) : (
							<span className="icon-[solar--play-circle-bold] h-4 w-4" />
						)}
						{t(`detail.primary.${primary}`)}
					</Button>
				</div>
			) : null}

			{secondaries.length > 0 ? (
				<div className="mt-3 flex flex-wrap gap-2">
					{secondaries.map((kind) => (
						<Button
							key={kind}
							variant="ghost"
							size="sm"
							disabled={item.busy}
							className={cn(kind === "remove" && "text-destructive hover:text-destructive")}
							onClick={() => onSecondary(kind)}
						>
							{t(`detail.secondary.${kind}`)}
						</Button>
					))}
				</div>
			) : null}
		</div>
	);
}

import { cn } from "@vetta/ui";
import { useTranslation } from "react-i18next";
import { ABILITY_TYPE_ICON, ABILITY_TYPE_LABEL_KEY } from "../lib/ability-presentation";
import {
	ABILITY_CATEGORY_ALL,
	ABILITY_CATEGORY_UNCATEGORIZED,
	ABILITY_TYPES,
	type AbilitiesModel,
} from "../types";

function FilterChip({
	active,
	onClick,
	children,
}: {
	active: boolean;
	onClick: () => void;
	children: React.ReactNode;
}): JSX.Element {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
				active
					? "bg-primary/12 text-primary ring-1 ring-inset ring-primary/25"
					: "bg-secondary text-muted-foreground/80 hover:bg-accent hover:text-foreground",
			)}
		>
			{children}
		</button>
	);
}

/**
 * 正交两条筛选轴：分类（用途）与类型（五种 type）。
 * 用途是用户找东西的方式，type 只是形态，故 type 轴排在下方且带计数。
 */
export function AbilityFilterBar({ model }: { model: AbilitiesModel }): JSX.Element {
	const { t } = useTranslation("abilities");

	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-wrap items-center gap-1.5">
				<span className="mr-1 text-[11px] text-muted-foreground/50">{t("filter.category")}</span>
				<FilterChip
					active={model.categoryFilter === ABILITY_CATEGORY_ALL}
					onClick={() => model.setCategoryFilter(ABILITY_CATEGORY_ALL)}
				>
					{t("filter.all")}
				</FilterChip>
				{model.categories.map((category) => (
					<FilterChip
						key={category}
						active={model.categoryFilter === category}
						onClick={() => model.setCategoryFilter(category)}
					>
						{category === ABILITY_CATEGORY_UNCATEGORIZED ? t("filter.uncategorized") : category}
					</FilterChip>
				))}
			</div>
			<div className="flex flex-wrap items-center gap-1.5">
				<span className="mr-1 text-[11px] text-muted-foreground/50">{t("filter.type")}</span>
				<FilterChip active={model.typeFilter === "all"} onClick={() => model.setTypeFilter("all")}>
					{t("filter.all")}
				</FilterChip>
				{ABILITY_TYPES.map((type) => (
					<FilterChip
						key={type}
						active={model.typeFilter === type}
						onClick={() => model.setTypeFilter(type)}
					>
						<span className={cn("h-3 w-3", ABILITY_TYPE_ICON[type])} />
						{t(ABILITY_TYPE_LABEL_KEY[type])}
						<span className="tabular-nums opacity-60">{model.typeCounts[type]}</span>
					</FilterChip>
				))}
			</div>
		</div>
	);
}

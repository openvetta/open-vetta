import type { BatchTask } from "@shared/store/atoms";
import { useTranslation } from "react-i18next";
import { TASK_COLLAPSE_THRESHOLD } from "../../utils/batchTaskListData";
import { BatchTaskCard } from "./BatchTaskCard";
import type { TaskCallbacks } from "./types";

export function BatchTaskGrid({
	callbacks,
	collapsed,
	countsTotal,
	filteredTotal,
	hiddenCount,
	normalizedQuery,
	onClearSearch,
	onSearchChange,
	onToggleExpanded,
	queuedTaskIds,
	searchQuery,
	visibleTasks,
}: {
	callbacks: TaskCallbacks;
	collapsed: boolean;
	countsTotal: number;
	filteredTotal: number;
	hiddenCount: number;
	normalizedQuery: string;
	onClearSearch: () => void;
	onSearchChange: (value: string) => void;
	onToggleExpanded: () => void;
	queuedTaskIds: Set<string>;
	searchQuery: string;
	visibleTasks: BatchTask[];
}): JSX.Element {
	const { t } = useTranslation("batch-tasks");

	return (
		<div>
			{countsTotal > 0 && (
				<div className="relative mb-3">
					<span className="icon-[solar--magnifer-linear] pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
					<input
						type="text"
						value={searchQuery}
						onChange={(event) => onSearchChange(event.target.value)}
						placeholder={t("list.searchPlaceholder")}
						className="h-8 w-full rounded-lg border border-border/40 bg-card/30 pl-8 pr-8 text-[12px] text-foreground placeholder:text-muted-foreground/40 outline-none transition-colors focus:border-primary/40 focus:bg-card/50"
					/>
					{searchQuery && (
						<button
							type="button"
							onClick={onClearSearch}
							title={t("list.clear")}
							className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground"
						>
							<span className="icon-[solar--close-circle-linear] h-3 w-3" />
						</button>
					)}
				</div>
			)}
			{filteredTotal === 0 ? (
				<div className="flex flex-col items-center gap-1.5 py-6 text-center">
					<span className="icon-[solar--magnifer-linear] h-5 w-5 text-muted-foreground/50" />
					<p className="text-[12px] text-muted-foreground/60">
						{normalizedQuery ? t("list.noMatch", { query: searchQuery }) : t("list.noTasks")}
					</p>
				</div>
			) : (
				<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
					{visibleTasks.map((task) => (
						<BatchTaskCard key={task.id} callbacks={callbacks} isQueued={queuedTaskIds.has(task.id)} task={task} />
					))}
				</div>
			)}
			{!normalizedQuery && countsTotal > TASK_COLLAPSE_THRESHOLD && (
				<div className="mt-3 flex justify-center">
					<button
						type="button"
						onClick={onToggleExpanded}
						className="flex items-center gap-1 rounded-full border border-border/50 bg-background/40 px-3 py-1 text-[11px] text-muted-foreground/80 transition-colors hover:border-primary/30 hover:text-foreground"
					>
						<span
							className={
								collapsed
									? "icon-[solar--alt-arrow-down-linear] h-3.5 w-3.5"
									: "icon-[solar--alt-arrow-up-linear] h-3.5 w-3.5"
							}
						/>
						{collapsed ? t("list.expandMore", { n: hiddenCount }) : t("list.collapse")}
					</button>
				</div>
			)}
		</div>
	);
}

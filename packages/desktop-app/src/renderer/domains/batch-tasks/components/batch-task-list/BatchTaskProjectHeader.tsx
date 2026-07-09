import { useNarrowScreen } from "@shared/hooks/useNarrowScreen";
import type { BatchProject } from "@shared/store/atoms";
import { useTranslation } from "react-i18next";
import type { ProjectCounts } from "../../hooks/useBatchTaskListModel";

export function BatchTaskProjectHeader({
	counts,
	filteredTotal,
	normalizedQuery,
	onResetFailed,
	project,
}: {
	counts: ProjectCounts;
	filteredTotal: number;
	normalizedQuery: string;
	onResetFailed: () => void;
	project: BatchProject;
}): JSX.Element {
	const { t } = useTranslation("batch-tasks");
	const narrow = useNarrowScreen();

	return (
		<>
			<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-inset ring-primary/20">
				<span className="icon-[solar--folder-with-files-linear] h-[18px] w-[18px] text-primary" />
			</div>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<h3 className="truncate text-[15px] font-semibold tracking-tight text-foreground">{project.name}</h3>
					{!narrow && (
						<span className="inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-full bg-accent/50 px-2 text-[10px] text-muted-foreground/70">
							{normalizedQuery
								? t("list.matchCount", { filtered: filteredTotal, total: counts.total })
								: t("list.taskCount", { n: counts.total })}
						</span>
					)}
				</div>
				<p className="mt-1 flex items-center gap-1 truncate text-[11px] text-muted-foreground/60">
					<span>
						{t("list.completedOf", { completed: counts.completed, total: counts.total })}
						{counts.running > 0 && t("list.runningSuffix", { n: counts.running })}
						{counts.paused > 0 && t("list.pausedSuffix", { n: counts.paused })}
					</span>
					{counts.failed > 0 && (
						<>
							<span>·</span>
							<button
								type="button"
								onClick={onResetFailed}
								title={t("list.resetFailedHint", { n: counts.failed })}
								className="inline-flex h-4 items-center rounded-full bg-destructive/10 px-1.5 text-[10px] font-medium leading-none text-destructive transition-colors hover:bg-destructive/20"
							>
								{t("list.failedReset", { n: counts.failed })}
							</button>
						</>
					)}
				</p>
			</div>
		</>
	);
}

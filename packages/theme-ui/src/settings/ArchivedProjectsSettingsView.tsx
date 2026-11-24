import type { JSX } from "react";
import { Button, cn } from "@vetta-org/ui";
import { SettingSection, type SettingSectionMeta } from "./SettingChrome";

export interface ArchivedProjectRowView {
	readonly path: string;
	readonly name: string;
}

export interface ArchivedProjectsSettingsViewLabels {
	readonly title: string;
	readonly empty: string;
	readonly sectionTitle: string;
	readonly unarchive: string;
	readonly deleteProject: string;
	readonly selectAll: string;
	readonly selectProject: (name: string) => string;
	/** 已带数量的文案，如「已选 3 个」。 */
	readonly selectedCount: string;
	readonly clearSelection: string;
	readonly unarchiveSelected: string;
	readonly deleteSelected: string;
	/** 已带数量的失败提示，仅在 failedCount > 0 时显示。 */
	readonly batchFailed: string;
}

export interface ArchivedProjectsSettingsViewProps {
	readonly labels: ArchivedProjectsSettingsViewLabels;
	readonly projects: readonly ArchivedProjectRowView[];
	readonly section: SettingSectionMeta;
	readonly selected: ReadonlySet<string>;
	readonly busy?: boolean;
	readonly failedCount?: number;
	readonly onUnarchive: (path: string) => void;
	readonly onDelete: (path: string) => void;
	readonly onToggleSelected: (path: string) => void;
	readonly onToggleAll: () => void;
	readonly onClearSelection: () => void;
	readonly onUnarchiveSelected: () => void;
	readonly onDeleteSelected: () => void;
}

function SelectBox({
	checked,
	indeterminate = false,
	label,
	disabled,
	onToggle,
}: {
	checked: boolean;
	indeterminate?: boolean;
	label: string;
	disabled?: boolean;
	onToggle: () => void;
}): JSX.Element {
	const filled = checked || indeterminate;
	return (
		<button
			type="button"
			role="checkbox"
			aria-checked={indeterminate ? "mixed" : checked}
			aria-label={label}
			disabled={disabled}
			onClick={onToggle}
			className={cn(
				"flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors disabled:opacity-50",
				filled ? "border-primary bg-primary" : "border-border bg-card hover:bg-accent",
			)}
		>
			{filled && (
				<span
					aria-hidden="true"
					className={cn(
						indeterminate ? "icon-[mdi--minus]" : "icon-[mdi--check]",
						"h-3 w-3 text-primary-foreground",
					)}
				/>
			)}
		</button>
	);
}

/**
 * 设置 → 已归档。
 *
 * 归档项目攒多了逐个点恢复/删除很费劲，所以每行可勾选，列表头部给全选；
 * 有选中项时头部换成批量操作条，删除仍需一次确认。
 */
export function ArchivedProjectsSettingsView({
	labels,
	projects,
	section,
	selected,
	busy = false,
	failedCount = 0,
	onUnarchive,
	onDelete,
	onToggleSelected,
	onToggleAll,
	onClearSelection,
	onUnarchiveSelected,
	onDeleteSelected,
}: ArchivedProjectsSettingsViewProps): JSX.Element {
	const selectedCount = projects.filter((entry) => selected.has(entry.path)).length;
	const allSelected = projects.length > 0 && selectedCount === projects.length;
	const someSelected = selectedCount > 0 && !allSelected;

	return (
		<div className="mx-auto w-full max-w-[680px] px-8 pt-2 pb-4">
			<h1 className="mb-6 text-[20px] font-bold text-foreground">{labels.title}</h1>

			{projects.length === 0 ? (
				<div className="flex flex-col items-center gap-2.5 py-16 text-center">
					<span className="icon-[mdi--archive-off-outline] h-8 w-8 text-muted-foreground" />
					<p className="text-[13px] text-muted-foreground">{labels.empty}</p>
				</div>
			) : (
				<SettingSection title={labels.sectionTitle} section={section}>
					<div className="flex min-h-11 items-center gap-3 border-b border-border px-5 py-2">
						<SelectBox
							checked={allSelected}
							indeterminate={someSelected}
							label={labels.selectAll}
							disabled={busy}
							onToggle={onToggleAll}
						/>
						<div className="min-w-0 flex-1 text-[12px] text-muted-foreground">
							{selectedCount > 0 ? labels.selectedCount : labels.selectAll}
						</div>
						{selectedCount > 0 && (
							<div className="flex items-center gap-1">
								<Button variant="ghost" size="xs" disabled={busy} onClick={onClearSelection}>
									{labels.clearSelection}
								</Button>
								<Button variant="ghost" size="xs" disabled={busy} onClick={onUnarchiveSelected}>
									<span className="icon-[mdi--archive-arrow-up-outline] h-3.5 w-3.5" aria-hidden="true" />
									{labels.unarchiveSelected}
								</Button>
								<Button
									variant="ghost"
									size="xs"
									disabled={busy}
									onClick={onDeleteSelected}
									className="text-muted-foreground hover:text-destructive"
								>
									<span className="icon-[mdi--delete-outline] h-3.5 w-3.5" aria-hidden="true" />
									{labels.deleteSelected}
								</Button>
							</div>
						)}
					</div>
					{failedCount > 0 && (
						<div role="alert" className="border-b border-border px-5 py-2 text-[12px] text-destructive">
							{labels.batchFailed}
						</div>
					)}
					{projects.map((entry) => (
						<div
							key={entry.path}
							className="flex items-center gap-3 border-b border-border px-5 py-3.5 last:border-b-0"
						>
							<SelectBox
								checked={selected.has(entry.path)}
								label={labels.selectProject(entry.name)}
								disabled={busy}
								onToggle={() => onToggleSelected(entry.path)}
							/>
							<span className="icon-[mdi--folder-outline] h-4 w-4 shrink-0 text-muted-foreground" />
							<div className="min-w-0 flex-1">
								<div className="text-[13px] font-medium text-foreground">{entry.name}</div>
								<div className="mt-0.5 truncate text-[11px] text-muted-foreground">{entry.path}</div>
							</div>
							<div className="flex items-center gap-1">
								<Button
									variant="ghost"
									size="xs"
									disabled={busy}
									onClick={() => onUnarchive(entry.path)}
									title={labels.unarchive}
								>
									<span className="icon-[mdi--archive-arrow-up-outline] h-3.5 w-3.5" />
									{labels.unarchive}
								</Button>
								<Button
									variant="ghost"
									size="icon-xs"
									disabled={busy}
									onClick={() => onDelete(entry.path)}
									title={labels.deleteProject}
									className="text-muted-foreground hover:text-destructive"
								>
									<span className="icon-[mdi--delete-outline] h-3.5 w-3.5" />
								</Button>
							</div>
						</div>
					))}
				</SettingSection>
			)}
		</div>
	);
}

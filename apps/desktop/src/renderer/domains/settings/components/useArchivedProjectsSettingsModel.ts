import { useProjectActions } from "@domains/project/hooks/useProjects";
import type { ProjectEntry } from "@preload/api";
import { pathBasename } from "@shared/lib/utils";
import { confirmDialogAtom } from "@shared/store/atoms";
import { useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { SETTINGS_SECTION } from "../registry";
import { recordSettingsUsage } from "./recordSettingsUsage";

export interface ArchivedProjectItem {
	name: string;
	path: string;
}

export interface ArchivedProjectsSettingsModel {
	actions: {
		clearSelection: () => void;
		delete: (path: string) => void;
		deleteSelected: () => void;
		toggleAll: () => void;
		toggleSelected: (path: string) => void;
		unarchive: (path: string) => Promise<void>;
		unarchiveSelected: () => Promise<void>;
	};
	/** 批量操作进行中：按钮置灰，避免同一批被重复提交。 */
	busy: boolean;
	/** 上一次批量操作里没处理成功的个数，0 表示没有失败。 */
	failedCount: number;
	labels: {
		batchFailed: string;
		clearSelection: string;
		deleteProject: string;
		deleteSelected: string;
		empty: string;
		sectionTitle: string;
		selectAll: string;
		selectedCount: string;
		selectProject: (name: string) => string;
		title: string;
		unarchive: string;
		unarchiveSelected: string;
	};
	projects: readonly ArchivedProjectItem[];
	selected: ReadonlySet<string>;
}

function projectName(entry: ProjectEntry): string {
	return entry.name ?? pathBasename(entry.path);
}

/** 逐个执行，单个失败不打断其余项；返回成功处理的路径。 */
async function runEach(paths: readonly string[], run: (path: string) => Promise<void>): Promise<Set<string>> {
	const done = new Set<string>();
	for (const path of paths) {
		try {
			await run(path);
			done.add(path);
		} catch {
			// 失败的留在列表和选择里，用户可以直接再试一次。
		}
	}
	return done;
}

export function useArchivedProjectsSettingsModel(): ArchivedProjectsSettingsModel {
	const { t } = useTranslation("settings");
	const [archivedList, setArchivedList] = useState<ProjectEntry[]>([]);
	const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
	const [busy, setBusy] = useState(false);
	const [failedCount, setFailedCount] = useState(0);
	const { unarchiveProject, deleteArchivedProject, refreshProjects } = useProjectActions();
	const setConfirm = useSetAtom(confirmDialogAtom);

	useEffect(() => {
		void window.vetta.config.get().then((config) => {
			setArchivedList(config.archivedProjects ?? []);
		});
	}, []);

	const dropFromList = useCallback((paths: ReadonlySet<string>) => {
		if (paths.size === 0) return;
		setFailedCount(0);
		setArchivedList((prev) => prev.filter((entry) => !paths.has(entry.path)));
		setSelected((prev) => new Set([...prev].filter((path) => !paths.has(path))));
	}, []);

	const unarchive = useCallback(
		async (path: string) => {
			await unarchiveProject(path);
			dropFromList(new Set([path]));
			recordSettingsUsage({ tab: "archived", action: "restored", target: "project" });
		},
		[dropFromList, unarchiveProject],
	);

	const deleteProject = useCallback(
		(path: string) => {
			const entry = archivedList.find((item) => item.path === path);
			if (!entry) return;
			setConfirm({
				title: t("deleteArchiveConfirm"),
				message: t("deleteArchiveMessage", { name: projectName(entry) }),
				confirmLabel: t("archiveDelete"),
				variant: "danger",
				onConfirm: () => {
					void deleteArchivedProject(path).then(() => {
						dropFromList(new Set([path]));
						recordSettingsUsage({ tab: "archived", action: "deleted", target: "project" });
					});
				},
			});
		},
		[archivedList, deleteArchivedProject, dropFromList, setConfirm, t],
	);

	// 只对仍在列表里的项生效，避免选中状态里残留已被移走的路径。
	const selectedPaths = useMemo(
		() => archivedList.map((entry) => entry.path).filter((path) => selected.has(path)),
		[archivedList, selected],
	);

	const toggleSelected = useCallback((path: string) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(path)) next.delete(path);
			else next.add(path);
			return next;
		});
	}, []);

	const toggleAll = useCallback(() => {
		setSelected(
			selectedPaths.length === archivedList.length ? new Set() : new Set(archivedList.map((entry) => entry.path)),
		);
	}, [archivedList, selectedPaths.length]);

	const clearSelection = useCallback(() => setSelected(new Set()), []);

	const unarchiveSelected = useCallback(async () => {
		if (busy || selectedPaths.length === 0) return;
		setBusy(true);
		try {
			// 直接走 IPC 再统一刷新一次侧栏，避免每恢复一个就整体刷新一次。
			const done = await runEach(selectedPaths, (path) => window.vetta.project.unarchive(path));
			if (done.size > 0) await refreshProjects();
			dropFromList(done);
			setFailedCount(selectedPaths.length - done.size);
			if (done.size > 0) {
				recordSettingsUsage({ tab: "archived", action: "restored", target: "projects", value: String(done.size) });
			}
		} finally {
			setBusy(false);
		}
	}, [busy, dropFromList, refreshProjects, selectedPaths]);

	const deleteSelected = useCallback(() => {
		if (busy || selectedPaths.length === 0) return;
		const paths = selectedPaths;
		setConfirm({
			title: t("archivedDeleteSelectedConfirm"),
			message: t("archivedDeleteSelectedMessage", { count: paths.length }),
			confirmLabel: t("archiveDelete"),
			variant: "danger",
			onConfirm: () => {
				setBusy(true);
				void runEach(paths, deleteArchivedProject)
					.then((done) => {
						dropFromList(done);
						setFailedCount(paths.length - done.size);
						if (done.size > 0) {
							recordSettingsUsage({
								tab: "archived",
								action: "deleted",
								target: "projects",
								value: String(done.size),
							});
						}
					})
					.finally(() => setBusy(false));
			},
		});
	}, [busy, deleteArchivedProject, dropFromList, selectedPaths, setConfirm, t]);

	const projects = useMemo<readonly ArchivedProjectItem[]>(
		() => archivedList.map((entry) => ({ name: projectName(entry), path: entry.path })),
		[archivedList],
	);

	const labels = useMemo(
		() => ({
			batchFailed: t("archivedBatchFailed", { count: failedCount }),
			clearSelection: t("archivedClearSelection"),
			deleteProject: t("deleteProject"),
			deleteSelected: t("archivedDeleteSelected"),
			empty: t("noArchivedProjects"),
			sectionTitle: t(SETTINGS_SECTION["archived-list"].titleKey),
			selectAll: t("archivedSelectAll"),
			selectedCount: t("archivedSelectedCount", { count: selectedPaths.length }),
			selectProject: (name: string) => t("archivedSelectProject", { name }),
			title: t("archivedProjects"),
			unarchive: t("unarchive"),
			unarchiveSelected: t("archivedUnarchiveSelected"),
		}),
		[failedCount, selectedPaths.length, t],
	);

	const selectedSet = useMemo<ReadonlySet<string>>(() => new Set(selectedPaths), [selectedPaths]);

	return {
		actions: {
			clearSelection,
			delete: deleteProject,
			deleteSelected,
			toggleAll,
			toggleSelected,
			unarchive,
			unarchiveSelected,
		},
		busy,
		failedCount,
		labels,
		projects,
		selected: selectedSet,
	};
}

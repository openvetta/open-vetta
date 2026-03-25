import { useSetAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { confirmDialogAtom } from "@shared/store/atoms";
import { useProjects } from "@domains/project/hooks/useProjects";
import { SettingSection } from "./shared";

function projectName(cwd: string): string {
	return cwd.split("/").filter(Boolean).pop() ?? cwd;
}

export function ArchivedProjectsSettings(): JSX.Element {
	const [archivedList, setArchivedList] = useState<string[]>([]);
	const { unarchiveProject, deleteArchivedProject } = useProjects();
	const setConfirm = useSetAtom(confirmDialogAtom);

	useEffect(() => {
		void window.vetta.config.get().then((c) => {
			setArchivedList(c.archivedProjects ?? []);
		});
	}, []);

	const handleUnarchive = useCallback(
		async (cwd: string) => {
			await unarchiveProject(cwd);
			setArchivedList((prev) => prev.filter((p) => p !== cwd));
		},
		[unarchiveProject],
	);

	const handleDelete = useCallback(
		(cwd: string) => {
			setConfirm({
				title: "删除归档项目",
				message: `确定要永久移除「${projectName(cwd)}」吗？此操作不会删除磁盘上的文件，仅从归档列表中移除。`,
				confirmLabel: "删除",
				variant: "danger",
				onConfirm: () => {
					void deleteArchivedProject(cwd).then(() => {
						setArchivedList((prev) => prev.filter((p) => p !== cwd));
					});
				},
			});
		},
		[deleteArchivedProject, setConfirm],
	);

	return (
		<div className="mx-auto w-full max-w-[680px] px-8 py-4">
			<h1 className="mb-6 text-[20px] font-bold text-[var(--text-1)]">已归档项目</h1>

			{archivedList.length === 0 ? (
				<div className="flex flex-col items-center gap-2.5 py-16 text-center">
					<span className="icon-[mdi--archive-off-outline] h-8 w-8 text-[var(--text-2)]" />
					<p className="text-[13px] text-[var(--text-2)]">暂无归档项目</p>
				</div>
			) : (
				<SettingSection title="归档列表">
					{archivedList.map((cwd) => (
						<div
							key={cwd}
							className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-3.5 last:border-b-0"
						>
							<span className="icon-[mdi--folder-outline] h-4 w-4 shrink-0 text-[var(--text-2)]" />
							<div className="min-w-0 flex-1">
								<div className="text-[13px] font-medium text-[var(--text-1)]">
									{projectName(cwd)}
								</div>
								<div className="mt-0.5 truncate text-[11px] text-[var(--text-2)]">{cwd}</div>
							</div>
							<div className="flex items-center gap-1">
								<button
									type="button"
									onClick={() => void handleUnarchive(cwd)}
									className="flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/10"
									title="取消归档"
								>
									<span className="icon-[mdi--archive-arrow-up-outline] h-3.5 w-3.5" />
									取消归档
								</button>
								<button
									type="button"
									onClick={() => handleDelete(cwd)}
									className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-2)] transition-colors hover:bg-red-500/10 hover:text-red-400"
									title="删除"
								>
									<span className="icon-[mdi--delete-outline] h-3.5 w-3.5" />
								</button>
							</div>
						</div>
					))}
				</SettingSection>
			)}
		</div>
	);
}

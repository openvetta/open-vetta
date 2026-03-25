import { useSetAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { confirmDialogAtom } from "@shared/store/atoms";
import { useProjects } from "@domains/project/hooks/useProjects";
import { Button } from "@shared/components/ui/button";
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
			<h1 className="mb-6 text-[20px] font-bold text-foreground">已归档项目</h1>

			{archivedList.length === 0 ? (
				<div className="flex flex-col items-center gap-2.5 py-16 text-center">
					<span className="icon-[mdi--archive-off-outline] h-8 w-8 text-muted-foreground" />
					<p className="text-[13px] text-muted-foreground">暂无归档项目</p>
				</div>
			) : (
				<SettingSection title="归档列表">
					{archivedList.map((cwd) => (
						<div
							key={cwd}
							className="flex items-center gap-3 border-b border-border px-5 py-3.5 last:border-b-0"
						>
							<span className="icon-[mdi--folder-outline] h-4 w-4 shrink-0 text-muted-foreground" />
							<div className="min-w-0 flex-1">
								<div className="text-[13px] font-medium text-foreground">
									{projectName(cwd)}
								</div>
								<div className="mt-0.5 truncate text-[11px] text-muted-foreground">{cwd}</div>
							</div>
							<div className="flex items-center gap-1">
								<Button variant="ghost" size="xs" onClick={() => void handleUnarchive(cwd)} title="取消归档">
									<span className="icon-[mdi--archive-arrow-up-outline] h-3.5 w-3.5" />
									取消归档
								</Button>
								<Button variant="ghost" size="icon-xs" onClick={() => handleDelete(cwd)} title="删除" className="text-muted-foreground hover:text-red-400">
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

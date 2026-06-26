import type { ProjectEntry } from "@preload/api";
import { useSetAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { confirmDialogAtom } from "@shared/store/atoms";
import { useProjects } from "@domains/project/hooks/useProjects";
import { Button } from "@shared/components/ui/button";
import { SettingSection } from "./shared";
import { pathBasename } from "@shared/lib/utils";
import { SETTINGS_SECTION } from "../registry";

function projectName(entry: ProjectEntry): string {
	return entry.name ?? pathBasename(entry.path);
}

export function ArchivedProjectsSettings(): JSX.Element {
	const { t } = useTranslation("settings");
	const [archivedList, setArchivedList] = useState<ProjectEntry[]>([]);
	const { unarchiveProject, deleteArchivedProject } = useProjects();
	const setConfirm = useSetAtom(confirmDialogAtom);

	useEffect(() => {
		void window.vetta.config.get().then((c) => {
			setArchivedList(c.archivedProjects ?? []);
		});
	}, []);

	const handleUnarchive = useCallback(
		async (entry: ProjectEntry) => {
			await unarchiveProject(entry.path);
			setArchivedList((prev) => prev.filter((p) => p.path !== entry.path));
		},
		[unarchiveProject],
	);

	const handleDelete = useCallback(
		(entry: ProjectEntry) => {
			setConfirm({
				title: t("deleteArchiveConfirm"),
				message: t("deleteArchiveMessage", { name: projectName(entry) }),
				confirmLabel: t("archiveDelete"),
				variant: "danger",
				onConfirm: () => {
					void deleteArchivedProject(entry.path).then(() => {
						setArchivedList((prev) => prev.filter((p) => p.path !== entry.path));
					});
				},
			});
		},
		[deleteArchivedProject, setConfirm],
	);

	return (
		<div className="mx-auto w-full max-w-[680px] px-8 py-4">
			<h1 className="mb-6 text-[20px] font-bold text-foreground">{t("archivedProjects")}</h1>

			{archivedList.length === 0 ? (
				<div className="flex flex-col items-center gap-2.5 py-16 text-center">
					<span className="icon-[mdi--archive-off-outline] h-8 w-8 text-muted-foreground" />
					<p className="text-[13px] text-muted-foreground">{t("noArchivedProjects")}</p>
				</div>
			) : (
				<SettingSection t={t as any} section={SETTINGS_SECTION["archived-list"]}>
					{archivedList.map((entry) => (
						<div
							key={entry.path}
							className="flex items-center gap-3 border-b border-border px-5 py-3.5 last:border-b-0"
						>
							<span className="icon-[mdi--folder-outline] h-4 w-4 shrink-0 text-muted-foreground" />
							<div className="min-w-0 flex-1">
								<div className="text-[13px] font-medium text-foreground">{projectName(entry)}</div>
								<div className="mt-0.5 truncate text-[11px] text-muted-foreground">{entry.path}</div>
							</div>
							<div className="flex items-center gap-1">
								<Button
									variant="ghost"
									size="xs"
									onClick={() => void handleUnarchive(entry)}
									title={t("unarchive")}
								>
									<span className="icon-[mdi--archive-arrow-up-outline] h-3.5 w-3.5" />
									{t("unarchive")}
								</Button>
								<Button
									variant="ghost"
									size="icon-xs"
									onClick={() => handleDelete(entry)}
									title={t("deleteProject")}
									className="text-muted-foreground hover:text-red-400"
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

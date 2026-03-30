import { useState, useCallback } from "react";
import { useAtom, useSetAtom } from "jotai";
import {
	batchProjectsAtom,
	batchProjectDialogOpenAtom,
	confirmDialogAtom,
	type BatchProject,
} from "@shared/store/atoms";
import { Button } from "@shared/components/ui/button";
import {
	Dialog,
	DialogContent,
} from "@shared/components/ui/dialog";
import { Textarea } from "@shared/components/ui/textarea";
import { Input } from "@shared/components/ui/input";

interface BatchProjectDialogProps {
	open: boolean;
	project?: BatchProject;
	onClose: () => void;
}

export function BatchProjectDialog({ open, project, onClose }: BatchProjectDialogProps): JSX.Element {
	const [projects, setProjects] = useAtom(batchProjectsAtom);
	const setConfirm = useSetAtom(confirmDialogAtom);

	const [name, setName] = useState(project?.name ?? "");
	const [prompt, setPrompt] = useState(project?.prompt ?? "");
	const [folders, setFolders] = useState<string[]>([]);
	const [folderInput, setFolderInput] = useState("");

	const canSubmit = name.trim() && prompt.trim() && folders.length > 0;

	const handleAddFolder = useCallback(() => {
		const trimmed = folderInput.trim();
		if (trimmed && !folders.includes(trimmed)) {
			setFolders((prev) => [...prev, trimmed]);
			setFolderInput("");
		}
	}, [folderInput, folders]);

	const handleRemoveFolder = useCallback((folder: string) => {
		setFolders((prev) => prev.filter((f) => f !== folder));
	}, []);

	const handleSubmit = () => {
		if (!canSubmit) return;

		const now = Date.now();
		const tasks = folders.map((cwd, index) => ({
			id: `${project?.id ?? now}-task-${index}`,
			name: cwd.split("/").pop() ?? cwd,
			prompt: prompt,
			cwd,
			status: "pending" as const,
			createdAt: now,
			updatedAt: now,
		}));

		if (project) {
			setProjects((prev) =>
				prev.map((p) =>
					p.id === project.id
						? { ...p, name, prompt, tasks, updatedAt: now }
						: p,
				),
			);
		} else {
			const newProject: BatchProject = {
				id: `batch-project-${now}`,
				name,
				prompt,
				tasks,
				createdAt: now,
				updatedAt: now,
			};
			setProjects((prev) => [...prev, newProject]);
		}
		onClose();
	};

	const handleDeleteProject = () => {
		if (!project) return;
		setConfirm({
			title: `确认删除项目「${project.name}」`,
			message: "删除后无法撤回，请确认是否继续。",
			confirmLabel: "删除",
			cancelLabel: "取消",
			variant: "danger",
			onConfirm: () => {
				setProjects((prev) => prev.filter((p) => p.id !== project.id));
				onClose();
			},
		});
	};

	return (
		<Dialog open={open} onOpenChange={(v) => !v && onClose()}>
			<DialogContent className="flex max-h-[80vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
				<div className="px-6 pt-5 pb-2">
					<Input
						value={name}
						onChange={(e) => setName(e.target.value)}
						className="w-full border-none bg-transparent text-lg font-semibold text-foreground placeholder:text-muted-foreground/50 focus:outline-none! focus-visible:outline-none!"
						placeholder={project ? "项目名称" : "新建批量项目"}
						autoFocus
					/>
				</div>

				<div className="flex-1 overflow-y-auto px-6 pb-4">
					<Textarea
						value={prompt}
						onChange={(e) => setPrompt(e.target.value)}
						className="min-h-[120px] w-full resize-y border-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
						placeholder="输入提示词..."
						rows={5}
					/>

					<div className="mt-4">
						<p className="mb-2 text-sm font-medium text-foreground">文件夹列表</p>
						<div className="mb-2 flex gap-2">
							<Input
								value={folderInput}
								onChange={(e) => setFolderInput(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										handleAddFolder();
									}
								}}
								placeholder="输入文件夹路径，按回车添加"
								className="flex-1"
							/>
							<Button variant="outline" size="sm" onClick={handleAddFolder}>
								添加
							</Button>
						</div>
						{folders.length > 0 ? (
							<div className="max-h-40 overflow-y-auto rounded-lg border border-border p-2">
								{folders.map((folder) => (
									<div
										key={folder}
										className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-accent/50"
									>
										<span className="truncate text-sm text-foreground">{folder}</span>
										<button
											type="button"
											onClick={() => handleRemoveFolder(folder)}
											className="ml-2 shrink-0 text-muted-foreground/50 hover:text-destructive"
										>
											<span className="icon-[mdi--close] text-[14px]" />
										</button>
									</div>
								))}
							</div>
						) : (
							<p className="text-xs text-muted-foreground/50">暂无文件夹</p>
						)}
					</div>
				</div>

				<div className="flex items-center gap-2 border-t border-border px-5 py-3">
					<div className="flex-1" />
					{project && (
						<Button
							variant="destructive"
							onClick={handleDeleteProject}
							className="mr-auto"
						>
							删除
						</Button>
					)}
					<Button variant="ghost" onClick={onClose}>
						取消
					</Button>
					<Button onClick={handleSubmit} disabled={!canSubmit}>
						{project ? "保存" : "创建"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}

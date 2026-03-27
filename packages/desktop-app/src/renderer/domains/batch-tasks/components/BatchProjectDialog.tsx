import { useState, useCallback, useEffect } from "react";
import { useSetAtom } from "jotai";
import {
	batchProjectDialogOpenAtom,
	confirmDialogAtom,
	type BatchProject,
} from "@shared/store/atoms";
import { Button } from "@shared/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@shared/components/ui/dialog";
import { Textarea } from "@shared/components/ui/textarea";
import { Input } from "@shared/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/components/ui/select";
import { useBatchTasks } from "../hooks/useBatchTasks";

interface BatchProjectDialogProps {
	open: boolean;
	project?: BatchProject;
	onClose: () => void;
}

export function BatchProjectDialog({ open, project, onClose }: BatchProjectDialogProps): JSX.Element {
	const { createProject, updateProject } = useBatchTasks();

	const [name, setName] = useState(project?.name ?? "");
	const [prompt, setPrompt] = useState(project?.prompt ?? "");
	const [concurrency, setConcurrency] = useState(project?.concurrency ?? 1);
	const [folders, setFolders] = useState<string[]>(project?.tasks.map((t) => t.cwd) ?? []);
	const [folderInput, setFolderInput] = useState("");

	useEffect(() => {
		setName(project?.name ?? "");
		setPrompt(project?.prompt ?? "");
		setConcurrency(project?.concurrency ?? 1);
		setFolders(project?.tasks.map((t) => t.cwd) ?? []);
	}, [project]);

	const canSubmit = name.trim() && prompt.trim() && folders.length > 0;

	const handleSelectFolders = useCallback(async () => {
		const selected = await window.vetta.dialog.selectFolders();
		if (selected.length > 0) {
			setFolders((prev) => [...new Set([...prev, ...selected])]);
		}
	}, []);

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

	const handleSubmit = async () => {
		if (!canSubmit) return;

		if (project) {
			await updateProject(project.id, { name, prompt, concurrency });
		} else {
			await createProject({ name, prompt, folders, concurrency });
		}
		onClose();
	};

	return (
		<Dialog open={open} onOpenChange={(v) => !v && onClose()}>
			<DialogContent className="flex max-h-[80vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
				<DialogHeader className="px-6 pt-5 pb-2">
					<DialogTitle className="pb-2">{project ? "编辑项目" : "新建批量项目"}</DialogTitle>
					<Input
						value={name}
						onChange={(e) => setName(e.target.value)}
						className="h-8 w-full border-none bg-transparent text-lg font-semibold text-foreground placeholder:text-muted-foreground/50 focus:outline-none! focus-visible:outline-none!"
						placeholder="项目名称"
						autoFocus
					/>
				</DialogHeader>

				<div className="flex-1 overflow-y-auto px-6 pb-4">
					<Textarea
						value={prompt}
						onChange={(e) => setPrompt(e.target.value)}
						className="min-h-[120px] w-full resize-y border-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
						placeholder="输入提示词..."
						rows={5}
					/>

					<div className="mt-4">
						<label className="mb-2 flex items-center justify-between text-sm font-medium text-foreground">
							<span>并发数</span>
						</label>
						<Select
							value={String(concurrency)}
							onValueChange={(v) => setConcurrency(Number(v))}
						>
							<SelectTrigger className="w-24">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="1">1</SelectItem>
								<SelectItem value="2">2</SelectItem>
								<SelectItem value="3">3</SelectItem>
								<SelectItem value="4">4</SelectItem>
								<SelectItem value="5">5</SelectItem>
							</SelectContent>
						</Select>
					</div>

					<div className="mt-4">
						<div className="mb-2 flex items-center justify-between">
							<p className="text-sm font-medium text-foreground">文件夹列表</p>
							<Button variant="outline" size="sm" onClick={handleSelectFolders}>
								选择文件夹
							</Button>
						</div>
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

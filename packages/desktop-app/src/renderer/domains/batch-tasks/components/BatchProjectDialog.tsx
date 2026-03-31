import { useState, useCallback, useEffect } from "react";
import type { ModelsConfigData } from "@preload/api";
import { type BatchProject } from "@shared/store/atoms";
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
	const [modelKey, setModelKey] = useState<string | undefined>(project?.modelKey);
	const [modelOptions, setModelOptions] = useState<Array<{ key: string; label: string }>>([]);
	const [concurrency, setConcurrency] = useState(project?.concurrency ?? 1);
	const [folders, setFolders] = useState<string[]>(project?.tasks.map((t) => t.cwd) ?? []);

	const flattenModels = (config: ModelsConfigData): Array<{ key: string; label: string }> => {
		const options: Array<{ key: string; label: string }> = [];
		for (const [provider, providerConfig] of Object.entries(config.providers)) {
			for (const model of providerConfig.models ?? []) {
				options.push({
					key: `${provider}/${model.id}`,
					label: `${provider} / ${model.name || model.id}`,
				});
			}
		}
		return options;
	};

	useEffect(() => {
		setName(project?.name ?? "");
		setPrompt(project?.prompt ?? "");
		setModelKey(project?.modelKey);
		setConcurrency(project?.concurrency ?? 1);
		setFolders(project?.tasks.map((t) => t.cwd) ?? []);
	}, [project]);

	useEffect(() => {
		if (!open) return;
		void window.vetta.models.get().then((config) => {
			const options = flattenModels(config);
			setModelOptions(options);
			const currentSelected = localStorage.getItem("vetta-selected-model") ?? undefined;
			const fallback = project?.modelKey ?? currentSelected ?? config.defaultModel;
			if (fallback && options.some((option) => option.key === fallback)) {
				setModelKey(fallback);
			} else if (options.length > 0) {
				setModelKey(options[0].key);
			} else {
				setModelKey(undefined);
			}
		});
	}, [open, project?.modelKey]);

	const canSubmit = name.trim() && prompt.trim() && folders.length > 0;

	const handleSelectFolders = useCallback(() => {
		void (async () => {
			const selected = await window.vetta.dialog.selectFolders();
			console.log(selected);
			
			if (selected.length > 0) {
				setFolders((prev) => [...new Set([...prev, ...selected])]);
			}
		})();
	}, []);

	const handleRemoveFolder = useCallback((folder: string) => {
		setFolders((prev) => prev.filter((f) => f !== folder));
	}, []);

	const handleSubmit = async () => {
		if (!canSubmit) return;

		if (project) {
			const originalCwds = new Set(project.tasks.map((t) => t.cwd));
			const newFolders = folders.filter((f) => !originalCwds.has(f));
			await updateProject(project.id, { name, prompt, modelKey, concurrency, newFolders });
		} else {
			await createProject({ name, prompt, modelKey, folders, concurrency });
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
							<span>模型</span>
						</label>
						<Select
							value={modelKey}
							onValueChange={(v) => setModelKey(v)}
							disabled={modelOptions.length === 0}
						>
							<SelectTrigger className="w-full">
								<SelectValue placeholder={modelOptions.length === 0 ? "暂无可用模型" : "选择模型"} />
							</SelectTrigger>
							<SelectContent>
								{modelOptions.map((option) => (
									<SelectItem key={option.key} value={option.key}>
										{option.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

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

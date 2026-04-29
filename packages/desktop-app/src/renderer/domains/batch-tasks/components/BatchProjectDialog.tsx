import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useAtomValue } from "jotai";
import type { ModelsConfigData } from "@preload/api";
import { type BatchProject, type ExecutionModeOverride, remoteProvidersAtom, type SessionExecutionMode } from "@shared/store/atoms";
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

interface ModelOption {
	provider: string;
	modelId: string;
	displayName: string;
	key: string;
	remote?: boolean;
	tags?: string[];
	supportsImage?: boolean;
}

function flattenModels(config: ModelsConfigData, remote?: boolean): ModelOption[] {
	const result: ModelOption[] = [];
	for (const [provider, providerConfig] of Object.entries(config.providers)) {
		for (const model of providerConfig.models ?? []) {
			const raw = model as Record<string, unknown>;
			result.push({
				provider,
				modelId: model.id,
				displayName: model.name || model.id,
				key: `${provider}/${model.id}`,
				remote,
				tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : undefined,
				supportsImage: model.input?.includes("image") ?? false,
			});
		}
	}
	return result;
}

interface BatchProjectDialogProps {
	open: boolean;
	project?: BatchProject;
	onClose: () => void;
}

export function BatchProjectDialog({ open, project, onClose }: BatchProjectDialogProps): JSX.Element {
	const { createProject, updateProject } = useBatchTasks();
	const remoteProviders = useAtomValue(remoteProvidersAtom);

	const [name, setName] = useState(project?.name ?? "");
	const [prompt, setPrompt] = useState(project?.prompt ?? "");
	const [modelKey, setModelKey] = useState<string | undefined>(project?.modelKey);
	const [executionMode, setExecutionMode] = useState<ExecutionModeOverride>(project?.executionMode ?? "full-access");
	const [defaultExecutionMode, setDefaultExecutionMode] = useState<SessionExecutionMode>("full-access");
	const [sandboxUnavailableReason, setSandboxUnavailableReason] = useState<string | null>(null);
	const [config, setConfig] = useState<ModelsConfigData | null>(null);
	const [concurrency, setConcurrency] = useState(project?.concurrency ?? 1);
	const [folders, setFolders] = useState<string[]>(project?.tasks.map((t) => t.sourcePath) ?? []);
	const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
	const modelDropdownRef = useRef<HTMLDivElement>(null);

	const models = useMemo(() => {
		const localModels = config ? flattenModels(config) : [];
		const remoteModels = Object.keys(remoteProviders).length > 0
			? flattenModels({ providers: remoteProviders as ModelsConfigData["providers"] }, true)
			: [];
		const localKeys = new Set(localModels.map((m) => m.key));
		return [...localModels, ...remoteModels.filter((m) => !localKeys.has(m.key))];
	}, [config, remoteProviders]);

	const grouped = useMemo(() => {
		const map = new Map<string, ModelOption[]>();
		for (const m of models) {
			const list = map.get(m.provider) ?? [];
			list.push(m);
			map.set(m.provider, list);
		}
		return map;
	}, [models]);

	const selectedOption = models.find((m) => m.key === modelKey);

	useEffect(() => {
		setName(project?.name ?? "");
		setPrompt(project?.prompt ?? "");
		setModelKey(project?.modelKey);
		setExecutionMode(project?.executionMode ?? "full-access");
		setConcurrency(project?.concurrency ?? 1);
		setFolders(project?.tasks.map((t) => t.sourcePath) ?? []);
	}, [project]);

	useEffect(() => {
		if (!open) return;
		void window.vetta.config.get().then((desktopConfig) => {
			setDefaultExecutionMode(desktopConfig.defaultExecutionMode ?? "full-access");
			const capability = desktopConfig.sandbox ?? desktopConfig.linuxSandbox;
			if (capability?.status === "unavailable") {
				const reason = capability.reason ?? "unknown_error";
				const platform = "platform" in capability ? capability.platform : "linux";
				setSandboxUnavailableReason(`${platform} 沙盒不可用：${reason}`);
				return;
			}
			setSandboxUnavailableReason(null);
		});
		void window.vetta.models.get().then((c) => {
			setConfig(c);
			const allModels = (() => {
				const local = flattenModels(c);
				const remote = Object.keys(remoteProviders).length > 0
					? flattenModels({ providers: remoteProviders as ModelsConfigData["providers"] }, true)
					: [];
				const localKeys = new Set(local.map((m) => m.key));
				return [...local, ...remote.filter((m) => !localKeys.has(m.key))];
			})();
			const currentSelected = localStorage.getItem("vetta-selected-model") ?? undefined;
			const fallback = project?.modelKey ?? currentSelected ?? c.defaultModel;
			if (fallback && allModels.some((option) => option.key === fallback)) {
				setModelKey(fallback);
			} else if (allModels.length > 0) {
				setModelKey(allModels[0].key);
			} else {
				setModelKey(undefined);
			}
		});
	}, [open, project?.modelKey]);

	// Close model dropdown on outside click
	useEffect(() => {
		if (!modelDropdownOpen) return;
		function handleClick(e: MouseEvent) {
			if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
				setModelDropdownOpen(false);
			}
		}
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, [modelDropdownOpen]);

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
			const originalSources = new Set(project.tasks.map((t) => t.sourcePath));
			const newFolders = folders.filter((f) => !originalSources.has(f));
			await updateProject(project.id, { name, prompt, modelKey, executionMode, concurrency, newFolders });
		} else {
			await createProject({ name, prompt, modelKey, executionMode, folders, concurrency });
		}
		onClose();
	};

	const handleSelectModel = useCallback((key: string) => {
		setModelKey(key);
		setModelDropdownOpen(false);
	}, []);

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
						<div ref={modelDropdownRef} className="relative">
							<button
								type="button"
								onClick={() => setModelDropdownOpen((v) => !v)}
								className="flex w-full items-center gap-2 rounded-md border border-border px-3 py-2 text-left text-sm transition-colors hover:bg-accent/50"
							>
								<span className="icon-[mdi--brain] h-4 w-4 shrink-0 text-muted-foreground" />
								<span className="min-w-0 flex-1 truncate">
									{selectedOption?.displayName ?? (models.length === 0 ? "暂无可用模型" : "选择模型")}
								</span>
								{selectedOption?.remote && (
									<span className="shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-medium text-emerald-400">
										remote
									</span>
								)}
								<span className="icon-[mdi--chevron-down] h-4 w-4 shrink-0 text-muted-foreground" />
							</button>

							{modelDropdownOpen && models.length > 0 && (
								<div
									className="absolute left-0 z-50 mt-1 w-full overflow-hidden rounded-xl border border-border shadow-lg"
									style={{ background: "var(--background)" }}
								>
									<div className="max-h-[280px] overflow-y-auto py-1">
										{[...grouped.entries()].map(([provider, providerModels]) => (
											<div key={provider}>
												<div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
													{provider}
												</div>
												{providerModels.map((m) => {
													const isSelected = m.key === modelKey;
													const isDefault = m.key === config?.defaultModel;
													return (
														<button
															key={m.key}
															type="button"
															onClick={() => handleSelectModel(m.key)}
															className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors ${
																isSelected
																	? "bg-primary/10 text-primary"
																	: "text-foreground hover:bg-accent/50"
															}`}
														>
															<span className="min-w-0 flex-1 truncate">
																{m.displayName}
															</span>
															{m.supportsImage && (
																<span className="shrink-0 rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[9px] font-medium text-blue-400">
																	vision
																</span>
															)}
															{m.tags?.map((tag) => (
																<span key={tag} className="shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
																	{tag.trim()}
																</span>
															))}
															{m.remote && (
																<span className="shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-medium text-emerald-400">
																	remote
																</span>
															)}
															{isDefault && (
																<span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium text-primary">
																	默认
																</span>
															)}
															{isSelected && (
																<span className="icon-[mdi--check] h-3.5 w-3.5 shrink-0" />
															)}
														</button>
													);
												})}
											</div>
										))}
									</div>
								</div>
							)}
						</div>
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
						<label className="mb-2 flex items-center justify-between text-sm font-medium text-foreground">
							<span>沙盒状态</span>
						</label>
						<Select value={executionMode} onValueChange={(value) => setExecutionMode(value as ExecutionModeOverride)}>
							<SelectTrigger className="w-48">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="inherit">
									跟随全局默认（{defaultExecutionMode === "sandbox" ? "使用沙盒" : "完全访问"}）
								</SelectItem>
								<SelectItem value="full-access">完全访问</SelectItem>
								<SelectItem value="sandbox" disabled={Boolean(sandboxUnavailableReason)} title={sandboxUnavailableReason ?? undefined}>
									使用沙盒
								</SelectItem>
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

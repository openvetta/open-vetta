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
import { Switch } from "@shared/components/ui/switch";
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
	const [timeoutMinutes, setTimeoutMinutes] = useState<number>(project?.timeoutMinutes ?? 60);
	const [folders, setFolders] = useState<string[]>(project?.tasks.map((t) => t.sourcePath) ?? []);
	const [folderText, setFolderText] = useState((project?.tasks.map((t) => t.sourcePath) ?? []).join("\n"));
	const [folderInputMode, setFolderInputMode] = useState<"picker" | "textarea">("picker");
	const [artifactPatternsText, setArtifactPatternsText] = useState((project?.artifactPatterns ?? []).join("\n"));
	const [notifyEnabled, setNotifyEnabled] = useState<boolean>(project?.notifyEnabled ?? false);
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
		setTimeoutMinutes(project?.timeoutMinutes ?? 60);
		setFolders(project?.tasks.map((t) => t.sourcePath) ?? []);
		setFolderText((project?.tasks.map((t) => t.sourcePath) ?? []).join("\n"));
		setArtifactPatternsText((project?.artifactPatterns ?? []).join("\n"));
		setNotifyEnabled(project?.notifyEnabled ?? false);
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
			if (selected.length > 0) {
				setFolders((prev) => {
					const next = [...new Set([...prev, ...selected])];
					setFolderText(next.join("\n"));
					return next;
				});
			}
		})();
	}, []);

	const handleFolderTextChange = useCallback((value: string) => {
		setFolderText(value);
		setFolders(
			[...new Set(value.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0))],
		);
	}, []);

	const handleRemoveFolder = useCallback((folder: string) => {
		setFolders((prev) => {
			const next = prev.filter((f) => f !== folder);
			setFolderText(next.join("\n"));
			return next;
		});
	}, []);

	const handleSubmit = async () => {
		if (!canSubmit) return;

		const artifactPatterns = artifactPatternsText
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter((line) => line.length > 0);

		const safeTimeoutMinutes = Number.isFinite(timeoutMinutes) && timeoutMinutes > 0 ? Math.floor(timeoutMinutes) : 60;

		if (project) {
			const originalSources = new Set(project.tasks.map((t) => t.sourcePath));
			const newFolders = folders.filter((f) => !originalSources.has(f));
			await updateProject(project.id, {
				name,
				prompt,
				modelKey,
				executionMode,
				concurrency,
				artifactPatterns,
				notifyEnabled,
				timeoutMinutes: safeTimeoutMinutes,
				newFolders,
			});
		} else {
			await createProject({
				name,
				prompt,
				modelKey,
				executionMode,
				folders,
				concurrency,
				artifactPatterns,
				notifyEnabled,
				timeoutMinutes: safeTimeoutMinutes,
			});
		}
		onClose();
	};

	const handleSelectModel = useCallback((key: string) => {
		setModelKey(key);
		setModelDropdownOpen(false);
	}, []);

	return (
		<Dialog open={open} onOpenChange={(v) => !v && onClose()}>
			<DialogContent
				className="flex max-h-[82vh] flex-col gap-0 overflow-hidden rounded-xl border border-border/60 bg-card/95 p-0 backdrop-blur-md sm:max-w-xl"
				showCloseButton={false}
			>
				<DialogHeader className="flex flex-row items-center gap-3 space-y-0 px-7 pt-6 pb-3">
					<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-inset ring-primary/20">
						<span className="icon-[mdi--layers-outline] h-4 w-4 text-primary" />
					</div>
					<DialogTitle className="sr-only">{project ? "编辑项目" : "新建批量项目"}</DialogTitle>
					<Input
						value={name}
						onChange={(e) => setName(e.target.value)}
						className="h-8 w-full border-none bg-transparent text-[15px] font-semibold text-foreground placeholder:text-muted-foreground/40 focus:outline-none! focus-visible:outline-none!"
						placeholder={project ? "项目名称" : "新建批量项目"}
						autoFocus
					/>
				</DialogHeader>

				<div className="flex-1 overflow-y-auto px-7 pb-4">
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
																<span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">
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

					<div className="mt-4 flex items-end gap-6">
						<div>
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
						<div>
							<label className="mb-2 flex items-center justify-between text-sm font-medium text-foreground">
								<span>超时（分钟）</span>
							</label>
							<Input
								type="number"
								min={1}
								step={1}
								value={String(timeoutMinutes)}
								onChange={(e) => {
									const v = Number(e.target.value);
									setTimeoutMinutes(Number.isFinite(v) && v > 0 ? Math.floor(v) : 60);
								}}
								className="h-9 w-28"
							/>
						</div>
					</div>
					<p className="mt-2 text-xs text-muted-foreground/60">
						子任务单次运行的硬超时。暂停后恢复会重新计时。
					</p>

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

					<div className="mt-4 flex items-start justify-between gap-4 rounded-md border border-border bg-muted/30 px-3 py-2.5">
						<div className="min-w-0">
							<div className="text-sm font-medium text-foreground">启用消息推送</div>
							<div className="mt-0.5 text-xs text-muted-foreground/80">
								每个子任务完成后向已配置的 Webhook 推送一次，并在项目全部完成时推送汇总（可在 设置 → 消息推送 管理 Webhook）。
							</div>
						</div>
						<Switch checked={notifyEnabled} onCheckedChange={setNotifyEnabled} />
					</div>

					<div className="mt-4">
						<label className="mb-2 flex items-center justify-between text-sm font-medium text-foreground">
							<span>产物校验</span>
							<span className="text-xs font-normal text-muted-foreground/60">可选</span>
						</label>
						<Textarea
							value={artifactPatternsText}
							onChange={(e) => setArtifactPatternsText(e.target.value)}
							className="min-h-[72px] text-sm"
							placeholder="每行一个文件名或通配符；为空则跳过校验"
						/>
						<p className="mt-2 text-xs text-muted-foreground/60">
							子任务目录顶层必须全部匹配才算成功。支持 glob：* 匹配任意字符、? 匹配单个字符。
						</p>
					</div>

					<div className="mt-4">
						<div className="mb-2 flex items-center justify-between gap-3">
							<p className="text-sm font-medium text-foreground">文件夹列表</p>
							<div className="inline-flex rounded-lg border border-border p-0.5">
								<button
									type="button"
									onClick={() => setFolderInputMode("picker")}
									className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
										folderInputMode === "picker"
											? "bg-accent text-foreground"
											: "text-muted-foreground hover:text-foreground"
									}`}
								>
									选择添加
								</button>
								<button
									type="button"
									onClick={() => setFolderInputMode("textarea")}
									className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
										folderInputMode === "textarea"
											? "bg-accent text-foreground"
											: "text-muted-foreground hover:text-foreground"
									}`}
								>
									文本添加
								</button>
							</div>
						</div>
						{folderInputMode === "picker" ? (
							<Button variant="outline" size="sm" onClick={handleSelectFolders}>
								选择文件夹
							</Button>
						) : (
							<>
								<Textarea
									value={folderText}
									onChange={(e) => handleFolderTextChange(e.target.value)}
									className="min-h-[96px] text-sm"
									placeholder={"/path/to/project-a\n/path/to/project-b"}
								/>
								<p className="mt-2 text-xs text-muted-foreground/60">
									Linux 目录多选不稳定时，可直接粘贴路径，每行一个文件夹。
								</p>
							</>
						)}
						{folders.length > 0 ? (
							<div className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-border p-2">
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
							<p className="mt-3 text-xs text-muted-foreground/50">暂无文件夹</p>
						)}
					</div>
				</div>

				<div className="flex items-center justify-end gap-2 border-t border-border/40 px-5 py-3">
					<Button
						variant="ghost"
						onClick={onClose}
						className="h-9 rounded-lg px-3 text-[13px] text-muted-foreground hover:text-foreground"
					>
						<span className="icon-[mdi--close] h-4 w-4" />
						<span>取消</span>
					</Button>
					<Button
						onClick={handleSubmit}
						disabled={!canSubmit}
						className="h-9 rounded-lg bg-primary px-4 text-[13px] text-primary-foreground hover:bg-primary/90"
					>
						<span className="icon-[mdi--check] h-4 w-4" />
						<span>{project ? "保存" : "创建"}</span>
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}

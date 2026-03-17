import { useAtom, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import type { McpConfigData, McpServerConfigData, ModelsConfigData } from "../../../preload/api.js";
import { confirmDialogAtom, settingsTabAtom, workspacePathAtom, type SettingsTab } from "../store/atoms";
import { useProjects } from "../hooks/useProjects";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { SegmentedControl } from "./ui/segmented-control";

const SETTINGS_GROUPS: { key: SettingsTab; label: string; icon: string }[] = [
	{ key: "general", label: "通用设置", icon: "icon-[mdi--cog-outline]" },
	{ key: "models", label: "模型配置", icon: "icon-[mdi--brain]" },
	{ key: "mcp", label: "MCP 服务器", icon: "icon-[mdi--server-outline]" },
	{ key: "archive", label: "已归档", icon: "icon-[mdi--archive-outline]" },
];

// ─── Shared setting row layout ───

function SettingRow({
	title,
	description,
	children,
	border = true,
}: {
	title: string;
	description?: string;
	children: React.ReactNode;
	border?: boolean;
}): JSX.Element {
	return (
		<div
			className={cn(
				"flex items-center justify-between gap-6 px-5 py-4",
				border && "border-b border-[var(--border)]",
			)}
		>
			<div className="min-w-0 flex-1">
				<div className="text-[13px] font-medium text-[var(--text-1)]">{title}</div>
				{description && (
					<div className="mt-0.5 text-[12px] text-[var(--text-2)]">{description}</div>
				)}
			</div>
			<div className="shrink-0">{children}</div>
		</div>
	);
}

function SettingSection({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}): JSX.Element {
	return (
		<div className="mb-6">
			<h2 className="mb-3 text-[15px] font-semibold text-[var(--text-1)]">{title}</h2>
			<div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
				{children}
			</div>
		</div>
	);
}

// ─── General Settings ───

function GeneralSettings(): JSX.Element {
	const [workspacePath, setWorkspacePath] = useAtom(workspacePathAtom);

	const handleSelectWorkspace = useCallback(async () => {
		const selected = await window.vetta.dialog.selectFolder();
		if (selected) {
			setWorkspacePath(selected);
			localStorage.setItem("vetta-workspace-path", selected);
			await window.vetta.config.set({ workspacePath: selected });
		}
	}, [setWorkspacePath]);

	const handleResetWorkspace = useCallback(async () => {
		const defaultPath = "~/.vetta/workspace";
		setWorkspacePath(defaultPath);
		localStorage.setItem("vetta-workspace-path", defaultPath);
		await window.vetta.config.set({ workspacePath: defaultPath });
	}, [setWorkspacePath]);

	return (
		<div className="mx-auto w-full max-w-[680px] px-8 py-4">
			<h1 className="mb-6 text-[20px] font-bold text-[var(--text-1)]">常规</h1>

			<SettingSection title="工作区">
				<SettingRow
					title="工作目录"
					description="新建项目时将在此目录下创建对应的项目文件夹"
					border={false}
				>
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={() => void handleSelectWorkspace()}
							className="flex items-center gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-raised)] px-3 py-1.5 text-[12px] text-[var(--text-1)] transition-colors hover:bg-[var(--surface-overlay)]"
						>
							<span className="icon-[mdi--folder-outline] h-3.5 w-3.5 shrink-0 text-[var(--text-2)]" />
							<span className="max-w-[180px] truncate">{workspacePath}</span>
							<span className="icon-[mdi--chevron-down] h-3.5 w-3.5 shrink-0 text-[var(--text-2)]" />
						</button>
						<button
							type="button"
							onClick={() => void handleResetWorkspace()}
							className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-2)] transition-colors hover:bg-[var(--hover-strong)] hover:text-[var(--text-1)]"
							title="恢复默认"
						>
							<span className="icon-[mdi--restore] h-3.5 w-3.5" />
						</button>
					</div>
				</SettingRow>
			</SettingSection>
		</div>
	);
}

// ─── Models Settings ───

const API_OPTIONS = [
	{ value: "anthropic", label: "Anthropic" },
	{ value: "openai", label: "OpenAI" },
	{ value: "openai-completions", label: "OpenAI Completions" },
	{ value: "openai-responses", label: "OpenAI Responses" },
];

interface ProviderFormState {
	name: string;
	baseUrl: string;
	apiKey: string;
	api: string;
}

interface ModelFormState {
	id: string;
	name: string;
	api: string;
}

const emptyProvider: ProviderFormState = { name: "", baseUrl: "", apiKey: "", api: "openai-completions" };
const emptyModel: ModelFormState = { id: "", name: "", api: "" };

function SelectField({
	value,
	onChange,
	options,
}: {
	value: string;
	onChange: (v: string) => void;
	options: { value: string; label: string }[];
}): JSX.Element {
	return (
		<div className="relative">
			<select
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className="h-8 w-full appearance-none rounded-lg border border-[var(--border-strong)] bg-[var(--surface-raised)] pl-3 pr-8 text-[12px] text-[var(--text-1)] outline-none transition-colors hover:bg-[var(--surface-overlay)] focus:border-[var(--accent)]"
			>
				{options.map((o) => (
					<option key={o.value} value={o.value}>
						{o.label}
					</option>
				))}
			</select>
			<span className="icon-[mdi--chevron-down] pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-2)]" />
		</div>
	);
}

function InputField({
	value,
	onChange,
	placeholder,
	type = "text",
}: {
	value: string;
	onChange: (v: string) => void;
	placeholder?: string;
	type?: string;
}): JSX.Element {
	return (
		<input
			type={type}
			value={value}
			onChange={(e) => onChange(e.target.value)}
			placeholder={placeholder}
			className="h-8 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-raised)] px-3 text-[12px] text-[var(--text-1)] placeholder:text-[var(--text-2)]/40 outline-none transition-colors hover:bg-[var(--surface-overlay)] focus:border-[var(--accent)]"
		/>
	);
}

function ModelsSettings(): JSX.Element {
	const [config, setConfig] = useState<ModelsConfigData | null>(null);
	const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
	const [addingProvider, setAddingProvider] = useState(false);
	const [providerForm, setProviderForm] = useState<ProviderFormState>({ ...emptyProvider });
	const [editingProvider, setEditingProvider] = useState<string | null>(null);
	const [addingModelFor, setAddingModelFor] = useState<string | null>(null);
	const [modelForm, setModelForm] = useState<ModelFormState>({ ...emptyModel });
	const [saving, setSaving] = useState(false);

	// Load config on mount
	useEffect(() => {
		void window.vetta.models.get().then(setConfig);
	}, []);

	const saveConfig = useCallback(
		async (newConfig: ModelsConfigData) => {
			setSaving(true);
			try {
				await window.vetta.models.set(newConfig);
				setConfig(newConfig);
			} finally {
				setSaving(false);
			}
		},
		[],
	);

	// ─── Provider CRUD ───

	const handleAddProvider = useCallback(async () => {
		if (!config || !providerForm.name.trim()) return;
		const newConfig: ModelsConfigData = {
			...config,
			providers: {
				...config.providers,
				[providerForm.name.trim()]: {
					baseUrl: providerForm.baseUrl.trim() || undefined,
					apiKey: providerForm.apiKey.trim() || undefined,
					api: providerForm.api || undefined,
					models: [],
				},
			},
		};
		await saveConfig(newConfig);
		setAddingProvider(false);
		setProviderForm({ ...emptyProvider });
		setExpandedProvider(providerForm.name.trim());
	}, [config, providerForm, saveConfig]);

	const handleUpdateProvider = useCallback(
		async (oldName: string) => {
			if (!config || !providerForm.name.trim()) return;
			const newProviders = { ...config.providers };
			const existing = newProviders[oldName];
			if (!existing) return;

			// If name changed, delete old key
			if (oldName !== providerForm.name.trim()) {
				delete newProviders[oldName];
			}

			newProviders[providerForm.name.trim()] = {
				...existing,
				baseUrl: providerForm.baseUrl.trim() || undefined,
				apiKey: providerForm.apiKey.trim() || undefined,
				api: providerForm.api || undefined,
			};

			await saveConfig({ ...config, providers: newProviders });
			setEditingProvider(null);
			setProviderForm({ ...emptyProvider });
			if (oldName !== providerForm.name.trim()) {
				setExpandedProvider(providerForm.name.trim());
			}
		},
		[config, providerForm, saveConfig],
	);

	const handleDeleteProvider = useCallback(
		async (name: string) => {
			if (!config) return;
			const newProviders = { ...config.providers };
			delete newProviders[name];
			// Clear default model if it belongs to the deleted provider
			const defaultModel = config.defaultModel?.startsWith(`${name}/`) ? undefined : config.defaultModel;
			await saveConfig({ ...config, defaultModel, providers: newProviders });
			if (expandedProvider === name) setExpandedProvider(null);
		},
		[config, expandedProvider, saveConfig],
	);

	const startEditProvider = useCallback(
		(name: string) => {
			if (!config) return;
			const p = config.providers[name];
			if (!p) return;
			setProviderForm({
				name,
				baseUrl: p.baseUrl || "",
				apiKey: p.apiKey || "",
				api: p.api || "openai-completions",
			});
			setEditingProvider(name);
			setAddingProvider(false);
		},
		[config],
	);

	// ─── Model CRUD ───

	const handleAddModel = useCallback(
		async (providerName: string) => {
			if (!config || !modelForm.id.trim()) return;
			const provider = config.providers[providerName];
			if (!provider) return;
			const models = [...(provider.models || [])];
			models.push({
				id: modelForm.id.trim(),
				name: modelForm.name.trim() || undefined,
				api: modelForm.api || undefined,
			});
			const newConfig: ModelsConfigData = {
				...config,
				providers: {
					...config.providers,
					[providerName]: { ...provider, models },
				},
			};
			await saveConfig(newConfig);
			setAddingModelFor(null);
			setModelForm({ ...emptyModel });
		},
		[config, modelForm, saveConfig],
	);

	const handleDeleteModel = useCallback(
		async (providerName: string, modelId: string) => {
			if (!config) return;
			const provider = config.providers[providerName];
			if (!provider) return;
			const models = (provider.models || []).filter((m) => m.id !== modelId);
			const modelKey = `${providerName}/${modelId}`;
			const newConfig: ModelsConfigData = {
				...config,
				// Clear default if the deleted model was the default
				defaultModel: config.defaultModel === modelKey ? undefined : config.defaultModel,
				providers: {
					...config.providers,
					[providerName]: { ...provider, models },
				},
			};
			await saveConfig(newConfig);
		},
		[config, saveConfig],
	);

	const handleSetDefaultModel = useCallback(
		async (providerName: string, modelId: string) => {
			if (!config) return;
			const modelKey = `${providerName}/${modelId}`;
			const newDefault = config.defaultModel === modelKey ? undefined : modelKey;
			const newConfig: ModelsConfigData = {
				...config,
				defaultModel: newDefault,
			};
			await saveConfig(newConfig);
			// Also update localStorage selection if setting a new default
			if (newDefault) {
				localStorage.setItem("vetta-selected-model", newDefault);
			}
		},
		[config, saveConfig],
	);

	if (!config) {
		return (
			<div className="mx-auto w-full max-w-[680px] px-8 py-4">
				<h1 className="mb-6 text-[20px] font-bold text-[var(--text-1)]">模型配置</h1>
				<div className="flex items-center justify-center py-16">
					<span className="text-[13px] text-[var(--text-2)]">加载中…</span>
				</div>
			</div>
		);
	}

	const providerNames = Object.keys(config.providers);

	return (
		<div className="mx-auto w-full max-w-[680px] px-8 py-4">
			<h1 className="mb-6 text-[20px] font-bold text-[var(--text-1)]">模型配置</h1>

			{/* Provider list */}
			<SettingSection title="服务商">
				{providerNames.length === 0 && !addingProvider && (
					<div className="px-5 py-8 text-center text-[12px] text-[var(--text-2)]">
						尚未配置任何服务商，点击下方按钮添加
					</div>
				)}

				{providerNames.map((name) => {
					const provider = config.providers[name]!;
					const isExpanded = expandedProvider === name;
					const isEditing = editingProvider === name;
					const models = provider.models || [];

					return (
						<div
							key={name}
							className="border-b border-[var(--border)] last:border-b-0"
						>
							{/* Provider header */}
							<div className="flex items-center gap-3 px-5 py-3.5">
								<button
									type="button"
									onClick={() => setExpandedProvider(isExpanded ? null : name)}
									className="flex flex-1 items-center gap-3 text-left"
								>
									<span
										className={cn(
											"icon-[mdi--chevron-right] h-4 w-4 shrink-0 text-[var(--text-2)] transition-transform",
											isExpanded && "rotate-90",
										)}
									/>
									<div className="min-w-0 flex-1">
										<div className="text-[13px] font-medium text-[var(--text-1)]">{name}</div>
										<div className="mt-0.5 text-[11px] text-[var(--text-2)]">
											{provider.api || "openai-completions"} · {models.length} 个模型
											{provider.baseUrl && ` · ${provider.baseUrl}`}
										</div>
									</div>
								</button>
								<div className="flex items-center gap-1">
									<button
										type="button"
										onClick={(e) => {
											e.stopPropagation();
											startEditProvider(name);
										}}
										className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-2)] transition-colors hover:bg-[var(--hover-strong)] hover:text-[var(--text-1)]"
										title="编辑"
									>
										<span className="icon-[mdi--pencil-outline] h-3.5 w-3.5" />
									</button>
									<button
										type="button"
										onClick={(e) => {
											e.stopPropagation();
											void handleDeleteProvider(name);
										}}
										className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-2)] transition-colors hover:bg-red-500/10 hover:text-red-400"
										title="删除"
									>
										<span className="icon-[mdi--delete-outline] h-3.5 w-3.5" />
									</button>
								</div>
							</div>

							{/* Edit provider form (inline) */}
							{isEditing && (
								<div className="border-t border-[var(--border)] bg-[var(--surface-raised)]/50 px-5 py-4">
									<div className="grid grid-cols-2 gap-3">
										<div>
											<label className="mb-1 block text-[11px] text-[var(--text-2)]">服务商名称</label>
											<InputField
												value={providerForm.name}
												onChange={(v) => setProviderForm((f) => ({ ...f, name: v }))}
												placeholder="e.g. ollama"
											/>
										</div>
										<div>
											<label className="mb-1 block text-[11px] text-[var(--text-2)]">API 类型</label>
											<SelectField
												value={providerForm.api}
												onChange={(v) => setProviderForm((f) => ({ ...f, api: v }))}
												options={API_OPTIONS}
											/>
										</div>
										<div className="col-span-2">
											<label className="mb-1 block text-[11px] text-[var(--text-2)]">Base URL</label>
											<InputField
												value={providerForm.baseUrl}
												onChange={(v) => setProviderForm((f) => ({ ...f, baseUrl: v }))}
												placeholder="e.g. http://localhost:11434/v1"
											/>
										</div>
										<div className="col-span-2">
											<label className="mb-1 block text-[11px] text-[var(--text-2)]">API Key</label>
											<InputField
												value={providerForm.apiKey}
												onChange={(v) => setProviderForm((f) => ({ ...f, apiKey: v }))}
												placeholder="sk-... 或 env:MY_API_KEY 或 cmd:xxx"
												type="password"
											/>
										</div>
									</div>
									<div className="mt-3 flex justify-end gap-2">
										<Button
											variant="ghost"
											size="sm"
											onClick={() => {
												setEditingProvider(null);
												setProviderForm({ ...emptyProvider });
											}}
										>
											取消
										</Button>
										<Button
											variant="primary"
											size="sm"
											onClick={() => void handleUpdateProvider(name)}
											disabled={!providerForm.name.trim() || saving}
										>
											保存
										</Button>
									</div>
								</div>
							)}

							{/* Expanded: models list */}
							{isExpanded && !isEditing && (
								<div className="border-t border-[var(--border)] bg-[var(--surface-raised)]/30">
									{models.length === 0 && addingModelFor !== name && (
										<div className="px-5 py-6 text-center text-[12px] text-[var(--text-2)]">
											暂无自定义模型
										</div>
									)}

									{models.map((model) => {
									const modelKey = `${name}/${model.id}`;
									const isDefault = config.defaultModel === modelKey;
									return (
										<div
											key={model.id}
											className="flex items-center justify-between border-b border-[var(--border)]/50 px-5 py-2.5 last:border-b-0"
										>
											<div className="min-w-0 flex-1">
												<div className="flex items-center gap-2 text-[12px] font-medium text-[var(--text-1)]">
													{model.name || model.id}
													{isDefault && (
														<span className="rounded-full bg-[var(--accent)]/15 px-1.5 py-0.5 text-[9px] font-medium text-[var(--accent)]">
															默认
														</span>
													)}
												</div>
												<div className="mt-0.5 text-[11px] text-[var(--text-2)]">
													{model.id}
													{model.api && ` · ${model.api}`}
												</div>
											</div>
											<div className="flex items-center gap-0.5">
												<button
													type="button"
													onClick={() => void handleSetDefaultModel(name, model.id)}
													className={cn(
														"flex h-6 w-6 items-center justify-center rounded-md transition-colors",
														isDefault
															? "text-[var(--accent)]"
															: "text-[var(--text-2)] hover:bg-[var(--hover-strong)] hover:text-[var(--accent)]",
													)}
													title={isDefault ? "取消默认" : "设为默认模型"}
												>
													<span className={`${isDefault ? "icon-[mdi--star]" : "icon-[mdi--star-outline]"} h-3.5 w-3.5`} />
												</button>
												<button
													type="button"
													onClick={() => void handleDeleteModel(name, model.id)}
													className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-2)] transition-colors hover:bg-red-500/10 hover:text-red-400"
													title="删除模型"
												>
													<span className="icon-[mdi--close] h-3 w-3" />
												</button>
											</div>
										</div>
									);
								})}

									{/* Add model form */}
									{addingModelFor === name ? (
										<div className="border-t border-[var(--border)]/50 px-5 py-3">
											<div className="grid grid-cols-3 gap-2">
												<div>
													<label className="mb-1 block text-[11px] text-[var(--text-2)]">模型 ID</label>
													<InputField
														value={modelForm.id}
														onChange={(v) => setModelForm((f) => ({ ...f, id: v }))}
														placeholder="e.g. llama3"
													/>
												</div>
												<div>
													<label className="mb-1 block text-[11px] text-[var(--text-2)]">显示名称</label>
													<InputField
														value={modelForm.name}
														onChange={(v) => setModelForm((f) => ({ ...f, name: v }))}
														placeholder="可选"
													/>
												</div>
												<div>
													<label className="mb-1 block text-[11px] text-[var(--text-2)]">API 类型</label>
													<InputField
														value={modelForm.api}
														onChange={(v) => setModelForm((f) => ({ ...f, api: v }))}
														placeholder="继承服务商"
													/>
												</div>
											</div>
											<div className="mt-2 flex justify-end gap-2">
												<Button
													variant="ghost"
													size="sm"
													onClick={() => {
														setAddingModelFor(null);
														setModelForm({ ...emptyModel });
													}}
												>
													取消
												</Button>
												<Button
													variant="primary"
													size="sm"
													onClick={() => void handleAddModel(name)}
													disabled={!modelForm.id.trim() || saving}
												>
													添加
												</Button>
											</div>
										</div>
									) : (
										<div className="border-t border-[var(--border)]/50 px-5 py-2">
											<button
												type="button"
												onClick={() => {
													setAddingModelFor(name);
													setModelForm({ ...emptyModel });
												}}
												className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/10"
											>
												<span className="icon-[mdi--plus] h-3.5 w-3.5" />
												添加模型
											</button>
										</div>
									)}
								</div>
							)}
						</div>
					);
				})}

				{/* Add provider form */}
				{addingProvider && (
					<div className="border-t border-[var(--border)] px-5 py-4">
						<div className="grid grid-cols-2 gap-3">
							<div>
								<label className="mb-1 block text-[11px] text-[var(--text-2)]">服务商名称</label>
								<InputField
									value={providerForm.name}
									onChange={(v) => setProviderForm((f) => ({ ...f, name: v }))}
									placeholder="e.g. ollama, lm-studio"
								/>
							</div>
							<div>
								<label className="mb-1 block text-[11px] text-[var(--text-2)]">API 类型</label>
								<SelectField
									value={providerForm.api}
									onChange={(v) => setProviderForm((f) => ({ ...f, api: v }))}
									options={API_OPTIONS}
								/>
							</div>
							<div className="col-span-2">
								<label className="mb-1 block text-[11px] text-[var(--text-2)]">Base URL</label>
								<InputField
									value={providerForm.baseUrl}
									onChange={(v) => setProviderForm((f) => ({ ...f, baseUrl: v }))}
									placeholder="e.g. http://localhost:11434/v1"
								/>
							</div>
							<div className="col-span-2">
								<label className="mb-1 block text-[11px] text-[var(--text-2)]">API Key</label>
								<InputField
									value={providerForm.apiKey}
									onChange={(v) => setProviderForm((f) => ({ ...f, apiKey: v }))}
									placeholder="sk-... 或 env:MY_API_KEY 或 cmd:xxx"
									type="password"
								/>
							</div>
						</div>
						<div className="mt-3 flex justify-end gap-2">
							<Button
								variant="ghost"
								size="sm"
								onClick={() => {
									setAddingProvider(false);
									setProviderForm({ ...emptyProvider });
								}}
							>
								取消
							</Button>
							<Button
								variant="primary"
								size="sm"
								onClick={() => void handleAddProvider()}
								disabled={!providerForm.name.trim() || saving}
							>
								添加
							</Button>
						</div>
					</div>
				)}
			</SettingSection>

			{/* Add provider button */}
			{!addingProvider && (
				<button
					type="button"
					onClick={() => {
						setAddingProvider(true);
						setEditingProvider(null);
						setProviderForm({ ...emptyProvider });
					}}
					className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] py-3 text-[13px] text-[var(--text-2)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
				>
					<span className="icon-[mdi--plus] h-4 w-4" />
					添加服务商
				</button>
			)}

			{/* Config file path hint */}
			<div className="mt-6 text-center text-[11px] text-[var(--text-2)]/60">
				配置文件路径: ~/.vetta/agent/models.json
			</div>
		</div>
	);
}

// ─── MCP Settings ───

type McpEditMode = "visual" | "json";

interface McpServerFormState {
	name: string;
	command: string;
	args: string;
	env: string;
	cwd: string;
	disabled: boolean;
	autoApprove: string;
	startupTimeout: string;
	debug: boolean;
}

const emptyMcpServer: McpServerFormState = {
	name: "",
	command: "",
	args: "",
	env: "",
	cwd: "",
	disabled: false,
	autoApprove: "",
	startupTimeout: "",
	debug: false,
};

function serverToForm(name: string, s: McpServerConfigData): McpServerFormState {
	return {
		name,
		command: s.command,
		args: s.args?.join(", ") ?? "",
		env: s.env ? Object.entries(s.env).map(([k, v]) => `${k}=${v}`).join("\n") : "",
		cwd: s.cwd ?? "",
		disabled: s.disabled ?? false,
		autoApprove: s.autoApprove?.join(", ") ?? "",
		startupTimeout: s.startupTimeout != null ? String(s.startupTimeout) : "",
		debug: s.debug ?? false,
	};
}

function formToServer(form: McpServerFormState): McpServerConfigData {
	const args = form.args.trim()
		? form.args.split(",").map((s) => s.trim()).filter(Boolean)
		: undefined;
	const envLines = form.env.trim()
		? form.env.split("\n").map((l) => l.trim()).filter(Boolean)
		: [];
	const env = envLines.length > 0
		? Object.fromEntries(envLines.map((l) => {
			const idx = l.indexOf("=");
			return idx > 0 ? [l.slice(0, idx), l.slice(idx + 1)] : [l, ""];
		}))
		: undefined;
	const autoApprove = form.autoApprove.trim()
		? form.autoApprove.split(",").map((s) => s.trim()).filter(Boolean)
		: undefined;
	const startupTimeout = form.startupTimeout.trim()
		? Number(form.startupTimeout.trim())
		: undefined;

	const cfg: McpServerConfigData = { command: form.command.trim() };
	if (args && args.length > 0) cfg.args = args;
	if (env) cfg.env = env;
	if (form.cwd.trim()) cfg.cwd = form.cwd.trim();
	if (form.disabled) cfg.disabled = true;
	if (autoApprove && autoApprove.length > 0) cfg.autoApprove = autoApprove;
	if (startupTimeout && !isNaN(startupTimeout)) cfg.startupTimeout = startupTimeout;
	if (form.debug) cfg.debug = true;
	return cfg;
}

function TextareaField({
	value,
	onChange,
	placeholder,
	rows = 3,
}: {
	value: string;
	onChange: (v: string) => void;
	placeholder?: string;
	rows?: number;
}): JSX.Element {
	return (
		<textarea
			value={value}
			onChange={(e) => onChange(e.target.value)}
			placeholder={placeholder}
			rows={rows}
			className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-raised)] px-3 py-2 text-[12px] text-[var(--text-1)] placeholder:text-[var(--text-2)]/40 outline-none transition-colors hover:bg-[var(--surface-overlay)] focus:border-[var(--accent)] font-mono resize-none"
		/>
	);
}

function CheckboxField({
	checked,
	onChange,
	label,
}: {
	checked: boolean;
	onChange: (v: boolean) => void;
	label: string;
}): JSX.Element {
	return (
		<label className="flex items-center gap-2 cursor-pointer select-none">
			<button
				type="button"
				onClick={() => onChange(!checked)}
				className={cn(
					"flex h-4 w-4 items-center justify-center rounded border transition-colors",
					checked
						? "border-[var(--accent)] bg-[var(--accent)]"
						: "border-[var(--border-strong)] bg-[var(--surface-raised)] hover:bg-[var(--surface-overlay)]",
				)}
			>
				{checked && (
					<span className="icon-[mdi--check] h-3 w-3 text-[var(--accent-fg)]" />
				)}
			</button>
			<span className="text-[12px] text-[var(--text-1)]">{label}</span>
		</label>
	);
}

function McpSettings(): JSX.Element {
	const [config, setConfig] = useState<McpConfigData | null>(null);
	const [mode, setMode] = useState<McpEditMode>("visual");
	const [saving, setSaving] = useState(false);

	// Visual mode state
	const [expandedServer, setExpandedServer] = useState<string | null>(null);
	const [addingServer, setAddingServer] = useState(false);
	const [editingServer, setEditingServer] = useState<string | null>(null);
	const [serverForm, setServerForm] = useState<McpServerFormState>({ ...emptyMcpServer });

	// JSON mode state
	const [jsonText, setJsonText] = useState("");
	const [jsonError, setJsonError] = useState<string | null>(null);
	const jsonTextareaRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		void window.vetta.mcp.get().then((c) => {
			setConfig(c);
			setJsonText(JSON.stringify(c, null, 2));
		});
	}, []);

	const saveConfig = useCallback(async (newConfig: McpConfigData) => {
		setSaving(true);
		try {
			await window.vetta.mcp.set(newConfig);
			setConfig(newConfig);
			setJsonText(JSON.stringify(newConfig, null, 2));
		} finally {
			setSaving(false);
		}
	}, []);

	// ─── Visual mode CRUD ───

	const handleAddServer = useCallback(async () => {
		if (!config || !serverForm.name.trim() || !serverForm.command.trim()) return;
		const newConfig: McpConfigData = {
			...config,
			mcpServers: {
				...config.mcpServers,
				[serverForm.name.trim()]: formToServer(serverForm),
			},
		};
		await saveConfig(newConfig);
		setAddingServer(false);
		setServerForm({ ...emptyMcpServer });
		setExpandedServer(serverForm.name.trim());
	}, [config, serverForm, saveConfig]);

	const handleUpdateServer = useCallback(async (oldName: string) => {
		if (!config || !serverForm.name.trim() || !serverForm.command.trim()) return;
		const newServers = { ...config.mcpServers };
		if (oldName !== serverForm.name.trim()) {
			delete newServers[oldName];
		}
		newServers[serverForm.name.trim()] = formToServer(serverForm);
		await saveConfig({ ...config, mcpServers: newServers });
		setEditingServer(null);
		setServerForm({ ...emptyMcpServer });
		if (oldName !== serverForm.name.trim()) {
			setExpandedServer(serverForm.name.trim());
		}
	}, [config, serverForm, saveConfig]);

	const handleDeleteServer = useCallback(async (name: string) => {
		if (!config) return;
		const newServers = { ...config.mcpServers };
		delete newServers[name];
		await saveConfig({ ...config, mcpServers: newServers });
		if (expandedServer === name) setExpandedServer(null);
	}, [config, expandedServer, saveConfig]);

	const handleToggleDisabled = useCallback(async (name: string) => {
		if (!config) return;
		const server = config.mcpServers[name];
		if (!server) return;
		const newServers = {
			...config.mcpServers,
			[name]: { ...server, disabled: !server.disabled },
		};
		await saveConfig({ ...config, mcpServers: newServers });
	}, [config, saveConfig]);

	const startEditServer = useCallback((name: string) => {
		if (!config) return;
		const s = config.mcpServers[name];
		if (!s) return;
		setServerForm(serverToForm(name, s));
		setEditingServer(name);
		setAddingServer(false);
	}, [config]);

	// ─── JSON mode ───

	const handleJsonSave = useCallback(async () => {
		try {
			const parsed = JSON.parse(jsonText) as McpConfigData;
			if (!parsed.mcpServers || typeof parsed.mcpServers !== "object") {
				setJsonError("JSON 必须包含 mcpServers 对象");
				return;
			}
			// Validate each server has command
			for (const [name, srv] of Object.entries(parsed.mcpServers)) {
				if (!srv.command || typeof srv.command !== "string") {
					setJsonError(`服务器 "${name}" 缺少 command 字段`);
					return;
				}
			}
			setJsonError(null);
			await saveConfig(parsed);
		} catch (e) {
			setJsonError(`JSON 解析错误: ${(e as Error).message}`);
		}
	}, [jsonText, saveConfig]);

	// Sync json text when switching to json mode
	const handleModeSwitch = useCallback((newMode: McpEditMode) => {
		if (newMode === "json" && config) {
			setJsonText(JSON.stringify(config, null, 2));
			setJsonError(null);
		}
		setMode(newMode);
		// Reset visual editing state
		setAddingServer(false);
		setEditingServer(null);
		setServerForm({ ...emptyMcpServer });
	}, [config]);

	if (!config) {
		return (
			<div className="mx-auto w-full max-w-[680px] px-8 py-4">
				<h1 className="mb-6 text-[20px] font-bold text-[var(--text-1)]">MCP 服务器</h1>
				<div className="flex items-center justify-center py-16">
					<span className="text-[13px] text-[var(--text-2)]">加载中…</span>
				</div>
			</div>
		);
	}

	const serverNames = Object.keys(config.mcpServers);

	return (
		<div className="mx-auto w-full max-w-[680px] px-8 py-4">
			<div className="mb-6 flex items-center justify-between">
				<h1 className="text-[20px] font-bold text-[var(--text-1)]">MCP 服务器</h1>
				<SegmentedControl
					items={[
						{ key: "visual" as McpEditMode, label: "视图", icon: "icon-[mdi--view-list-outline]" },
						{ key: "json" as McpEditMode, label: "JSON", icon: "icon-[mdi--code-json]" },
					]}
					value={mode}
					onChange={handleModeSwitch}
				/>
			</div>

			{mode === "visual" ? (
				<>
					{/* Server list */}
					<SettingSection title="服务器列表">
						{serverNames.length === 0 && !addingServer && (
							<div className="px-5 py-8 text-center text-[12px] text-[var(--text-2)]">
								尚未配置任何 MCP 服务器，点击下方按钮添加
							</div>
						)}

						{serverNames.map((name) => {
							const server = config.mcpServers[name]!;
							const isExpanded = expandedServer === name;
							const isEditing = editingServer === name;
							const isDisabled = server.disabled ?? false;

							return (
								<div key={name} className="border-b border-[var(--border)] last:border-b-0">
									{/* Server header */}
									<div className="flex items-center gap-3 px-5 py-3.5">
										<button
											type="button"
											onClick={() => setExpandedServer(isExpanded ? null : name)}
											className="flex flex-1 items-center gap-3 text-left"
										>
											<span
												className={cn(
													"icon-[mdi--chevron-right] h-4 w-4 shrink-0 text-[var(--text-2)] transition-transform",
													isExpanded && "rotate-90",
												)}
											/>
											<div className="min-w-0 flex-1">
												<div className={cn(
													"text-[13px] font-medium",
													isDisabled ? "text-[var(--text-2)]" : "text-[var(--text-1)]",
												)}>
													{name}
													{isDisabled && (
														<span className="ml-2 rounded-full bg-[var(--surface-overlay)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--text-2)]">
															已禁用
														</span>
													)}
												</div>
												<div className="mt-0.5 text-[11px] text-[var(--text-2)]">
													{server.command}
													{server.args && server.args.length > 0 && ` ${server.args.join(" ")}`}
												</div>
											</div>
										</button>
										<div className="flex items-center gap-1">
											{/* Toggle enable/disable */}
											<button
												type="button"
												onClick={(e) => {
													e.stopPropagation();
													void handleToggleDisabled(name);
												}}
												className={cn(
													"flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
													isDisabled
														? "text-[var(--text-2)] hover:bg-[var(--hover-strong)] hover:text-[var(--text-1)]"
														: "text-green-400 hover:bg-green-500/10",
												)}
												title={isDisabled ? "启用" : "禁用"}
											>
												<span className={`${isDisabled ? "icon-[mdi--toggle-switch-off-outline]" : "icon-[mdi--toggle-switch-outline]"} h-4 w-4`} />
											</button>
											<button
												type="button"
												onClick={(e) => {
													e.stopPropagation();
													startEditServer(name);
													setExpandedServer(name);
												}}
												className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-2)] transition-colors hover:bg-[var(--hover-strong)] hover:text-[var(--text-1)]"
												title="编辑"
											>
												<span className="icon-[mdi--pencil-outline] h-3.5 w-3.5" />
											</button>
											<button
												type="button"
												onClick={(e) => {
													e.stopPropagation();
													void handleDeleteServer(name);
												}}
												className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-2)] transition-colors hover:bg-red-500/10 hover:text-red-400"
												title="删除"
											>
												<span className="icon-[mdi--delete-outline] h-3.5 w-3.5" />
											</button>
										</div>
									</div>

									{/* Edit form */}
									{isExpanded && isEditing && (
										<div className="border-t border-[var(--border)] bg-[var(--surface-raised)]/50 px-5 py-4">
											<McpServerForm
												form={serverForm}
												setForm={setServerForm}
												onSave={() => void handleUpdateServer(name)}
												onCancel={() => {
													setEditingServer(null);
													setServerForm({ ...emptyMcpServer });
												}}
												saving={saving}
												saveLabel="保存"
											/>
										</div>
									)}

									{/* Expanded detail view */}
									{isExpanded && !isEditing && (
										<div className="border-t border-[var(--border)] bg-[var(--surface-raised)]/30 px-5 py-3">
											<div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[12px]">
												<DetailItem label="命令" value={server.command} />
												<DetailItem label="参数" value={server.args?.join(", ") || "—"} />
												<DetailItem label="工作目录" value={server.cwd || "—"} />
												<DetailItem label="启动超时" value={server.startupTimeout != null ? `${server.startupTimeout}ms` : "默认 (10s)"} />
												<DetailItem label="调试模式" value={server.debug ? "开启" : "关闭"} />
												<DetailItem label="自动批准" value={server.autoApprove?.join(", ") || "—"} />
											</div>
											{server.env && Object.keys(server.env).length > 0 && (
												<div className="mt-3">
													<div className="mb-1 text-[11px] text-[var(--text-2)]">环境变量</div>
													<div className="rounded-lg bg-[var(--surface)] px-3 py-2 font-mono text-[11px] text-[var(--text-1)]">
														{Object.entries(server.env).map(([k, v]) => (
															<div key={k}>{k}={v}</div>
														))}
													</div>
												</div>
											)}
										</div>
									)}
								</div>
							);
						})}

						{/* Add server form */}
						{addingServer && (
							<div className="border-t border-[var(--border)] px-5 py-4">
								<McpServerForm
									form={serverForm}
									setForm={setServerForm}
									onSave={() => void handleAddServer()}
									onCancel={() => {
										setAddingServer(false);
										setServerForm({ ...emptyMcpServer });
									}}
									saving={saving}
									saveLabel="添加"
								/>
							</div>
						)}
					</SettingSection>

					{/* Add server button */}
					{!addingServer && (
						<button
							type="button"
							onClick={() => {
								setAddingServer(true);
								setEditingServer(null);
								setServerForm({ ...emptyMcpServer });
							}}
							className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] py-3 text-[13px] text-[var(--text-2)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
						>
							<span className="icon-[mdi--plus] h-4 w-4" />
							添加 MCP 服务器
						</button>
					)}
				</>
			) : (
				/* JSON mode */
				<div className="mb-6">
					<div className="mb-3 flex items-center justify-between">
						<h2 className="text-[15px] font-semibold text-[var(--text-1)]">编辑 JSON</h2>
						<Button
							variant="primary"
							size="sm"
							onClick={() => void handleJsonSave()}
							disabled={saving}
						>
							{saving ? "保存中…" : "保存"}
						</Button>
					</div>
					<div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
						<textarea
							ref={jsonTextareaRef}
							value={jsonText}
							onChange={(e) => {
								setJsonText(e.target.value);
								setJsonError(null);
							}}
							spellCheck={false}
							className="w-full resize-none bg-transparent px-4 py-3 font-mono text-[12px] leading-relaxed text-[var(--text-1)] outline-none placeholder:text-[var(--text-2)]/40"
							style={{ minHeight: "320px" }}
							placeholder='{ "mcpServers": {} }'
						/>
					</div>
					{jsonError && (
						<div className="mt-2 flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-[12px] text-red-400">
							<span className="icon-[mdi--alert-circle-outline] h-3.5 w-3.5 shrink-0" />
							{jsonError}
						</div>
					)}
				</div>
			)}

			{/* Config file path hint */}
			<div className="mt-6 text-center text-[11px] text-[var(--text-2)]/60">
				配置文件路径: ~/.vetta/agent/mcp.json
			</div>
		</div>
	);
}

function DetailItem({ label, value }: { label: string; value: string }): JSX.Element {
	return (
		<div>
			<span className="text-[var(--text-2)]">{label}: </span>
			<span className="text-[var(--text-1)]">{value}</span>
		</div>
	);
}

function McpServerForm({
	form,
	setForm,
	onSave,
	onCancel,
	saving,
	saveLabel,
}: {
	form: McpServerFormState;
	setForm: React.Dispatch<React.SetStateAction<McpServerFormState>>;
	onSave: () => void;
	onCancel: () => void;
	saving: boolean;
	saveLabel: string;
}): JSX.Element {
	return (
		<>
			<div className="grid grid-cols-2 gap-3">
				<div>
					<label className="mb-1 block text-[11px] text-[var(--text-2)]">服务器名称 *</label>
					<InputField
						value={form.name}
						onChange={(v) => setForm((f) => ({ ...f, name: v }))}
						placeholder="e.g. filesystem"
					/>
				</div>
				<div>
					<label className="mb-1 block text-[11px] text-[var(--text-2)]">命令 *</label>
					<InputField
						value={form.command}
						onChange={(v) => setForm((f) => ({ ...f, command: v }))}
						placeholder="e.g. npx, node, uvx"
					/>
				</div>
				<div className="col-span-2">
					<label className="mb-1 block text-[11px] text-[var(--text-2)]">参数 (逗号分隔)</label>
					<InputField
						value={form.args}
						onChange={(v) => setForm((f) => ({ ...f, args: v }))}
						placeholder="e.g. -y, @modelcontextprotocol/server-filesystem, /path"
					/>
				</div>
				<div className="col-span-2">
					<label className="mb-1 block text-[11px] text-[var(--text-2)]">环境变量 (每行一个 KEY=VALUE，支持 ${"{"}VAR{"}"} 引用)</label>
					<TextareaField
						value={form.env}
						onChange={(v) => setForm((f) => ({ ...f, env: v }))}
						placeholder={"GITHUB_TOKEN=${GITHUB_TOKEN}\nNODE_ENV=production"}
						rows={3}
					/>
				</div>
				<div>
					<label className="mb-1 block text-[11px] text-[var(--text-2)]">工作目录</label>
					<InputField
						value={form.cwd}
						onChange={(v) => setForm((f) => ({ ...f, cwd: v }))}
						placeholder="e.g. ${PROJECT_ROOT}"
					/>
				</div>
				<div>
					<label className="mb-1 block text-[11px] text-[var(--text-2)]">启动超时 (ms)</label>
					<InputField
						value={form.startupTimeout}
						onChange={(v) => setForm((f) => ({ ...f, startupTimeout: v }))}
						placeholder="默认 10000"
					/>
				</div>
				<div className="col-span-2">
					<label className="mb-1 block text-[11px] text-[var(--text-2)]">自动批准工具 (逗号分隔)</label>
					<InputField
						value={form.autoApprove}
						onChange={(v) => setForm((f) => ({ ...f, autoApprove: v }))}
						placeholder="e.g. read_file, list_directory"
					/>
				</div>
				<div className="col-span-2 flex items-center gap-6">
					<CheckboxField
						checked={form.disabled}
						onChange={(v) => setForm((f) => ({ ...f, disabled: v }))}
						label="禁用此服务器"
					/>
					<CheckboxField
						checked={form.debug}
						onChange={(v) => setForm((f) => ({ ...f, debug: v }))}
						label="调试模式"
					/>
				</div>
			</div>
			<div className="mt-3 flex justify-end gap-2">
				<Button variant="ghost" size="sm" onClick={onCancel}>
					取消
				</Button>
				<Button
					variant="primary"
					size="sm"
					onClick={onSave}
					disabled={!form.name.trim() || !form.command.trim() || saving}
				>
					{saveLabel}
				</Button>
			</div>
		</>
	);
}

// ─── Archived Projects Settings ───

function projectName(cwd: string): string {
	return cwd.split("/").filter(Boolean).pop() ?? cwd;
}

function ArchivedProjectsSettings(): JSX.Element {
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

// ─── Settings page shell ───

const SETTINGS_CONTENT: Record<SettingsTab, () => JSX.Element> = {
	general: GeneralSettings,
	models: ModelsSettings,
	mcp: McpSettings,
	archive: ArchivedProjectsSettings,
};

export function SettingsPage(): JSX.Element {
	const [tab, setTab] = useAtom(settingsTabAtom);
	const Content = SETTINGS_CONTENT[tab];

	return (
		<div className="flex h-full w-full flex-1 overflow-hidden">
			{/* Settings sidebar */}
			<div className="flex w-[200px] shrink-0 flex-col border-r border-[var(--border)]">
				<div className="drag-region px-5 pb-4 pt-5">
					<h1 className="text-[20px] font-bold tracking-[-0.02em] text-[var(--text-1)]">
						设置
					</h1>
				</div>
				<nav className="flex flex-col gap-0.5 px-2.5">
					{SETTINGS_GROUPS.map(({ key, label, icon }) => (
						<button
							key={key}
							type="button"
							onClick={() => setTab(key)}
							className={cn(
								"flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] font-medium transition-colors",
								tab === key
									? "bg-[var(--hover-strong)] text-[var(--text-1)]"
									: "text-[var(--text-1)] hover:bg-[var(--hover)]",
							)}
						>
							<span className={cn(icon, "h-4 w-4 shrink-0")} />
							{label}
						</button>
					))}
				</nav>
			</div>

			{/* Settings content */}
			<div className="flex flex-1 flex-col overflow-y-auto bg-[var(--content-bg)]">
				{/* Drag region */}
				<div className="drag-region h-12 shrink-0" />
				<Content />
			</div>
		</div>
	);
}

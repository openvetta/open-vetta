import { useAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import type { ModelsConfigData } from "../../../preload/api.js";
import { settingsTabAtom, workspacePathAtom, type SettingsTab } from "../store/atoms";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";

const SETTINGS_GROUPS: { key: SettingsTab; label: string; icon: string }[] = [
	{ key: "general", label: "通用设置", icon: "icon-[mdi--cog-outline]" },
	{ key: "models", label: "模型配置", icon: "icon-[mdi--brain]" },
	{ key: "mcp", label: "MCP 服务器", icon: "icon-[mdi--server-outline]" },
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

function McpSettings(): JSX.Element {
	return (
		<div className="mx-auto w-full max-w-[680px] px-8 py-4">
			<h1 className="mb-6 text-[20px] font-bold text-[var(--text-1)]">MCP 服务器</h1>
			<div className="flex flex-col items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] py-16 opacity-50">
				<span className="icon-[mdi--server-outline] h-10 w-10 text-[var(--text-2)]" />
				<p className="text-[13px] text-[var(--text-2)]">即将推出</p>
			</div>
		</div>
	);
}

// ─── Settings page shell ───

const SETTINGS_CONTENT: Record<SettingsTab, () => JSX.Element> = {
	general: GeneralSettings,
	models: ModelsSettings,
	mcp: McpSettings,
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

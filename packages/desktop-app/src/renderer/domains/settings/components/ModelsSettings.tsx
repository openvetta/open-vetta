import { useAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import type { ModelsConfigData } from "@preload/api.js";
import { remoteProvidersAtom } from "@shared/store/atoms";
import { cn } from "@shared/lib/utils";
import { Button } from "@shared/components/ui/button";
import { SegmentedControl } from "@shared/components/ui/segmented-control";
import { SettingSection } from "./shared";
import { CheckboxField } from "./McpSettings";

const API_OPTIONS = [
	{ value: "anthropic-messages", label: "Anthropic" },
	{ value: "openai-completions", label: "OpenAI Completions" },
	{ value: "openai-responses", label: "OpenAI Responses" },
	{ value: "google-generative-ai", label: "Google Generative AI" },
	{ value: "bedrock-converse-stream", label: "AWS Bedrock" },
];

const INPUT_OPTIONS = [
	{ value: "text", label: "Text" },
	{ value: "image", label: "Image" },
];

interface ProviderFormState {
	name: string;
	baseUrl: string;
	apiKey: string;
	api: string;
	headers: string;
	authHeader: boolean;
}

interface ModelFormState {
	id: string;
	name: string;
	api: string;
	reasoning: boolean;
	input: string[];
	contextWindow: string;
	maxTokens: string;
}

const emptyProvider: ProviderFormState = { name: "", baseUrl: "", apiKey: "", api: "openai-completions", headers: "", authHeader: false };
const emptyModel: ModelFormState = { id: "", name: "", api: "", reasoning: false, input: ["text"], contextWindow: "", maxTokens: "" };

type ModelsEditMode = "visual" | "json";

export function SelectField({
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
				className="h-8 w-full appearance-none rounded-lg border border-input bg-secondary pl-3 pr-8 text-[12px] text-foreground outline-none transition-colors hover:bg-accent focus:border-ring"
			>
				{options.map((o) => (
					<option key={o.value} value={o.value}>
						{o.label}
					</option>
				))}
			</select>
			<span className="icon-[mdi--chevron-down] pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
		</div>
	);
}

export function InputField({
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
			className="h-8 w-full rounded-lg border border-input bg-secondary px-3 text-[12px] text-foreground placeholder:text-muted-foreground/40 outline-none transition-colors hover:bg-accent focus:border-ring"
		/>
	);
}

function parseHeadersString(s: string): Record<string, string> | undefined {
	const lines = s.trim().split("\n").map((l) => l.trim()).filter(Boolean);
	if (lines.length === 0) return undefined;
	return Object.fromEntries(lines.map((l) => {
		const idx = l.indexOf(":");
		return idx > 0 ? [l.slice(0, idx).trim(), l.slice(idx + 1).trim()] : [l, ""];
	}));
}

function headersToString(headers?: Record<string, string>): string {
	if (!headers) return "";
	return Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join("\n");
}

function modelToForm(m: NonNullable<ModelsConfigData["providers"][string]["models"]>[number]): ModelFormState {
	return {
		id: m.id,
		name: m.name || "",
		api: m.api || "",
		reasoning: m.reasoning ?? false,
		input: m.input ?? ["text"],
		contextWindow: m.contextWindow != null ? String(m.contextWindow) : "",
		maxTokens: m.maxTokens != null ? String(m.maxTokens) : "",
	};
}

function formToModelDef(form: ModelFormState): NonNullable<ModelsConfigData["providers"][string]["models"]>[number] {
	const m: NonNullable<ModelsConfigData["providers"][string]["models"]>[number] = {
		id: form.id.trim(),
	};
	if (form.name.trim()) m.name = form.name.trim();
	if (form.api) m.api = form.api;
	if (form.reasoning) m.reasoning = true;
	if (form.input.length > 0) m.input = form.input;
	const cw = Number(form.contextWindow.trim());
	if (cw > 0) m.contextWindow = cw;
	const mt = Number(form.maxTokens.trim());
	if (mt > 0) m.maxTokens = mt;
	return m;
}

function ProviderForm({
	form,
	setForm,
	onSave,
	onCancel,
	saving,
	saveLabel,
}: {
	form: ProviderFormState;
	setForm: React.Dispatch<React.SetStateAction<ProviderFormState>>;
	onSave: () => void;
	onCancel: () => void;
	saving: boolean;
	saveLabel: string;
}): JSX.Element {
	return (
		<>
			<div className="grid grid-cols-2 gap-3">
				<div>
					<label className="mb-1 block text-[11px] text-muted-foreground">服务商名称 *</label>
					<InputField
						value={form.name}
						onChange={(v) => setForm((f) => ({ ...f, name: v }))}
						placeholder="e.g. ollama, lm-studio"
					/>
				</div>
				<div>
					<label className="mb-1 block text-[11px] text-muted-foreground">API 类型</label>
					<SelectField
						value={form.api}
						onChange={(v) => setForm((f) => ({ ...f, api: v }))}
						options={API_OPTIONS}
					/>
				</div>
				<div className="col-span-2">
					<label className="mb-1 block text-[11px] text-muted-foreground">Base URL</label>
					<InputField
						value={form.baseUrl}
						onChange={(v) => setForm((f) => ({ ...f, baseUrl: v }))}
						placeholder="e.g. http://localhost:11434/v1"
					/>
				</div>
				<div className="col-span-2">
					<label className="mb-1 block text-[11px] text-muted-foreground">API Key</label>
					<InputField
						value={form.apiKey}
						onChange={(v) => setForm((f) => ({ ...f, apiKey: v }))}
						placeholder="sk-... 或 env:MY_API_KEY 或 cmd:xxx"
						type="password"
					/>
				</div>
				<div className="col-span-2">
					<label className="mb-1 block text-[11px] text-muted-foreground">自定义 Headers (每行一个 Key: Value)</label>
					<textarea
						value={form.headers}
						onChange={(e) => setForm((f) => ({ ...f, headers: e.target.value }))}
						placeholder={"X-Custom-Header: value\nAuthorization: Bearer xxx"}
						rows={2}
						className="w-full rounded-lg border border-input bg-secondary px-3 py-2 font-mono text-[12px] text-foreground placeholder:text-muted-foreground/40 outline-none transition-colors hover:bg-accent focus:border-ring resize-none"
					/>
				</div>
				<div className="col-span-2">
					<CheckboxField
						checked={form.authHeader}
						onChange={(v) => setForm((f) => ({ ...f, authHeader: v }))}
						label="使用 Authorization Header 发送 API Key"
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
					disabled={!form.name.trim() || saving}
				>
					{saveLabel}
				</Button>
			</div>
		</>
	);
}

function ModelForm({
	form,
	setForm,
	onSave,
	onCancel,
	saving,
	saveLabel,
}: {
	form: ModelFormState;
	setForm: React.Dispatch<React.SetStateAction<ModelFormState>>;
	onSave: () => void;
	onCancel: () => void;
	saving: boolean;
	saveLabel: string;
}): JSX.Element {
	const toggleInput = (val: string) => {
		setForm((f) => {
			const has = f.input.includes(val);
			return { ...f, input: has ? f.input.filter((v) => v !== val) : [...f.input, val] };
		});
	};

	return (
		<>
			<div className="grid grid-cols-2 gap-3">
				<div>
					<label className="mb-1 block text-[11px] text-muted-foreground">模型 ID *</label>
					<InputField
						value={form.id}
						onChange={(v) => setForm((f) => ({ ...f, id: v }))}
						placeholder="e.g. llama3, qwen-vl"
					/>
				</div>
				<div>
					<label className="mb-1 block text-[11px] text-muted-foreground">显示名称</label>
					<InputField
						value={form.name}
						onChange={(v) => setForm((f) => ({ ...f, name: v }))}
						placeholder="可选"
					/>
				</div>
				<div>
					<label className="mb-1 block text-[11px] text-muted-foreground">API 类型</label>
					<InputField
						value={form.api}
						onChange={(v) => setForm((f) => ({ ...f, api: v }))}
						placeholder="继承服务商"
					/>
				</div>
				<div>
					<label className="mb-1 block text-[11px] text-muted-foreground">输入能力</label>
					<div className="flex items-center gap-3 h-8">
						{INPUT_OPTIONS.map((opt) => (
							<label key={opt.value} className="flex items-center gap-1.5 cursor-pointer select-none">
								<button
									type="button"
									onClick={() => toggleInput(opt.value)}
									className={cn(
										"flex h-4 w-4 items-center justify-center rounded border transition-colors",
										form.input.includes(opt.value)
											? "border-primary bg-primary"
											: "border-input bg-secondary hover:bg-accent",
									)}
								>
									{form.input.includes(opt.value) && (
										<span className="icon-[mdi--check] h-3 w-3 text-primary-foreground" />
									)}
								</button>
								<span className="text-[12px] text-foreground">{opt.label}</span>
							</label>
						))}
					</div>
				</div>
				<div>
					<label className="mb-1 block text-[11px] text-muted-foreground">上下文窗口</label>
					<InputField
						value={form.contextWindow}
						onChange={(v) => setForm((f) => ({ ...f, contextWindow: v }))}
						placeholder="e.g. 131072"
					/>
				</div>
				<div>
					<label className="mb-1 block text-[11px] text-muted-foreground">最大输出 Tokens</label>
					<InputField
						value={form.maxTokens}
						onChange={(v) => setForm((f) => ({ ...f, maxTokens: v }))}
						placeholder="e.g. 8192"
					/>
				</div>
				<div className="col-span-2">
					<CheckboxField
						checked={form.reasoning}
						onChange={(v) => setForm((f) => ({ ...f, reasoning: v }))}
						label="支持推理/思考 (Reasoning)"
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
					disabled={!form.id.trim() || saving}
				>
					{saveLabel}
				</Button>
			</div>
		</>
	);
}

export function ModelsSettings(): JSX.Element {
	const [config, setConfig] = useState<ModelsConfigData | null>(null);
	const [mode, setMode] = useState<ModelsEditMode>("visual");
	const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
	const [addingProvider, setAddingProvider] = useState(false);
	const [providerForm, setProviderForm] = useState<ProviderFormState>({ ...emptyProvider });
	const [editingProvider, setEditingProvider] = useState<string | null>(null);
	const [addingModelFor, setAddingModelFor] = useState<string | null>(null);
	const [editingModel, setEditingModel] = useState<{ provider: string; modelId: string } | null>(null);
	const [modelForm, setModelForm] = useState<ModelFormState>({ ...emptyModel });
	const [saving, setSaving] = useState(false);

	// JSON mode state
	const [jsonText, setJsonText] = useState("");
	const [jsonError, setJsonError] = useState<string | null>(null);

	// Remote providers
	const [remoteProviders, setRemoteProviders] = useAtom(remoteProvidersAtom);
	const [refreshing, setRefreshing] = useState(false);
	const [remoteError, setRemoteError] = useState<string | null>(null);
	const [expandedRemoteProvider, setExpandedRemoteProvider] = useState<string | null>(null);

	const handleRefreshRemote = useCallback(async () => {
		setRefreshing(true);
		setRemoteError(null);
		try {
			const result = await window.vetta.models.fetchRemote();
			if (result.error) {
				setRemoteError(result.error);
			}
			setRemoteProviders(result.providers);
		} catch {
			setRemoteError("请求失败");
		} finally {
			setRefreshing(false);
		}
	}, [setRemoteProviders]);

	// Load config on mount
	useEffect(() => {
		void window.vetta.models.get().then((c) => {
			setConfig(c);
			setJsonText(JSON.stringify(c, null, 2));
		});
	}, []);

	const saveConfig = useCallback(
		async (newConfig: ModelsConfigData) => {
			setSaving(true);
			try {
				await window.vetta.models.set(newConfig);
				setConfig(newConfig);
				setJsonText(JSON.stringify(newConfig, null, 2));
			} finally {
				setSaving(false);
			}
		},
		[],
	);

	// --- Provider CRUD ---

	const providerFormToData = useCallback(() => {
		const headers = parseHeadersString(providerForm.headers);
		return {
			baseUrl: providerForm.baseUrl.trim() || undefined,
			apiKey: providerForm.apiKey.trim() || undefined,
			api: providerForm.api || undefined,
			headers,
			authHeader: providerForm.authHeader || undefined,
		};
	}, [providerForm]);

	const handleAddProvider = useCallback(async () => {
		if (!config || !providerForm.name.trim()) return;
		const newConfig: ModelsConfigData = {
			...config,
			providers: {
				...config.providers,
				[providerForm.name.trim()]: {
					...providerFormToData(),
					models: [],
				},
			},
		};
		await saveConfig(newConfig);
		setAddingProvider(false);
		setProviderForm({ ...emptyProvider });
		setExpandedProvider(providerForm.name.trim());
	}, [config, providerForm, providerFormToData, saveConfig]);

	const handleUpdateProvider = useCallback(
		async (oldName: string) => {
			if (!config || !providerForm.name.trim()) return;
			const newProviders = { ...config.providers };
			const existing = newProviders[oldName];
			if (!existing) return;

			if (oldName !== providerForm.name.trim()) {
				delete newProviders[oldName];
			}

			newProviders[providerForm.name.trim()] = {
				...existing,
				...providerFormToData(),
			};

			await saveConfig({ ...config, providers: newProviders });
			setEditingProvider(null);
			setProviderForm({ ...emptyProvider });
			if (oldName !== providerForm.name.trim()) {
				setExpandedProvider(providerForm.name.trim());
			}
		},
		[config, providerForm, providerFormToData, saveConfig],
	);

	const handleDeleteProvider = useCallback(
		async (name: string) => {
			if (!config) return;
			const newProviders = { ...config.providers };
			delete newProviders[name];
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
				headers: headersToString(p.headers),
				authHeader: p.authHeader ?? false,
			});
			setEditingProvider(name);
			setAddingProvider(false);
		},
		[config],
	);

	// --- Model CRUD ---

	const handleAddModel = useCallback(
		async (providerName: string) => {
			if (!config || !modelForm.id.trim()) return;
			const provider = config.providers[providerName];
			if (!provider) return;
			const models = [...(provider.models || []), formToModelDef(modelForm)];
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

	const handleUpdateModel = useCallback(
		async (providerName: string, oldModelId: string) => {
			if (!config || !modelForm.id.trim()) return;
			const provider = config.providers[providerName];
			if (!provider) return;
			const models = (provider.models || []).map((m) =>
				m.id === oldModelId ? formToModelDef(modelForm) : m,
			);
			const oldKey = `${providerName}/${oldModelId}`;
			const newKey = `${providerName}/${modelForm.id.trim()}`;
			const newConfig: ModelsConfigData = {
				...config,
				defaultModel: config.defaultModel === oldKey ? newKey : config.defaultModel,
				providers: {
					...config.providers,
					[providerName]: { ...provider, models },
				},
			};
			await saveConfig(newConfig);
			setEditingModel(null);
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
			if (newDefault) {
				localStorage.setItem("vetta-selected-model", newDefault);
			}
		},
		[config, saveConfig],
	);

	const startEditModel = useCallback(
		(providerName: string, modelId: string) => {
			if (!config) return;
			const provider = config.providers[providerName];
			if (!provider) return;
			const model = (provider.models || []).find((m) => m.id === modelId);
			if (!model) return;
			setModelForm(modelToForm(model));
			setEditingModel({ provider: providerName, modelId });
			setAddingModelFor(null);
		},
		[config],
	);

	// --- JSON mode ---

	const handleJsonSave = useCallback(async () => {
		try {
			const parsed = JSON.parse(jsonText) as ModelsConfigData;
			if (!parsed.providers || typeof parsed.providers !== "object") {
				setJsonError("JSON 必须包含 providers 对象");
				return;
			}
			setJsonError(null);
			await saveConfig(parsed);
		} catch (e) {
			setJsonError(`JSON 解析错误: ${(e as Error).message}`);
		}
	}, [jsonText, saveConfig]);

	const handleModeSwitch = useCallback((newMode: ModelsEditMode) => {
		if (newMode === "json" && config) {
			setJsonText(JSON.stringify(config, null, 2));
			setJsonError(null);
		}
		setMode(newMode);
		setAddingProvider(false);
		setEditingProvider(null);
		setAddingModelFor(null);
		setEditingModel(null);
		setProviderForm({ ...emptyProvider });
		setModelForm({ ...emptyModel });
	}, [config]);

	if (!config) {
		return (
			<div className="mx-auto w-full max-w-[680px] px-8 py-4">
				<h1 className="mb-6 text-[20px] font-bold text-foreground">模型配置</h1>
				<div className="flex items-center justify-center py-16">
					<span className="text-[13px] text-muted-foreground">加载中…</span>
				</div>
			</div>
		);
	}

	const providerNames = Object.keys(config.providers);

	return (
		<div className="mx-auto w-full max-w-[680px] px-8 py-4">
			<div className="mb-6 flex items-center justify-between">
				<h1 className="text-[20px] font-bold text-foreground">模型配置</h1>
				<SegmentedControl
					items={[
						{ key: "visual" as ModelsEditMode, label: "视图", icon: "icon-[mdi--view-list-outline]" },
						{ key: "json" as ModelsEditMode, label: "JSON", icon: "icon-[mdi--code-json]" },
					]}
					value={mode}
					onChange={handleModeSwitch}
				/>
			</div>

			{mode === "visual" ? (
				<>
					{/* Provider list */}
					<SettingSection title="服务商">
						{providerNames.length === 0 && !addingProvider && (
							<div className="px-5 py-8 text-center text-[12px] text-muted-foreground">
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
									className="border-b border-border last:border-b-0"
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
													"icon-[mdi--chevron-right] h-4 w-4 shrink-0 text-muted-foreground transition-transform",
													isExpanded && "rotate-90",
												)}
											/>
											<div className="min-w-0 flex-1">
												<div className="text-[13px] font-medium text-foreground">{name}</div>
												<div className="mt-0.5 text-[11px] text-muted-foreground">
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
													setExpandedProvider(name);
												}}
												className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
												className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400"
												title="删除"
											>
												<span className="icon-[mdi--delete-outline] h-3.5 w-3.5" />
											</button>
										</div>
									</div>

									{/* Edit provider form (inline) */}
									{isExpanded && isEditing && (
										<div className="border-t border-border bg-secondary/50 px-5 py-4">
											<ProviderForm
												form={providerForm}
												setForm={setProviderForm}
												onSave={() => void handleUpdateProvider(name)}
												onCancel={() => {
													setEditingProvider(null);
													setProviderForm({ ...emptyProvider });
												}}
												saving={saving}
												saveLabel="保存"
											/>
										</div>
									)}

									{/* Expanded: models list */}
									{isExpanded && !isEditing && (
										<div className="border-t border-border bg-secondary/30">
											{models.length === 0 && addingModelFor !== name && (
												<div className="px-5 py-6 text-center text-[12px] text-muted-foreground">
													暂无自定义模型
												</div>
											)}

											{models.map((model) => {
												const modelKey = `${name}/${model.id}`;
												const isDefault = config.defaultModel === modelKey;
												const isModelEditing = editingModel?.provider === name && editingModel?.modelId === model.id;

												if (isModelEditing) {
													return (
														<div key={model.id} className="border-b border-border/50 px-5 py-3 last:border-b-0">
															<ModelForm
																form={modelForm}
																setForm={setModelForm}
																onSave={() => void handleUpdateModel(name, model.id)}
																onCancel={() => {
																	setEditingModel(null);
																	setModelForm({ ...emptyModel });
																}}
																saving={saving}
																saveLabel="保存"
															/>
														</div>
													);
												}

												return (
													<div
														key={model.id}
														className="flex items-center justify-between border-b border-border/50 px-5 py-2.5 last:border-b-0"
													>
														<div className="min-w-0 flex-1">
															<div className="flex items-center gap-2 text-[12px] font-medium text-foreground">
																{model.name || model.id}
																{isDefault && (
																	<span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium text-primary">
																		默认
																	</span>
																)}
															</div>
															<div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
																<span>{model.id}</span>
																{model.api && <span>· {model.api}</span>}
																{model.input && model.input.includes("image") && (
																	<span className="rounded bg-blue-500/10 px-1 py-0.5 text-[9px] text-blue-400">
																		vision
																	</span>
																)}
																{model.reasoning && (
																	<span className="rounded bg-purple-500/10 px-1 py-0.5 text-[9px] text-purple-400">
																		reasoning
																	</span>
																)}
																{model.contextWindow != null && (
																	<span>· {(model.contextWindow / 1024).toFixed(0)}K ctx</span>
																)}
																{model.maxTokens != null && (
																	<span>· {(model.maxTokens / 1024).toFixed(0)}K max</span>
																)}
															</div>
														</div>
														<div className="flex items-center gap-0.5">
															<button
																type="button"
																onClick={() => void handleSetDefaultModel(name, model.id)}
																className={cn(
																	"flex h-6 w-6 items-center justify-center rounded-md transition-colors",
																	isDefault
																		? "text-primary"
																		: "text-muted-foreground hover:bg-accent hover:text-primary",
																)}
																title={isDefault ? "取消默认" : "设为默认模型"}
															>
																<span className={`${isDefault ? "icon-[mdi--star]" : "icon-[mdi--star-outline]"} h-3.5 w-3.5`} />
															</button>
															<button
																type="button"
																onClick={() => startEditModel(name, model.id)}
																className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
																title="编辑模型"
															>
																<span className="icon-[mdi--pencil-outline] h-3 w-3" />
															</button>
															<button
																type="button"
																onClick={() => void handleDeleteModel(name, model.id)}
																className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400"
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
												<div className="border-t border-border/50 px-5 py-3">
													<ModelForm
														form={modelForm}
														setForm={setModelForm}
														onSave={() => void handleAddModel(name)}
														onCancel={() => {
															setAddingModelFor(null);
															setModelForm({ ...emptyModel });
														}}
														saving={saving}
														saveLabel="添加"
													/>
												</div>
											) : (
												<div className="border-t border-border/50 px-5 py-2">
													<button
														type="button"
														onClick={() => {
															setAddingModelFor(name);
															setEditingModel(null);
															setModelForm({ ...emptyModel });
														}}
														className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] text-primary transition-colors hover:bg-primary/10"
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
							<div className="border-t border-border px-5 py-4">
								<ProviderForm
									form={providerForm}
									setForm={setProviderForm}
									onSave={() => void handleAddProvider()}
									onCancel={() => {
										setAddingProvider(false);
										setProviderForm({ ...emptyProvider });
									}}
									saving={saving}
									saveLabel="添加"
								/>
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
							className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 text-[13px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
						>
							<span className="icon-[mdi--plus] h-4 w-4" />
							添加服务商
						</button>
					)}

					{/* Remote providers (read-only, from server) */}
					<div className="mt-6">
						<SettingSection
							title={
								<div className="flex items-center justify-between">
									<span>远程服务商</span>
									<button
										type="button"
										onClick={() => void handleRefreshRemote()}
										disabled={refreshing}
										className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
									>
										<span className={cn("icon-[mdi--refresh] h-3.5 w-3.5", refreshing && "animate-spin")} />
										{refreshing ? "刷新中…" : "刷新"}
									</button>
								</div>
							}
						>
							{remoteError && (
								<div className="flex items-center gap-2 px-5 py-3 text-[12px] text-amber-400">
									<span className="icon-[mdi--alert-circle-outline] h-3.5 w-3.5 shrink-0" />
									{remoteError === "unauthorized" ? "未授权，请先登录" : remoteError}
								</div>
							)}
							{Object.keys(remoteProviders).length === 0 && !remoteError && (
								<div className="px-5 py-6 text-center text-[12px] text-muted-foreground">
									暂无远程服务商，点击刷新获取
								</div>
							)}
							{Object.entries(remoteProviders as Record<string, { api?: string; baseUrl?: string; models?: Array<{ id: string; name?: string; api?: string; input?: string[]; reasoning?: boolean; contextWindow?: number; maxTokens?: number }> }>).map(([name, provider]) => {
								const models = provider.models ?? [];
								const isExpanded = expandedRemoteProvider === name;
								return (
									<div key={name} className="border-b border-border last:border-b-0">
										{/* Provider header -- same layout as local providers */}
										<div className="flex items-center gap-3 px-5 py-3.5">
											<button
												type="button"
												onClick={() => setExpandedRemoteProvider(isExpanded ? null : name)}
												className="flex flex-1 items-center gap-3 text-left"
											>
												<span
													className={cn(
														"icon-[mdi--chevron-right] h-4 w-4 shrink-0 text-muted-foreground transition-transform",
														isExpanded && "rotate-90",
													)}
												/>
												<div className="min-w-0 flex-1">
													<div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
														{name}
														<span className="rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[9px] font-medium text-blue-400">
															remote
														</span>
													</div>
													<div className="mt-0.5 text-[11px] text-muted-foreground">
														{provider.api || "openai-completions"} · {models.length} 个模型
														{provider.baseUrl && ` · ${provider.baseUrl}`}
													</div>
												</div>
											</button>
										</div>

										{/* Expanded: models list */}
										{isExpanded && (
											<div className="border-t border-border bg-secondary/30">
												{models.length === 0 && (
													<div className="px-5 py-6 text-center text-[12px] text-muted-foreground">
														暂无模型
													</div>
												)}
												{models.map((model) => (
													<div
														key={model.id}
														className="flex items-center justify-between border-b border-border/50 px-5 py-2.5 last:border-b-0"
													>
														<div className="min-w-0 flex-1">
															<div className="text-[12px] font-medium text-foreground">
																{model.name || model.id}
															</div>
															<div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
																<span>{model.id}</span>
																{model.api && <span>· {model.api}</span>}
																{model.input?.includes("image") && (
																	<span className="rounded bg-blue-500/10 px-1 py-0.5 text-[9px] text-blue-400">vision</span>
																)}
																{model.reasoning && (
																	<span className="rounded bg-purple-500/10 px-1 py-0.5 text-[9px] text-purple-400">reasoning</span>
																)}
																{model.contextWindow != null && (
																	<span>· {(model.contextWindow / 1024).toFixed(0)}K ctx</span>
																)}
																{model.maxTokens != null && (
																	<span>· {(model.maxTokens / 1024).toFixed(0)}K max</span>
																)}
															</div>
														</div>
													</div>
												))}
											</div>
										)}
									</div>
								);
							})}
						</SettingSection>
					</div>
				</>
			) : (
				/* JSON mode */
				<div className="mb-6">
					<div className="mb-3 flex items-center justify-between">
						<h2 className="text-[15px] font-semibold text-foreground">编辑 JSON</h2>
						<Button
							variant="primary"
							size="sm"
							onClick={() => void handleJsonSave()}
							disabled={saving}
						>
							{saving ? "保存中…" : "保存"}
						</Button>
					</div>
					<div className="overflow-hidden rounded-xl border border-border bg-muted">
						<textarea
							value={jsonText}
							onChange={(e) => {
								setJsonText(e.target.value);
								setJsonError(null);
							}}
							spellCheck={false}
							className="w-full resize-none bg-transparent px-4 py-3 font-mono text-[12px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/40"
							style={{ minHeight: "400px" }}
							placeholder='{ "providers": {} }'
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
			<div className="mt-6 text-center text-[11px] text-muted-foreground/60">
				配置文件路径: ~/.vetta/agent/models.json
			</div>
		</div>
	);
}

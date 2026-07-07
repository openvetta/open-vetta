import { getReasoningPreset } from "@vetta/ai/reasoning-presets";
import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useState } from "react";
import type { ModelsConfigData } from "@preload/api.js";
import { cn } from "@shared/lib/utils";
import { Button } from "@shared/components/ui/button";
import { SegmentedControl } from "@shared/components/ui/segmented-control";
import { SettingHeading, SettingRow, SettingSection } from "./shared";
import { ModelSelect } from "@shared/components/ModelSelect";
import { CheckboxField } from "./McpSettings";
import { PresetProvidersSection } from "./PresetProvidersSection";
import { SETTINGS_SECTION } from "../registry";

const API_OPTIONS = [
	"openai-completions",
	"openai-responses",
	"azure-openai-responses",
	"openai-codex-responses",
	"anthropic-messages",
	"bedrock-converse-stream",
	"google-generative-ai",
	"google-gemini-cli",
	"google-vertex",
	"nvidia-openai-responses",
	"qwen-openai-completions",
	"zai-openai-completions",
	"zhipu-openai-completions",
].map((api) => ({ value: api, label: api }));

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
	reasoningLevels: string[];
	defaultReasoningLevel: string;
	input: string[];
	contextWindow: string;
	maxTokens: string;
}

const emptyProvider: ProviderFormState = { name: "", baseUrl: "", apiKey: "", api: "openai-completions", headers: "", authHeader: false };
const emptyModel: ModelFormState = { id: "", name: "", api: "", reasoning: false, reasoningLevels: [], defaultReasoningLevel: "", input: ["text"], contextWindow: "", maxTokens: "" };

// 常见档位候选词，点击快速追加；与 api 预设合并去重后展示（已添加的过滤掉）。
const CANDIDATE_REASONING_LEVELS = ["minimal", "low", "medium", "high", "xhigh", "max", "none"];

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
		reasoningLevels: m.reasoningLevels ?? [],
		defaultReasoningLevel: m.defaultReasoningLevel ?? "",
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
	if (form.reasoning) {
		m.reasoning = true;
		// 显式档位覆盖；留空则客户端回退到 api 类型内置预设。
		if (form.reasoningLevels.length > 0) {
			m.reasoningLevels = form.reasoningLevels;
			if (form.defaultReasoningLevel) m.defaultReasoningLevel = form.defaultReasoningLevel;
		}
	}
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
	const { t } = useTranslation("settings");
	return (
		<>
			<div className="grid grid-cols-2 gap-3">
				<div>
					<label className="mb-1 block text-[11px] text-muted-foreground">{t("providerName")}</label>
					<InputField
						value={form.name}
						onChange={(v) => setForm((f) => ({ ...f, name: v }))}
						placeholder="e.g. ollama, lm-studio"
					/>
				</div>
				<div>
					<label className="mb-1 block text-[11px] text-muted-foreground">{t("apiType")}</label>
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
						placeholder={t("apiKeyPlaceholder")}
						type="password"
					/>
				</div>
				<div className="col-span-2">
					<label className="mb-1 block text-[11px] text-muted-foreground">{t("customHeaders")}</label>
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
						label={t("useAuthHeader")}
					/>
				</div>
			</div>
			<div className="mt-3 flex justify-end gap-2">
				<Button variant="ghost" size="sm" onClick={onCancel}>
					{t("cancel")}
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
	const { t } = useTranslation("settings");
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
					<label className="mb-1 block text-[11px] text-muted-foreground">{t("modelId")}</label>
					<InputField
						value={form.id}
						onChange={(v) => setForm((f) => ({ ...f, id: v }))}
						placeholder={t("modelIdPlaceholder")}
					/>
				</div>
				<div>
					<label className="mb-1 block text-[11px] text-muted-foreground">{t("displayName")}</label>
					<InputField
						value={form.name}
						onChange={(v) => setForm((f) => ({ ...f, name: v }))}
						placeholder={t("optional")}
					/>
				</div>
				<div>
					<label className="mb-1 block text-[11px] text-muted-foreground">{t("apiType")}</label>
					<InputField
						value={form.api}
						onChange={(v) => setForm((f) => ({ ...f, api: v }))}
						placeholder={t("inheritedFromProvider")}
					/>
				</div>
				<div>
					<label className="mb-1 block text-[11px] text-muted-foreground">{t("inputCapability")}</label>
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
					<label className="mb-1 block text-[11px] text-muted-foreground">{t("contextWindow")}</label>
					<InputField
						value={form.contextWindow}
						onChange={(v) => setForm((f) => ({ ...f, contextWindow: v }))}
						placeholder={t("contextWindowPlaceholder")}
					/>
				</div>
				<div>
					<label className="mb-1 block text-[11px] text-muted-foreground">{t("maxOutputTokens")}</label>
					<InputField
						value={form.maxTokens}
						onChange={(v) => setForm((f) => ({ ...f, maxTokens: v }))}
						placeholder={t("maxOutputTokensPlaceholder")}
					/>
				</div>
				<div className="col-span-2">
					<CheckboxField
						checked={form.reasoning}
						onChange={(v) => setForm((f) => ({ ...f, reasoning: v }))}
						label={t("supportsReasoning")}
					/>
				</div>
				{form.reasoning && (
				<div className="col-span-2">
					<label className="mb-1 block text-[11px] text-muted-foreground">{t("reasoningLevels")}</label>
					<div className="space-y-1.5">
						{form.reasoningLevels.length === 0 && (
							<p className="text-[11px] text-muted-foreground/70">{t("reasoningLevelsEmpty")}</p>
						)}
						{form.reasoningLevels.map((lvl, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: rows are positional and editable
							<div key={i} className="flex items-center gap-2">
								<InputField
									value={lvl}
									onChange={(v) =>
										setForm((f) => {
											const levels = [...f.reasoningLevels];
											const prev = levels[i];
											levels[i] = v;
											return {
												...f,
												reasoningLevels: levels,
												defaultReasoningLevel: f.defaultReasoningLevel === prev ? v : f.defaultReasoningLevel,
											};
										})
									}
									placeholder="low / medium / high / max"
								/>
								<button
									type="button"
									disabled={!lvl.trim()}
									onClick={() => setForm((f) => ({ ...f, defaultReasoningLevel: lvl }))}
									className={cn(
										"shrink-0 rounded-md border px-2 py-1 text-[11px] transition-colors disabled:opacity-40",
										form.defaultReasoningLevel === lvl && lvl.trim()
											? "border-primary/40 bg-primary/10 text-primary"
											: "border-input text-muted-foreground hover:bg-accent/50",
									)}
								>
									{t("reasoningDefault")}
								</button>
								<button
									type="button"
									onClick={() =>
										setForm((f) => {
											const removed = f.reasoningLevels[i];
											const levels = f.reasoningLevels.filter((_, j) => j !== i);
											return {
												...f,
												reasoningLevels: levels,
												defaultReasoningLevel:
													f.defaultReasoningLevel === removed ? (levels[0] ?? "") : f.defaultReasoningLevel,
											};
										})
									}
									className="shrink-0 rounded-md border border-input px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent/50"
								>
									{t("reasoningRemove")}
								</button>
							</div>
						))}
						<div className="flex gap-2">
							<button
								type="button"
								onClick={() => setForm((f) => ({ ...f, reasoningLevels: [...f.reasoningLevels, ""] }))}
								className="rounded-md border border-input px-2 py-1 text-[11px] text-foreground transition-colors hover:bg-accent/50"
							>
								{t("reasoningAdd")}
							</button>
							{getReasoningPreset(form.api) && (
								<button
									type="button"
									onClick={() => {
										const preset = getReasoningPreset(form.api);
										if (preset)
											setForm((f) => ({
												...f,
												reasoningLevels: [...preset.levels],
												defaultReasoningLevel: preset.default,
											}));
									}}
									className="rounded-md border border-input px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent/50"
								>
									{t("reasoningLoadPreset")}
								</button>
							)}
						</div>
						{(() => {
							const candidates = [
								...new Set([...(getReasoningPreset(form.api)?.levels ?? []), ...CANDIDATE_REASONING_LEVELS]),
							].filter((c) => !form.reasoningLevels.includes(c));
							if (candidates.length === 0) return null;
							return (
								<div className="flex flex-wrap items-center gap-1.5">
									<span className="text-[11px] text-muted-foreground">{t("reasoningCandidates")}</span>
									{candidates.map((c) => (
										<button
											key={c}
											type="button"
											onClick={() =>
												setForm((f) =>
													f.reasoningLevels.includes(c)
														? f
														: { ...f, reasoningLevels: [...f.reasoningLevels, c] },
												)
											}
											className="rounded-full border border-input px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent/50"
										>
											+ {c}
										</button>
									))}
								</div>
							);
						})()}
					</div>
				</div>
				)}
			</div>
			<div className="mt-3 flex justify-end gap-2">
				<Button variant="ghost" size="sm" onClick={onCancel}>
					{t("cancel")}
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
	const { t } = useTranslation("settings");
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
				setJsonError(t("jsonErrorProviders"));
				return;
			}
			setJsonError(null);
			await saveConfig(parsed);
		} catch (e) {
			setJsonError(t("jsonErrorParse") + ": " + (e as Error).message);
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
				<h1 className="mb-6 text-[20px] font-bold text-foreground">{t("modelsTitle")}</h1>
				<div className="flex items-center justify-center py-16">
					<span className="text-[13px] text-muted-foreground">{t("loading")}</span>
				</div>
			</div>
		);
	}

	// 预设模板采纳而来的条目(source:"template")只在「预设服务商」区展示,从手搓「服务商」区隐藏,避免重复。
	const providerNames = Object.keys(config.providers).filter((name) => config.providers[name]?.source !== "template");

	return (
		<div className="mx-auto w-full max-w-[680px] px-8 py-4">
			<div className="mb-6 flex items-center justify-between">
				<h1 className="text-[20px] font-bold text-foreground">{t("modelSettings.title")}</h1>
				<SegmentedControl
					items={[
						{ key: "visual" as ModelsEditMode, label: t("view"), icon: "icon-[mdi--view-list-outline]" },
						{ key: "json" as ModelsEditMode, label: "JSON", icon: "icon-[mdi--code-json]" },
					]}
					value={mode}
					onChange={handleModeSwitch}
				/>
			</div>

			{/* 推理档位改为每模型独立(随输入栏选择、跟 PromptRequest 下发),不再有全局思考等级开关。 */}

			{/* 全局模型:周边任务(autotitle/输入预测等)专用,未设置则周边功能失效 */}
			<SettingSection
				t={t as any}
				section={SETTINGS_SECTION["models-peripheral"]}
				title={t("peripheralModelTitle")}
				description={t("peripheralModelDesc")}
			>
				<SettingRow title={t("peripheralModelTitle")} description={t("peripheralModelHelp")}>
					<ModelSelect
						value={config?.peripheralModel ?? null}
						onChange={(key) => {
							if (config) void saveConfig({ ...config, peripheralModel: key ?? undefined });
						}}
						allowClear
						disabled={saving || !config}
						triggerClassName="min-w-[240px]"
						reasoning={{
							value: config?.peripheralModelReasoningLevel,
							onChange: (level) => {
								if (config) void saveConfig({ ...config, peripheralModelReasoningLevel: level });
							},
						}}
					/>
				</SettingRow>
			</SettingSection>

			{mode === "visual" ? (
				<>
					{/* 预设服务商(BYOK 模板,ADR-0015) */}
					<PresetProvidersSection config={config} saveConfig={saveConfig} />

					{/* Provider list */}
					<SettingSection
						t={t as any}
						section={SETTINGS_SECTION["models-providers"]}
						title={
							<div className="flex items-center justify-between">
								<span>{t("localProviders")}</span>
								{!addingProvider && (
									<button
										type="button"
										onClick={() => {
											setAddingProvider(true);
											setEditingProvider(null);
											setProviderForm({ ...emptyProvider });
										}}
										className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] text-primary transition-colors hover:bg-primary/10"
									>
										<span className="icon-[mdi--plus] h-3.5 w-3.5" />
										{t("addProvider")}
									</button>
								)}
							</div>
						}
					>
						{providerNames.length === 0 && !addingProvider && (
							<div className="px-5 py-8 text-center text-[12px] text-muted-foreground">
								{t("noProvidersAdded")}
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
													{provider.api || "openai-completions"} · {models.length} {t("models")}
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
												title={t("edit")}
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
												title={t("delete")}
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
												saveLabel={t("save")}
											/>
										</div>
									)}

									{/* Expanded: models list */}
									{isExpanded && !isEditing && (
										<div className="border-t border-border bg-secondary/30">
											{models.length === 0 && addingModelFor !== name && (
												<div className="px-5 py-6 text-center text-[12px] text-muted-foreground">
													{t("noCustomModels")}
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
																saveLabel={t("save")}
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
																		{t("default")}
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
																title={isDefault ? t("unsetDefault") : t("setDefault")}
															>
																<span className={`${isDefault ? "icon-[mdi--star]" : "icon-[mdi--star-outline]"} h-3.5 w-3.5`} />
															</button>
															<button
																type="button"
																onClick={() => startEditModel(name, model.id)}
																className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
																title={t("editModel")}
															>
																<span className="icon-[mdi--pencil-outline] h-3 w-3" />
															</button>
															<button
																type="button"
																onClick={() => void handleDeleteModel(name, model.id)}
																className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400"
																title={t("deleteModel")}
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
														saveLabel={t("add")}
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
														{t("addModel")}
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
									saveLabel={t("add")}
								/>
							</div>
						)}
					</SettingSection>
				</>
			) : (
				/* JSON mode */
				<div className="mb-6">
					<div className="mb-3 flex items-center justify-between">
						<SettingHeading t={t as any} section={SETTINGS_SECTION["models-json"]} />
						<Button
							variant="primary"
							size="sm"
							onClick={() => void handleJsonSave()}
							disabled={saving}
						>
							{saving ? t("saving") : t("save")}
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
				{t("configFilePath")}: ~/.vetta/agent/models.json
			</div>
		</div>
	);
}

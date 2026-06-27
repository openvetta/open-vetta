import type { ModelsConfigData } from "@preload/api";
import { SkillPromptArea } from "@domains/chat/components/SkillPromptArea";
import { Input } from "@shared/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/components/ui/select";
import { Switch } from "@shared/components/ui/switch";
import { Textarea } from "@shared/components/ui/textarea";
import {
	type ExecutionModeOverride,
	remoteProvidersAtom,
	type SelectedSkill,
	type SessionExecutionMode,
} from "@shared/store/atoms";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

interface ModelOption {
	provider: string;
	modelId: string;
	displayName: string;
	key: string;
	remote?: boolean;
	tags?: string[];
	supportsImage?: boolean;
}

export interface BatchProjectEditableData {
	name?: string;
	prompt?: string;
	modelKey?: string;
	executionMode?: ExecutionModeOverride;
	concurrency?: number;
	artifactPatterns?: string[];
	notifyEnabled?: boolean;
	timeoutMinutes?: number;
	folders?: string[];
	newFolders?: string[];
	skill?: SelectedSkill | null;
}

interface BatchProjectFormFieldsProps {
	value: BatchProjectEditableData;
	onChange: (value: BatchProjectEditableData) => void;
	namePlaceholder?: string;
	promptMinHeight?: number;
	folderField?: "folders" | "newFolders";
	folderLabel?: string;
	folderEmptyText?: string;
	showFolders?: boolean;
}

export interface BatchProjectApprovalJsonData {
	name?: string;
	prompt?: string;
	modelKey?: string;
	executionMode?: ExecutionModeOverride;
	concurrency?: number;
	artifactPatterns?: string[];
	notifyEnabled?: boolean;
	timeoutMinutes?: number;
	folders?: string[];
	newFolders?: string[];
	skill?: SelectedSkill | null;
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

function compactLines(lines: string[]): string[] {
	return [...new Set(lines.map((line) => line.trim()).filter((line) => line.length > 0))];
}

export function toBatchProjectApprovalJsonData(data: BatchProjectEditableData): BatchProjectApprovalJsonData {
	const result: BatchProjectApprovalJsonData = {};
	if (data.name !== undefined) result.name = data.name;
	if (data.prompt !== undefined) result.prompt = data.prompt;
	if (data.modelKey !== undefined) result.modelKey = data.modelKey;
	if (data.executionMode !== undefined) result.executionMode = data.executionMode;
	if (data.concurrency !== undefined) result.concurrency = normalizeConcurrency(data.concurrency);
	if (data.artifactPatterns !== undefined) result.artifactPatterns = compactLines(data.artifactPatterns);
	if (data.notifyEnabled !== undefined) result.notifyEnabled = data.notifyEnabled;
	if (data.timeoutMinutes !== undefined) result.timeoutMinutes = normalizeTimeout(data.timeoutMinutes);
	if (data.folders !== undefined) result.folders = compactLines(data.folders);
	if (data.newFolders !== undefined) result.newFolders = compactLines(data.newFolders);
	if (data.skill !== undefined) result.skill = data.skill;
	return result;
}

export function normalizeConcurrency(value: number | undefined): number {
	return Number.isFinite(value) && value !== undefined && value > 0 ? Math.floor(value) : 1;
}

export function normalizeTimeout(value: number | undefined): number {
	return Number.isFinite(value) && value !== undefined && value > 0 ? Math.floor(value) : 60;
}

export function BatchProjectFormFields({
	value,
	onChange,
	namePlaceholder,
	promptMinHeight = 120,
	folderField = "folders",
	folderLabel,
	folderEmptyText,
	showFolders = true,
}: BatchProjectFormFieldsProps): JSX.Element {
	const { t } = useTranslation("batch-tasks");
	const namePlaceholderText = namePlaceholder ?? t("form.namePlaceholder");
	const folderLabelText = folderLabel ?? t("form.folderLabel");
	const folderEmptyTextValue = folderEmptyText ?? t("form.folderEmpty");
	const remoteProviders = useAtomValue(remoteProvidersAtom);
	const [defaultExecutionMode, setDefaultExecutionMode] = useState<SessionExecutionMode>("full-access");
	const [sandboxUnavailableReason, setSandboxUnavailableReason] = useState<string | null>(null);
	const [config, setConfig] = useState<ModelsConfigData | null>(null);
	const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
	const [folderInputMode, setFolderInputMode] = useState<"picker" | "textarea">("picker");
	const modelDropdownRef = useRef<HTMLDivElement>(null);

	const set = <Key extends keyof BatchProjectEditableData>(
		key: Key,
		nextValue: BatchProjectEditableData[Key],
	): void => {
		onChange({ ...value, [key]: nextValue });
	};

	const folders = value[folderField] ?? [];
	const artifactPatternsText = (value.artifactPatterns ?? []).join("\n");
	const folderText = folders.join("\n");

	useEffect(() => {
		void window.vetta.config.get().then((desktopConfig) => {
			setDefaultExecutionMode(desktopConfig.defaultExecutionMode ?? "full-access");
			const capability = desktopConfig.sandbox ?? desktopConfig.linuxSandbox;
			if (capability?.status === "unavailable") {
				const reason = capability.reason ?? "unknown_error";
				const platform = "platform" in capability ? capability.platform : "linux";
				setSandboxUnavailableReason(t("form.sandboxUnavailable", { platform, reason }));
				return;
			}
			setSandboxUnavailableReason(null);
		});
		void window.vetta.models.get().then(setConfig);
	}, [t]);

	useEffect(() => {
		if (!modelDropdownOpen) return;
		function handleClick(event: MouseEvent): void {
			if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Node)) {
				setModelDropdownOpen(false);
			}
		}
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, [modelDropdownOpen]);

	const models = useMemo(() => {
		const localModels = config ? flattenModels(config) : [];
		const remoteModels = Object.keys(remoteProviders).length > 0
			? flattenModels({ providers: remoteProviders as ModelsConfigData["providers"] }, true)
			: [];
		const localKeys = new Set(localModels.map((model) => model.key));
		return [...localModels, ...remoteModels.filter((model) => !localKeys.has(model.key))];
	}, [config, remoteProviders]);

	const groupedModels = useMemo(() => {
		const map = new Map<string, ModelOption[]>();
		for (const model of models) {
			const list = map.get(model.provider) ?? [];
			list.push(model);
			map.set(model.provider, list);
		}
		return map;
	}, [models]);

	const selectedOption = models.find((model) => model.key === value.modelKey);

	const handleSelectFolders = useCallback(() => {
		void (async () => {
			const selected = await window.vetta.dialog.selectFolders();
			if (selected.length > 0) {
				set(folderField, compactLines([...folders, ...selected]));
			}
		})();
	}, [folderField, folders, set]);

	const handleFolderTextChange = useCallback(
		(nextValue: string) => {
			set(folderField, compactLines(nextValue.split(/\r?\n/)));
		},
		[folderField, set],
	);

	const handleRemoveFolder = useCallback(
		(folder: string) => {
			set(folderField, folders.filter((candidate) => candidate !== folder));
		},
		[folderField, folders, set],
	);

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-3">
				<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-inset ring-primary/20">
					<span className="icon-[mdi--layers-outline] h-4 w-4 text-primary" />
				</div>
				<Input
					value={value.name ?? ""}
					onChange={(event) => set("name", event.target.value)}
					className="h-8 w-full border-none bg-transparent text-[15px] font-semibold text-foreground placeholder:text-muted-foreground/40 focus:outline-none! focus-visible:outline-none!"
					placeholder={namePlaceholderText}
					autoFocus
				/>
			</div>

			<SkillPromptArea
				prompt={value.prompt ?? ""}
				onPromptChange={(prompt) => set("prompt", prompt)}
				skill={value.skill ?? null}
				onSkillChange={(skill) => set("skill", skill)}
				placeholder={t("form.promptPlaceholder")}
				minHeight={promptMinHeight}
			/>

			<div>
				<label className="mb-2 flex items-center justify-between text-sm font-medium text-foreground">
					<span>{t("form.model")}</span>
				</label>
				<div ref={modelDropdownRef} className="relative">
					<button
						type="button"
						onClick={() => setModelDropdownOpen((open) => !open)}
						className="flex w-full items-center gap-2 rounded-md border border-border px-3 py-2 text-left text-sm transition-colors hover:bg-accent/50"
					>
						<span className="icon-[mdi--brain] h-4 w-4 shrink-0 text-muted-foreground" />
						<span className="min-w-0 flex-1 truncate">
							{selectedOption?.displayName ?? (models.length === 0 ? t("form.modelEmpty") : t("form.modelSelect"))}
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
								{[...groupedModels.entries()].map(([provider, providerModels]) => (
									<div key={provider}>
										<div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
											{provider}
										</div>
										{providerModels.map((model) => {
											const isSelected = model.key === value.modelKey;
											const isDefault = model.key === config?.defaultModel;
											return (
												<button
													key={model.key}
													type="button"
													onClick={() => {
														set("modelKey", model.key);
														setModelDropdownOpen(false);
													}}
													className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors ${
														isSelected
															? "bg-primary/10 text-primary"
															: "text-foreground hover:bg-accent/50"
													}`}
												>
													<span className="min-w-0 flex-1 truncate">{model.displayName}</span>
													{model.supportsImage && (
														<span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">
															vision
														</span>
													)}
													{model.tags?.map((tag) => (
														<span key={tag} className="shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
															{tag.trim()}
														</span>
													))}
													{model.remote && (
														<span className="shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-medium text-emerald-400">
															remote
														</span>
													)}
													{isDefault && (
														<span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium text-primary">
															{t("form.defaultTag")}
														</span>
													)}
													{isSelected && <span className="icon-[mdi--check] h-3.5 w-3.5 shrink-0" />}
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

			<div className="flex items-end gap-6">
				<div>
					<label className="mb-2 flex items-center justify-between text-sm font-medium text-foreground">
						<span>{t("form.concurrency")}</span>
					</label>
					<Select
						value={String(normalizeConcurrency(value.concurrency))}
						onValueChange={(nextValue) => set("concurrency", Number(nextValue))}
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
						<span>{t("form.timeout")}</span>
					</label>
					<Input
						type="number"
						min={1}
						step={1}
						value={String(normalizeTimeout(value.timeoutMinutes))}
						onChange={(event) => {
							const nextValue = Number(event.target.value);
							set("timeoutMinutes", normalizeTimeout(nextValue));
						}}
						className="h-9 w-28"
					/>
				</div>
			</div>
			<p className="text-xs text-muted-foreground/60">
				{t("form.timeoutHint")}
			</p>

			<div>
				<label className="mb-2 flex items-center justify-between text-sm font-medium text-foreground">
					<span>{t("form.sandbox")}</span>
				</label>
				<Select
					value={value.executionMode ?? "full-access"}
					onValueChange={(nextValue) => set("executionMode", nextValue as ExecutionModeOverride)}
				>
					<SelectTrigger className="w-48">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="inherit">
							{t("form.sandboxInherit", {
								mode: defaultExecutionMode === "sandbox" ? t("form.useSandbox") : t("form.fullAccess"),
							})}
						</SelectItem>
						<SelectItem value="full-access">{t("form.fullAccess")}</SelectItem>
						<SelectItem
							value="sandbox"
							disabled={Boolean(sandboxUnavailableReason)}
							title={sandboxUnavailableReason ?? undefined}
						>
							{t("form.useSandbox")}
						</SelectItem>
					</SelectContent>
				</Select>
			</div>

			<div className="flex items-start justify-between gap-4 rounded-md border border-border bg-muted/30 px-3 py-2.5">
				<div className="min-w-0">
					<div className="text-sm font-medium text-foreground">{t("form.notifyTitle")}</div>
					<div className="mt-0.5 text-xs text-muted-foreground/80">
						{t("form.notifyDesc")}
					</div>
				</div>
				<Switch checked={value.notifyEnabled ?? false} onCheckedChange={(checked) => set("notifyEnabled", checked)} />
			</div>

			<div>
				<label className="mb-2 flex items-center justify-between text-sm font-medium text-foreground">
					<span>{t("form.artifact")}</span>
					<span className="text-xs font-normal text-muted-foreground/60">{t("form.optional")}</span>
				</label>
				<Textarea
					value={artifactPatternsText}
					onChange={(event) => set("artifactPatterns", compactLines(event.target.value.split(/\r?\n/)))}
					className="min-h-[72px] text-sm"
					placeholder={t("form.artifactPlaceholder")}
				/>
				<p className="mt-2 text-xs text-muted-foreground/60">
					{t("form.artifactHint")}
				</p>
			</div>

			{showFolders && (
				<div>
					<div className="mb-2 flex items-center justify-between gap-3">
						<p className="text-sm font-medium text-foreground">{folderLabelText}</p>
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
								{t("form.folderModePicker")}
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
								{t("form.folderModeText")}
							</button>
						</div>
					</div>
					{folderInputMode === "picker" ? (
						<button
							type="button"
							onClick={handleSelectFolders}
							className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
						>
							{t("form.selectFolder")}
						</button>
					) : (
						<>
							<Textarea
								value={folderText}
								onChange={(event) => handleFolderTextChange(event.target.value)}
								className="min-h-[96px] text-sm"
								placeholder={"/path/to/project-a\n/path/to/project-b"}
							/>
							<p className="mt-2 text-xs text-muted-foreground/60">
								{t("form.folderTextHint")}
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
						<p className="mt-3 text-xs text-muted-foreground/50">{folderEmptyTextValue}</p>
					)}
				</div>
			)}
		</div>
	);
}

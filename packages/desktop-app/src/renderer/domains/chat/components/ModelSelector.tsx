import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef, useState, useCallback } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { ModelsConfigData } from "@preload/api";
import { selectedModelAtom, activeSessionAtom, remoteProvidersAtom, modelSupportsImagesAtom } from "@shared/store/atoms";
import { ProviderIcon } from "@shared/components/provider-icon";

interface ModelOption {
	provider: string;
	modelId: string;
	displayName: string;
	/** "provider/modelId" */
	key: string;
	/** Whether this model comes from the remote server */
	remote?: boolean;
	/** Tags from server config */
	tags?: string[];
	/** Whether this model supports image input */
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

export function ModelSelector(): JSX.Element {
	const [selectedModel, setSelectedModel] = useAtom(selectedModelAtom);
	const activeSession = useAtomValue(activeSessionAtom);
	const remoteProviders = useAtomValue(remoteProvidersAtom);
	const setModelSupportsImages = useSetAtom(modelSupportsImagesAtom);
	const [open, setOpen] = useState(false);
	const [config, setConfig] = useState<ModelsConfigData | null>(null);
	const ref = useRef<HTMLDivElement>(null);

	// Load models config
	useEffect(() => {
		void window.vetta.models.get().then((c) => {
			setConfig(c);
			// If no model selected yet, use default from config
			if (!selectedModel && c.defaultModel) {
				setSelectedModel(c.defaultModel);
				localStorage.setItem("vetta-selected-model", c.defaultModel);
			}
		});
	}, []);

	// Close on outside click
	useEffect(() => {
		if (!open) return;
		function handleClick(e: MouseEvent) {
			if (ref.current && !ref.current.contains(e.target as Node)) {
				setOpen(false);
			}
		}
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, [open]);

	// Merge local + remote models (remote models appended, local takes precedence for same key)
	const localModels = config ? flattenModels(config) : [];
	const remoteModels = Object.keys(remoteProviders).length > 0
		? flattenModels({ providers: remoteProviders as ModelsConfigData["providers"] }, true)
		: [];
	const localKeys = new Set(localModels.map((m) => m.key));
	const models = [...localModels, ...remoteModels.filter((m) => !localKeys.has(m.key))];
	const selectedOption = models.find((m) => m.key === selectedModel);

	// 模型列表/选中项变化时，同步图片支持状态。
	// 修复首次启动进入欢迎页时，atom 默认 true 导致非视觉模型的图片按钮可点的问题。
	useEffect(() => {
		if (!selectedModel || models.length === 0) return;
		setModelSupportsImages(selectedOption?.supportsImage ?? false);
	}, [selectedModel, selectedOption?.supportsImage, models.length, setModelSupportsImages]);

	const handleSelect = useCallback(
		(key: string) => {
			setSelectedModel(key);
			localStorage.setItem("vetta-selected-model", key);
			setOpen(false);

			// 更新图片支持状态
			const selected = models.find((m) => m.key === key);
			setModelSupportsImages(selected?.supportsImage ?? false);

			// Notify backend to switch model on the active session
			if (activeSession?.runtimeId) {
				void window.vetta.session.updateSettings(activeSession.runtimeId, { modelKey: key });
			}
		},
		[setSelectedModel, setModelSupportsImages, activeSession, models],
	);

	// 供应商图标 symbol:本地 config / 远程 providers 的 icon 字段
	const iconFor = (provider: string): string | undefined => {
		const local = config?.providers[provider] as { icon?: string } | undefined;
		const remote = (remoteProviders as Record<string, { icon?: string }>)[provider];
		return local?.icon ?? remote?.icon;
	};

	// 供应商显示名(分组标题用):优先 config / 远程的 displayName,回退到 provider 标识 key
	const labelFor = (provider: string): string => {
		const local = config?.providers[provider] as { displayName?: string } | undefined;
		const remote = (remoteProviders as Record<string, { displayName?: string }>)[provider];
		if (local?.displayName) return local.displayName;
		if (remote?.displayName) return remote.displayName;
		if (provider === "vetta-zen") return "Vetta Zen";
		if (provider === "vetta-go") return "Vetta Go";
		return provider;
	};

	// Group models by provider
	const grouped = new Map<string, ModelOption[]>();
	for (const m of models) {
		const list = grouped.get(m.provider) ?? [];
		list.push(m);
		grouped.set(m.provider, list);
	}

	if (models.length === 0) return <></>;

	return (
		<div ref={ref} className="relative">
			{/* Trigger button */}
			<motion.button
				type="button"
				onClick={() => setOpen((v) => !v)}
				whileHover={{ y: -1 }}
				whileTap={{ scale: 0.96 }}
				transition={{ type: "spring", stiffness: 480, damping: 28 }}
				className={`flex min-w-0 max-w-full items-center gap-1 rounded-full border px-2 py-1 text-[11px] transition-colors ${
					open
						? "border-primary/30 bg-primary/10 text-primary"
						: "border-transparent bg-transparent text-muted-foreground hover:border-border/60 hover:bg-accent/50 hover:text-foreground"
				}`}
			>
				{selectedOption && <ProviderIcon symbol={iconFor(selectedOption.provider)} className="h-3.5 w-3.5" />}
				<span className="min-w-0 max-w-[80px] truncate sm:max-w-[120px] md:max-w-[160px]">
					{selectedOption?.displayName ?? "选择模型"}
				</span>
				<motion.span
					className="icon-[solar--alt-arrow-down-linear] h-3 w-3 shrink-0"
					animate={{ rotate: open ? 180 : 0 }}
					transition={{ duration: 0.18 }}
				/>
			</motion.button>

			{/* Dropdown */}
			<AnimatePresence>
				{open && (
					<motion.div
						initial={{ opacity: 0, y: 6, scale: 0.97 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0, y: 6, scale: 0.97 }}
						transition={{ duration: 0.16, ease: [0.22, 0.61, 0.36, 1] }}
						className="absolute bottom-full right-0 z-50 mb-2 min-w-[220px] max-w-[300px] origin-bottom-right overflow-hidden rounded-xl border border-border/80 shadow-xl backdrop-blur"
						style={{ background: "color-mix(in srgb, var(--popover) 96%, transparent)" }}
					>
						<div className="max-h-[280px] overflow-y-auto py-1">
							{[...grouped.entries()].map(([provider, providerModels]) => (
								<div key={provider}>
									{/* Provider header */}
									<div className="flex items-center gap-1.5 px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
										<ProviderIcon symbol={iconFor(provider)} className="h-3 w-3" />
										{labelFor(provider)}
									</div>
									{providerModels.map((m) => {
										const isSelected = m.key === selectedModel;
										const isDefault = m.key === config?.defaultModel;
										return (
											<button
												key={m.key}
												type="button"
												onClick={() => handleSelect(m.key)}
												className={`relative flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors ${
													isSelected
														? "bg-primary/10 text-primary"
														: "text-foreground hover:bg-accent/50"
												}`}
											>
												{isSelected && (
													<motion.span
														layoutId="model-active-marker"
														className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary"
														transition={{ type: "spring", stiffness: 480, damping: 30 }}
													/>
												)}
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
												{isDefault && (
													<span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium text-primary">
														默认
													</span>
												)}
												{isSelected && (
													<span className="icon-[solar--check-circle-linear] h-3.5 w-3.5 shrink-0" />
												)}
											</button>
										);
									})}
								</div>
							))}
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

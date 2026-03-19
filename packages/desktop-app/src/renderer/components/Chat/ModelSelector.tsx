import { useAtom, useAtomValue } from "jotai";
import { useEffect, useRef, useState, useCallback } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { ModelsConfigData } from "../../../../preload/api.js";
import { selectedModelAtom, activeSessionAtom } from "../../store/atoms";

interface ModelOption {
	provider: string;
	modelId: string;
	displayName: string;
	/** "provider/modelId" */
	key: string;
}

function flattenModels(config: ModelsConfigData): ModelOption[] {
	const result: ModelOption[] = [];
	for (const [provider, providerConfig] of Object.entries(config.providers)) {
		for (const model of providerConfig.models ?? []) {
			result.push({
				provider,
				modelId: model.id,
				displayName: model.name || model.id,
				key: `${provider}/${model.id}`,
			});
		}
	}
	return result;
}

export function ModelSelector(): JSX.Element {
	const [selectedModel, setSelectedModel] = useAtom(selectedModelAtom);
	const activeSession = useAtomValue(activeSessionAtom);
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

	const models = config ? flattenModels(config) : [];
	const selectedOption = models.find((m) => m.key === selectedModel);

	const handleSelect = useCallback(
		(key: string) => {
			setSelectedModel(key);
			localStorage.setItem("vetta-selected-model", key);
			setOpen(false);
			// Notify backend to switch model on the active session
			if (activeSession?.runtimeId) {
				void window.vetta.session.updateSettings(activeSession.runtimeId, { modelKey: key });
			}
		},
		[setSelectedModel, activeSession],
	);

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
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-[var(--text-2)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text-1)]"
			>
				<span className="icon-[mdi--brain] h-3.5 w-3.5 shrink-0" />
				<span className="max-w-[120px] truncate">
					{selectedOption?.displayName ?? "选择模型"}
				</span>
				<span className="icon-[mdi--chevron-down] h-3 w-3 shrink-0" />
			</button>

			{/* Dropdown */}
			<AnimatePresence>
				{open && (
					<motion.div
						initial={{ opacity: 0, y: 4, scale: 0.98 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0, y: 4, scale: 0.98 }}
						transition={{ duration: 0.12, ease: [0.25, 0.1, 0.25, 1] }}
						className="absolute bottom-full right-0 z-50 mb-1.5 min-w-[200px] max-w-[280px] overflow-hidden rounded-xl border border-[var(--border)] shadow-lg"
						style={{ background: "var(--content-bg)" }}
					>
						<div className="max-h-[280px] overflow-y-auto py-1">
							{[...grouped.entries()].map(([provider, providerModels]) => (
								<div key={provider}>
									{/* Provider header */}
									<div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)]">
										{provider}
									</div>
									{providerModels.map((m) => {
										const isSelected = m.key === selectedModel;
										const isDefault = m.key === config?.defaultModel;
										return (
											<button
												key={m.key}
												type="button"
												onClick={() => handleSelect(m.key)}
												className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors ${
													isSelected
														? "bg-[var(--accent)]/10 text-[var(--accent)]"
														: "text-[var(--text-1)] hover:bg-[var(--hover)]"
												}`}
											>
												<span className="min-w-0 flex-1 truncate">
													{m.displayName}
												</span>
												{isDefault && (
													<span className="shrink-0 rounded-full bg-[var(--accent)]/15 px-1.5 py-0.5 text-[9px] font-medium text-[var(--accent)]">
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
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

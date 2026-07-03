import { ProviderIcon } from "@shared/components/provider-icon";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@shared/components/ui/dropdown-menu";
import { MultiplierTag } from "@shared/components/ModelSelect/MultiplierTag";
import { resolveReasoning } from "@shared/components/ModelSelect/resolveReasoning";
import { useModelOptions } from "@shared/components/ModelSelect/useModelOptions";
import { cn } from "@shared/lib/utils";
import { activeSessionAtom, modelSupportsImagesAtom, reasoningByModelAtom, selectedModelAtom } from "@shared/store/atoms";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";

/**
 * Combined chat model + reasoning-level picker. The primary menu is the model list;
 * a "推理档位" entry at the top opens a hover submenu on the right to pick the level
 * (including "off" to disable thinking). Reasoning is per-model: each model remembers
 * its last-chosen level (reasoningByModelAtom) and the value rides the prompt.
 */
export function ModelSelector(): JSX.Element {
	const { t } = useTranslation("common");
	const [selectedModel, setSelectedModel] = useAtom(selectedModelAtom);
	const [reasoningByModel, setReasoningByModel] = useAtom(reasoningByModelAtom);
	const activeSession = useAtomValue(activeSessionAtom);
	const setModelSupportsImages = useSetAtom(modelSupportsImagesAtom);
	const { options, grouped, defaultKey, iconFor, labelFor } = useModelOptions();

	const selectedOption = useMemo(() => options.find((m) => m.key === selectedModel) ?? null, [options, selectedModel]);
	const resolved = useMemo(() => resolveReasoning(selectedOption), [selectedOption]);

	// "off" (disable thinking) is always offered for reasoning-capable models, on top of
	// the model's configured/preset levels. It rides the prompt as reasoning:"off" and the
	// agent maps it to "no reasoning" (DeepSeek → thinking:{type:"disabled"}).
	const menuLevels = useMemo(() => (resolved ? ["off", ...resolved.levels] : []), [resolved]);
	const isValidLevel = useCallback(
		(v: string) => v === "off" || (resolved?.levels.includes(v) ?? false),
		[resolved],
	);

	const currentLevel = useMemo(() => {
		if (!selectedModel || !resolved) return undefined;
		const remembered = reasoningByModel[selectedModel];
		return remembered && isValidLevel(remembered) ? remembered : resolved.default;
	}, [selectedModel, resolved, reasoningByModel, isValidLevel]);

	const levelLabel = useCallback(
		(value: string) => t(`modelSelect.reasoningLevel.${value}`, { defaultValue: value }),
		[t],
	);

	// Auto-apply the configured default model when nothing is selected yet.
	useEffect(() => {
		if (!selectedModel && defaultKey) {
			setSelectedModel(defaultKey);
			localStorage.setItem("vetta-selected-model", defaultKey);
		}
	}, [selectedModel, defaultKey, setSelectedModel]);

	// Keep image-support flag in sync with the resolved selection.
	useEffect(() => {
		if (options.length === 0) return;
		setModelSupportsImages(selectedOption?.supportsImage ?? false);
	}, [options.length, selectedOption, setModelSupportsImages]);

	// Persist the effective default level for the selected model when none is remembered,
	// so the prompt sender always has a value to send (per-model memory seeded with default).
	useEffect(() => {
		if (!selectedModel || !resolved) return;
		const remembered = reasoningByModel[selectedModel];
		if (!remembered || !isValidLevel(remembered)) {
			setReasoningByModel({ ...reasoningByModel, [selectedModel]: resolved.default });
		}
	}, [selectedModel, resolved, reasoningByModel, setReasoningByModel, isValidLevel]);

	const handleModelSelect = useCallback(
		(key: string) => {
			setSelectedModel(key);
			if (activeSession?.runtimeId) {
				void window.vetta.session.updateSettings(activeSession.runtimeId, { modelKey: key });
			}
		},
		[setSelectedModel, activeSession],
	);

	const handleReasoningSelect = useCallback(
		(value: string) => {
			if (!selectedModel) return;
			setReasoningByModel({ ...reasoningByModel, [selectedModel]: value });
		},
		[selectedModel, reasoningByModel, setReasoningByModel],
	);

	if (options.length === 0) return <></>;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className={cn(
						"flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-transparent px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:outline-none data-[state=open]:bg-accent/60 data-[state=open]:text-foreground",
					)}
				>
					{selectedOption && <ProviderIcon symbol={iconFor(selectedOption.provider)} className="h-3.5 w-3.5" />}
					<span className="min-w-0 flex-1 truncate text-left">
						{selectedOption?.displayName ?? t("modelSelect.placeholder")}
					</span>
					{currentLevel && <span className="shrink-0 text-muted-foreground">{levelLabel(currentLevel)}</span>}
					<span className="icon-[solar--alt-arrow-down-linear] h-3 w-3 shrink-0" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				className="max-h-[300px] min-w-[220px] max-w-[320px]"
				style={{ overflowX: "hidden", overflowY: "auto" }}
			>
				{resolved && (
					<>
						<DropdownMenuSub>
							<DropdownMenuSubTrigger>
								<span className="min-w-0 flex-1 truncate">{t("modelSelect.reasoningHeader")}</span>
								{currentLevel && (
									<span className="shrink-0 text-muted-foreground">{levelLabel(currentLevel)}</span>
								)}
							</DropdownMenuSubTrigger>
							<DropdownMenuSubContent className="min-w-[160px]">
								<DropdownMenuLabel>{t("modelSelect.reasoningHeader")}</DropdownMenuLabel>
								{menuLevels.map((level) => (
									<DropdownMenuItem key={level} onSelect={() => handleReasoningSelect(level)}>
										<span className="min-w-0 flex-1 truncate">{levelLabel(level)}</span>
										{level === currentLevel && (
											<span className="icon-[solar--check-circle-linear] h-3.5 w-3.5 shrink-0" />
										)}
									</DropdownMenuItem>
								))}
							</DropdownMenuSubContent>
						</DropdownMenuSub>
						<DropdownMenuSeparator />
					</>
				)}
				<DropdownMenuLabel>{t("modelSelect.modelHeader")}</DropdownMenuLabel>
				{[...grouped.entries()].map(([provider, providerModels]) => (
					<div key={provider}>
						<div className="flex items-center gap-1.5 px-3 pb-0.5 pt-1.5 text-[10px] font-medium text-muted-foreground/50">
							<ProviderIcon symbol={iconFor(provider)} className="h-3 w-3" />
							{labelFor(provider)}
							{providerModels[0]?.remote && (
								<span className="rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[9px] font-medium text-blue-400">
									{t("modelSelect.cloudOnly")}
								</span>
							)}
						</div>
						{providerModels.map((m) => (
							<DropdownMenuItem key={m.key} onSelect={() => handleModelSelect(m.key)}>
								<span className="min-w-0 flex-1 truncate">{m.displayName}</span>
								<MultiplierTag multiplier={m.multiplier} />
								{m.supportsImage && (
									<span className="shrink-0 rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[9px] font-medium text-blue-400">
										{t("modelSelect.visionBadge")}
									</span>
								)}
								{m.key === defaultKey && (
									<span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium text-primary">
										{t("modelSelect.defaultBadge")}
									</span>
								)}
								{m.key === selectedModel && (
									<span className="icon-[solar--check-circle-linear] h-3.5 w-3.5 shrink-0" />
								)}
							</DropdownMenuItem>
						))}
					</div>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

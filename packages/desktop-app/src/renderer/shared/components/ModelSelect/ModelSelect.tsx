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
import { cn } from "@shared/lib/utils";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { MultiplierTag } from "./MultiplierTag";
import { resolveReasoning } from "./resolveReasoning";
import { type ModelOption, useModelOptions } from "./useModelOptions";

/** Optional reasoning-level submenu for a model picker. Controlled by the caller. */
export interface ModelSelectReasoning {
	/** Currently chosen level value, or undefined to fall back to the model default */
	value: string | undefined;
	/** Fired when the user picks a level */
	onChange: (level: string) => void;
}

export interface ModelSelectProps {
	/** Currently selected key ("provider/modelId"), or null when unset */
	value: string | null;
	/** Fired on selection; null only when allowClear and the user clears */
	onChange: (key: string | null) => void;
	/** Show an explicit "unset" entry so the selection can be cleared */
	allowClear?: boolean;
	disabled?: boolean;
	/** Trigger text when nothing is selected (defaults to common placeholder) */
	placeholder?: string;
	/** Extra classes for the trigger button (sizing/shape per call site) */
	triggerClassName?: string;
	/** When value is empty, auto-apply the configured default model once */
	autoSelectDefault?: boolean;
	/** Fires whenever the resolved selected option changes (load + change) */
	onSelectedOptionChange?: (option: ModelOption | null) => void;
	/** When set, adds a hover "推理" submenu to pick the selected model's reasoning level. */
	reasoning?: ModelSelectReasoning;
}

/**
 * Shared rich model picker (grouped DropdownMenu with provider icons + capability
 * badges + right-aligned check). Controlled via value/onChange so it backs the chat
 * input, the global peripheral-model setting, Claw and the knowledge base alike.
 * Optionally shows a reasoning-level submenu (per the reasoning-level design).
 * Renders in a portal so it escapes any `overflow-hidden` ancestor.
 */
export function ModelSelect({
	value,
	onChange,
	allowClear = false,
	disabled = false,
	placeholder,
	triggerClassName,
	autoSelectDefault = false,
	onSelectedOptionChange,
	reasoning,
}: ModelSelectProps): JSX.Element {
	const { t } = useTranslation("common");
	const { options, grouped, defaultKey, iconFor, labelFor } = useModelOptions();

	const selectedOption = options.find((m) => m.key === value) ?? null;
	const resolved = useMemo(() => resolveReasoning(selectedOption), [selectedOption]);

	// "off" (disable thinking) is always offered on top of the model's configured levels.
	const menuLevels = useMemo(() => (resolved ? ["off", ...resolved.levels] : []), [resolved]);
	const isValidLevel = (v: string | undefined): v is string =>
		!!v && (v === "off" || (resolved?.levels.includes(v) ?? false));
	const currentLevel = resolved
		? isValidLevel(reasoning?.value)
			? reasoning?.value
			: resolved.default
		: undefined;
	const levelLabel = (v: string) => t(`modelSelect.reasoningLevel.${v}`, { defaultValue: v });

	// Auto-apply the configured default when nothing is selected yet (chat input).
	useEffect(() => {
		if (!autoSelectDefault) return;
		if (!value && defaultKey) onChange(defaultKey);
	}, [autoSelectDefault, value, defaultKey, onChange]);

	// Surface the resolved selected option to consumers (e.g. image support).
	useEffect(() => {
		if (options.length === 0) return;
		onSelectedOptionChange?.(selectedOption);
	}, [selectedOption, options.length, onSelectedOptionChange]);

	if (options.length === 0 && !allowClear) return <></>;

	const showReasoning = !!reasoning && !!resolved;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild disabled={disabled}>
				<button
					type="button"
					className={cn(
						"flex min-w-0 max-w-full items-center gap-1.5 rounded-md border border-input bg-transparent px-2 py-1 text-[12px] text-foreground transition-colors hover:border-border/60 hover:bg-accent/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=open]:border-primary/30 data-[state=open]:bg-primary/10 data-[state=open]:text-primary",
						triggerClassName,
					)}
				>
					{selectedOption && <ProviderIcon symbol={iconFor(selectedOption.provider)} className="h-3.5 w-3.5" />}
					<span className="min-w-0 flex-1 truncate text-left">
						{selectedOption?.displayName ?? placeholder ?? t("modelSelect.placeholder")}
					</span>
					{selectedOption && <MultiplierTag multiplier={selectedOption.multiplier} />}
					{showReasoning && currentLevel && (
						<span className="shrink-0 text-muted-foreground">{levelLabel(currentLevel)}</span>
					)}
					<span className="icon-[solar--alt-arrow-down-linear] h-3 w-3 shrink-0" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				className="max-h-[380px] min-w-[220px] max-w-[320px]"
				style={{ overflowX: "hidden", overflowY: "auto" }}
			>
				{showReasoning && (
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
									<DropdownMenuItem key={level} onSelect={() => reasoning?.onChange(level)}>
										<span className="min-w-0 flex-1 truncate">{levelLabel(level)}</span>
										{level === currentLevel && (
											<span className="icon-[solar--check-circle-linear] h-3.5 w-3.5 shrink-0" />
										)}
									</DropdownMenuItem>
								))}
							</DropdownMenuSubContent>
						</DropdownMenuSub>
						<DropdownMenuSeparator />
						<DropdownMenuLabel>{t("modelSelect.modelHeader")}</DropdownMenuLabel>
					</>
				)}
				{allowClear && (
					<DropdownMenuItem onSelect={() => onChange(null)}>
						<span className="min-w-0 flex-1 truncate text-muted-foreground">{t("modelSelect.unset")}</span>
						{value == null && <span className="icon-[solar--check-circle-linear] h-3.5 w-3.5 shrink-0" />}
					</DropdownMenuItem>
				)}
				{[...grouped.entries()].map(([provider, providerModels]) => (
					<div key={provider}>
						<DropdownMenuLabel className="flex items-center gap-1.5">
							<ProviderIcon symbol={iconFor(provider)} className="h-3 w-3" />
							{labelFor(provider)}
							{providerModels[0]?.remote && (
								<span className="rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[9px] font-medium text-blue-400">
									{t("modelSelect.cloudOnly")}
								</span>
							)}
						</DropdownMenuLabel>
						{providerModels.map((m) => (
							<DropdownMenuItem key={m.key} onSelect={() => onChange(m.key)}>
								<span className="min-w-0 flex-1 truncate">{m.displayName}</span>
								<MultiplierTag multiplier={m.multiplier} />
								{m.supportsImage && (
									<span className="shrink-0 rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[9px] font-medium text-blue-400">
										{t("modelSelect.visionBadge")}
									</span>
								)}
								{m.tags?.map((tag) => (
									<span
										key={tag}
										className="shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground"
									>
										{tag.trim()}
									</span>
								))}
								{m.key === defaultKey && (
									<span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium text-primary">
										{t("modelSelect.defaultBadge")}
									</span>
								)}
								{m.key === value && <span className="icon-[solar--check-circle-linear] h-3.5 w-3.5 shrink-0" />}
							</DropdownMenuItem>
						))}
					</div>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

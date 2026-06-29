import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { cn } from "@shared/lib/utils";
import { ProviderIcon } from "@shared/components/provider-icon";
import { Popover, PopoverContent, PopoverTrigger } from "@shared/components/ui/popover";
import { useModelOptions, type ModelOption } from "./useModelOptions";

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
}

/**
 * Shared rich model picker (grouped popover with provider icons + capability
 * badges). Controlled via value/onChange so it can back the chat input,
 * the global peripheral-model setting, Claw and the knowledge base alike.
 *
 * Built on the Radix popover so the dropdown renders in a portal — it escapes
 * any `overflow-hidden` ancestor (e.g. settings cards) and auto-flips to stay
 * on screen.
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
}: ModelSelectProps): JSX.Element {
	const { t } = useTranslation("common");
	const { options, grouped, defaultKey, iconFor, labelFor } = useModelOptions();
	const [open, setOpen] = useState(false);

	const selectedOption = options.find((m) => m.key === value) ?? null;

	// Auto-apply the configured default when nothing is selected yet (chat input).
	useEffect(() => {
		if (!autoSelectDefault) return;
		if (!value && defaultKey) onChange(defaultKey);
	}, [autoSelectDefault, value, defaultKey, onChange]);

	// Surface the resolved selected option to consumers (e.g. image support).
	useEffect(() => {
		if (options.length === 0) return;
		onSelectedOptionChange?.(selectedOption);
	}, [value, selectedOption, options.length, onSelectedOptionChange]);

	const handleSelect = (key: string | null) => {
		onChange(key);
		setOpen(false);
	};

	if (options.length === 0 && !allowClear) return <></>;

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild disabled={disabled}>
				<motion.button
					type="button"
					whileHover={disabled ? undefined : { y: -1 }}
					whileTap={disabled ? undefined : { scale: 0.96 }}
					transition={{ type: "spring", stiffness: 480, damping: 28 }}
					className={cn(
						"flex min-w-0 max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-50",
						open
							? "border-primary/30 bg-primary/10 text-primary"
							: "border-input bg-transparent text-foreground hover:border-border/60 hover:bg-accent/50",
						triggerClassName,
					)}
				>
					{selectedOption && <ProviderIcon symbol={iconFor(selectedOption.provider)} className="h-3.5 w-3.5" />}
					<span className="min-w-0 flex-1 truncate text-left">
						{selectedOption?.displayName ?? placeholder ?? t("modelSelect.placeholder")}
					</span>
					<motion.span
						className="icon-[solar--alt-arrow-down-linear] h-3 w-3 shrink-0"
						animate={{ rotate: open ? 180 : 0 }}
						transition={{ duration: 0.18 }}
					/>
				</motion.button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				sideOffset={6}
				className="w-[var(--radix-popover-trigger-width)] min-w-[220px] max-w-[320px] gap-0 overflow-hidden rounded-xl p-0"
			>
				<div className="max-h-[280px] overflow-y-auto py-1">
					{allowClear && (
						<button
							type="button"
							onClick={() => handleSelect(null)}
							className={cn(
								"flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors",
								value == null ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent/50",
							)}
						>
							<span className="min-w-0 flex-1 truncate">{t("modelSelect.unset")}</span>
							{value == null && <span className="icon-[solar--check-circle-linear] h-3.5 w-3.5 shrink-0" />}
						</button>
					)}
					{[...grouped.entries()].map(([provider, providerModels]) => (
						<div key={provider}>
							<div className="flex items-center gap-1.5 px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
								<ProviderIcon symbol={iconFor(provider)} className="h-3 w-3" />
								{labelFor(provider)}
								{providerModels[0]?.remote && (
									<span className="rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[9px] font-medium text-blue-400">
										{t("modelSelect.cloudOnly")}
									</span>
								)}
							</div>
							{providerModels.map((m) => {
								const isSelected = m.key === value;
								const isDefault = m.key === defaultKey;
								return (
									<button
										key={m.key}
										type="button"
										onClick={() => handleSelect(m.key)}
										className={cn(
											"relative flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors",
											isSelected ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent/50",
										)}
									>
										{isSelected && (
											<motion.span
												layoutId="model-select-active-marker"
												className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary"
												transition={{ type: "spring", stiffness: 480, damping: 30 }}
											/>
										)}
										<span className="min-w-0 flex-1 truncate">{m.displayName}</span>
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
										{isDefault && (
											<span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium text-primary">
												{t("modelSelect.defaultBadge")}
											</span>
										)}
										{isSelected && <span className="icon-[solar--check-circle-linear] h-3.5 w-3.5 shrink-0" />}
									</button>
								);
							})}
						</div>
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
}

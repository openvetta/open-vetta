import { AnimatePresence, motion } from "motion/react";
import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MultiplierTag } from "@shared/components/ModelSelect/MultiplierTag";
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
} from "@vetta/ui";
import { cn } from "@shared/lib/utils";
import { ThemeSurface } from "@vetta/theme-ui/appearance";
import type { ModelSelectorViewProps } from "./types";

const MODEL_ITEM_SELECTOR = "[data-model-key]";

function normalizeSearchValue(value: string): string {
	return value.trim().toLocaleLowerCase();
}

export function ModelSelectorView({
	selectedModel,
	selectedOption,
	currentLevel,
	menuLevels,
	groups,
	defaultKey,
	labels,
	className,
	classNames,
	onModelSelect,
	onReasoningSelect,
}: ModelSelectorViewProps): JSX.Element {
	const [open, setOpen] = useState(false);
	const [reasoningOpen, setReasoningOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const searchInputRef = useRef<HTMLInputElement>(null);
	const modelListRef = useRef<HTMLDivElement>(null);

	const filteredGroups = useMemo(() => {
		const query = normalizeSearchValue(searchQuery);
		if (!query) return groups;

		return groups.flatMap((group) => {
			const models = group.models.filter((model) =>
				[
					model.displayName,
					model.modelId,
					model.provider,
					group.label,
					...(model.tags ?? []),
				].some((value) => normalizeSearchValue(value).includes(query)),
			);
			return models.length > 0 ? [{ ...group, models }] : [];
		});
	}, [groups, searchQuery]);

	const handleOpenChange = useCallback((nextOpen: boolean) => {
		setOpen(nextOpen);
		if (!nextOpen) {
			setReasoningOpen(false);
			setSearchQuery("");
		}
	}, []);

	useEffect(() => {
		if (!open) return;

		const frame = requestAnimationFrame(() => {
			searchInputRef.current?.focus();
			if (!selectedModel) return;
			const selectedItem = Array.from(
				modelListRef.current?.querySelectorAll<HTMLElement>(MODEL_ITEM_SELECTOR) ?? [],
			).find((item) => item.dataset.modelKey === selectedModel);
			selectedItem?.scrollIntoView({ block: "nearest" });
		});

		return () => cancelAnimationFrame(frame);
	}, [open, selectedModel]);

	const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
		setSearchQuery(event.target.value);
	};

	const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
		if (event.key === "Escape") return;
		event.stopPropagation();

		if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
		const items = Array.from(modelListRef.current?.querySelectorAll<HTMLElement>(MODEL_ITEM_SELECTOR) ?? []);
		const target = event.key === "ArrowDown" ? items[0] : items[items.length - 1];
		if (!target) return;
		event.preventDefault();
		target.focus();
	};

	const handleSearchClick = (event: ReactMouseEvent<HTMLInputElement | HTMLButtonElement>) => {
		event.stopPropagation();
	};

	const handleClearSearch = (event: ReactMouseEvent<HTMLButtonElement>) => {
		event.stopPropagation();
		setSearchQuery("");
		searchInputRef.current?.focus();
	};

	const handleModelSelect = (key: string) => {
		onModelSelect(key);
		setSearchQuery("");
	};

	return (
		<DropdownMenu open={open} onOpenChange={handleOpenChange}>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className={cn(
						"flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-transparent px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:outline-none data-[state=open]:bg-accent/60 data-[state=open]:text-foreground",
						className,
						classNames?.trigger,
					)}
				>
					{selectedOption && <ProviderIcon symbol={groups.find((g) => g.provider === selectedOption.provider)?.icon} className="h-3.5 w-3.5" />}
					<span className="min-w-0 flex-1 truncate text-left">{selectedOption?.displayName ?? labels.placeholder}</span>
					{currentLevel && <span className="shrink-0 text-muted-foreground">{labels.levelLabel(currentLevel)}</span>}
					<span className="icon-[solar--alt-arrow-down-linear] h-3 w-3 shrink-0" />
				</button>
			</DropdownMenuTrigger>
			<AnimatePresence>
				{open && (
					<DropdownMenuContent
						forceMount
						asChild
						align="start"
						className={cn(
							"w-[min(28rem,calc(100vw-2rem))] min-w-[260px] max-w-[28rem] overflow-visible p-0",
							classNames?.content,
						)}
						style={{ animation: "none" }}
					>
						<motion.div
							initial={{ opacity: 0, scale: 0.96, y: 8 }}
							animate={{ opacity: 1, scale: 1, y: 0 }}
							exit={{ opacity: 0, scale: 0.96, y: 8 }}
							transition={{ duration: 0.1, ease: [0.16, 1, 0.3, 1] }}
						>
							<div className="relative overflow-visible rounded-[inherit]">
								<ThemeSurface slot="chat.modelSelectorMenu" />
								<div
									className={cn(
										"relative z-10 flex max-h-[min(420px,65vh)] flex-col overflow-hidden rounded-[inherit] p-1",
										classNames?.contentInner,
									)}
								>
									<div className="shrink-0 p-1">
										<div className="relative" onKeyDown={handleSearchKeyDown}>
											<span
												aria-hidden="true"
												className="icon-[solar--magnifer-linear] pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
											/>
											<input
												ref={searchInputRef}
												type="search"
												value={searchQuery}
												onChange={handleSearchChange}
												onClick={handleSearchClick}
												placeholder={labels.searchPlaceholder}
												aria-label={labels.searchPlaceholder}
												className="h-8 w-full rounded-md border border-border/60 bg-background/70 pl-8 pr-8 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
											/>
											{searchQuery && (
												<button
													type="button"
													onClick={handleClearSearch}
													aria-label={labels.clearSearch}
													className="absolute right-1.5 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
												>
													<span aria-hidden="true" className="icon-[solar--close-circle-linear] size-3.5" />
												</button>
											)}
										</div>
									</div>
									{menuLevels.length > 0 && (
										<>
											<DropdownMenuSub open={reasoningOpen} onOpenChange={setReasoningOpen}>
												<DropdownMenuSubTrigger>
													<span className="min-w-0 flex-1 truncate">{labels.reasoningHeader}</span>
													{currentLevel && (
														<span className="shrink-0 text-muted-foreground">
															{labels.levelLabel(currentLevel)}
														</span>
													)}
												</DropdownMenuSubTrigger>
												<AnimatePresence>
													{reasoningOpen && (
														<DropdownMenuSubContent
															forceMount
															asChild
															className="min-w-[160px] overflow-visible p-0"
															style={{ animation: "none" }}
														>
															<motion.div
																initial={{ opacity: 0, scale: 0.96, x: -6 }}
																animate={{ opacity: 1, scale: 1, x: 0 }}
																exit={{ opacity: 0, scale: 0.96, x: -6 }}
																transition={{ duration: 0.1, ease: [0.16, 1, 0.3, 1] }}
															>
																<div className="relative overflow-visible rounded-[inherit]">
																	<ThemeSurface slot="chat.modelSelectorReasoningMenu" />
																	<div className="relative z-10 overflow-hidden rounded-[inherit] p-1">
																		<DropdownMenuLabel>{labels.reasoningHeader}</DropdownMenuLabel>
																		{menuLevels.map((level) => (
																			<DropdownMenuItem key={level} onSelect={() => onReasoningSelect(level)}>
																				<span className="min-w-0 flex-1 truncate">
																					{labels.levelLabel(level)}
																				</span>
																				{level === currentLevel && (
																					<span className="icon-[solar--check-circle-linear] h-3.5 w-3.5 shrink-0" />
																				)}
																			</DropdownMenuItem>
																		))}
																	</div>
																</div>
															</motion.div>
														</DropdownMenuSubContent>
													)}
												</AnimatePresence>
											</DropdownMenuSub>
											<DropdownMenuSeparator />
										</>
									)}
									<div ref={modelListRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
										<DropdownMenuLabel>{labels.modelHeader}</DropdownMenuLabel>
										{filteredGroups.map((group) => (
										<div key={group.provider}>
											<div
												className={cn(
													"flex items-center gap-1.5 px-3 pb-0.5 pt-1.5 text-[10px] font-medium text-muted-foreground/50",
													classNames?.providerHeader,
												)}
											>
												<ProviderIcon symbol={group.icon} className="h-3 w-3" />
												{group.label}
												{group.models[0]?.remote && (
													<span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium text-primary">
														{labels.cloudOnly}
													</span>
												)}
											</div>
											{group.models.map((model) => (
												<DropdownMenuItem
													key={model.key}
													data-model-key={model.key}
													aria-current={model.key === selectedModel ? "true" : undefined}
													className={cn(
														"rounded-md",
														model.key === selectedModel && "bg-accent text-accent-foreground",
														classNames?.item,
													)}
													onSelect={() => handleModelSelect(model.key)}
												>
													<span className="min-w-0 flex-1 truncate">{model.displayName}</span>
													<MultiplierTag multiplier={model.multiplier} />
													{model.supportsImage && (
														<span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium text-primary">
															{labels.visionBadge}
														</span>
													)}
													{model.key === defaultKey && (
														<span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium text-primary">
															{labels.defaultBadge}
														</span>
													)}
													{model.key === selectedModel && (
														<span className="icon-[solar--check-circle-linear] h-3.5 w-3.5 shrink-0" />
													)}
												</DropdownMenuItem>
											))}
										</div>
										))}
										{filteredGroups.length === 0 && (
											<div className="flex min-h-32 flex-col items-center justify-center px-6 py-8 text-center">
												<span aria-hidden="true" className="icon-[solar--magnifer-linear] mb-2 size-5 text-muted-foreground" />
												<p className="text-sm font-medium text-foreground">{labels.noResults}</p>
												<p className="mt-1 text-xs text-muted-foreground">{labels.noResultsHint}</p>
											</div>
										)}
									</div>
								</div>
							</div>
						</motion.div>
					</DropdownMenuContent>
				)}
			</AnimatePresence>
		</DropdownMenu>
	);
}

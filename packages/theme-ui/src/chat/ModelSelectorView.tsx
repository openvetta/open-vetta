import { AnimatePresence, motion } from "motion/react";
import type { ChangeEvent, JSX, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@vetta-org/ui/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@vetta-org/ui/dropdown-menu";
import { ThemeSurface } from "../appearance/ThemeSurface";
import { MultiplierTag } from "../shared/MultiplierTag";
import { ProviderIcon } from "../shared/provider-icon";
import { ModelSelectorTrigger } from "./ModelSelectorTrigger";

/**
 * 模型选择器的视图层：搜索、按 provider 分组、推理档位子菜单、云端/默认/视觉徽章。
 *
 * 纯展示——模型从哪来、选中后写到哪、文案怎么翻译，全部由调用方通过 props 决定。
 * 宿主的输入栏用它，插件（看板等）经 `@vetta-org/theme-ui/plugin-ui` 用的也是同一个，
 * 两边因此不会长成两副样子。
 */

/** 选择器需要的模型字段；宿主的 ModelOption 结构上即满足它。 */
export interface ModelSelectorOptionView {
	/** `provider/modelId`。 */
	readonly key: string;
	readonly provider: string;
	readonly modelId: string;
	readonly displayName: string;
	/** 参与搜索匹配的附加标签。 */
	readonly tags?: readonly string[];
	/** 来自远程目录（云端）；分组头会打上 `labels.cloudOnly` 徽章。 */
	readonly remote?: boolean;
	readonly supportsImage?: boolean;
}

export interface ModelSelectorLabels {
	placeholder: string;
	searchPlaceholder: string;
	clearSearch: string;
	noResults: string;
	noResultsHint: string;
	reasoningHeader: string;
	modelHeader: string;
	cloudOnly: string;
	visionBadge: string;
	defaultBadge: string;
	levelLabel: (value: string) => string;
	/**
	 * 计费倍率标（如「2×」「免费」）。返回空/undefined 则不渲染——倍率含义与文案属于
	 * 宿主的计费口径，视图不猜。
	 */
	multiplierLabel?: (option: ModelSelectorOptionView) => string | undefined;
}

export interface ModelSelectorProviderGroup {
	provider: string;
	label: string;
	icon?: string;
	models: readonly ModelSelectorOptionView[];
}

export interface ModelSelectorViewProps {
	selectedModel?: string;
	selectedOption: ModelSelectorOptionView | null;
	currentLevel?: string;
	menuLevels: string[];
	groups: readonly ModelSelectorProviderGroup[];
	defaultKey?: string;
	labels: ModelSelectorLabels;
	ariaLabel?: string;
	disabled?: boolean;
	/** 可选的空值项，例如“不固定模型”或“跟随会话默认”。 */
	emptyOption?: {
		readonly label: string;
		readonly onSelect: () => void;
	};
	className?: string;
	classNames?: {
		trigger?: string;
		content?: string;
		contentInner?: string;
		providerHeader?: string;
		item?: string;
	};
	onModelSelect: (key: string) => void;
	onReasoningSelect: (value: string) => void;
	/** 菜单开合回调，宿主可借此在打开时刷新模型目录 */
	onOpenChange?: (open: boolean) => void;
}

const MODEL_ITEM_SELECTOR = "[data-model-key]";

/** 紧凑行：覆盖 @vetta-org/ui 默认的 px-3 py-2 text-[13px]，让模型多时列表不至于过长。 */
const COMPACT_ITEM_CLASS = "gap-1.5 rounded-md px-2 py-1 text-xs";
const COMPACT_LABEL_CLASS = "px-2 pb-0.5 pt-1 text-[10px]";

function normalizeSearchValue(value: string): string {
	return value.trim().toLocaleLowerCase();
}

export function ModelVisionIcon({
	label,
	className,
}: {
	readonly label?: string;
	readonly className?: string;
}): JSX.Element {
	return (
		<span
			role="img"
			aria-label={label}
			title={label}
			className={cn("icon-[solar--gallery-linear] size-3 shrink-0 text-primary", className)}
		/>
	);
}

export function ModelSelectorView({
	selectedModel,
	selectedOption,
	currentLevel,
	menuLevels,
	groups,
	defaultKey,
	labels,
	ariaLabel,
	disabled = false,
	emptyOption,
	className,
	classNames,
	onModelSelect,
	onReasoningSelect,
	onOpenChange,
}: ModelSelectorViewProps): JSX.Element {
	const [open, setOpen] = useState(false);
	const [reasoningOpen, setReasoningOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	// 用户手动展开/折叠过的结果；null 表示还没动过，按"只展开当前选中模型所在分组"。关菜单即重置。
	const [expandedOverride, setExpandedOverride] = useState<ReadonlySet<string> | null>(null);
	const searchInputRef = useRef<HTMLInputElement>(null);
	const modelListRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const portalContainer = open
		? (triggerRef.current?.closest<HTMLElement>('[data-slot="drawer-content"], [data-slot="dialog-content"]') ??
			undefined)
		: undefined;

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

	const searching = normalizeSearchValue(searchQuery) !== "";
	// 只有一个分组时没有折叠的意义；搜索时命中的分组一律展开，免得结果藏在折叠里。
	const collapsible = !searching && groups.length > 1;
	const expandedProviders = useMemo<ReadonlySet<string>>(
		() => expandedOverride ?? new Set(selectedOption ? [selectedOption.provider] : []),
		[expandedOverride, selectedOption],
	);
	const toggleProvider = useCallback(
		(provider: string) => {
			const next = new Set(expandedProviders);
			if (!next.delete(provider)) next.add(provider);
			setExpandedOverride(next);
		},
		[expandedProviders],
	);

	const handleOpenChange = useCallback(
		(nextOpen: boolean) => {
			setOpen(nextOpen);
			if (!nextOpen) {
				setReasoningOpen(false);
				setSearchQuery("");
				setExpandedOverride(null);
			}
			onOpenChange?.(nextOpen);
		},
		[onOpenChange],
	);

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

	// 宿主的 onModelSelect 会随会话状态换引用；经 ref 取最新值，行组件的 memo 才不会被它打穿。
	const onModelSelectRef = useRef(onModelSelect);
	onModelSelectRef.current = onModelSelect;
	const handleModelSelect = useCallback((key: string) => {
		onModelSelectRef.current(key);
		setSearchQuery("");
	}, []);

	return (
		// 搜索型选择器不需要锁住页面；modal 模式会改写 body 的滚动与 pointer-events，
		// 在长会话页面触发整棵 DOM 的同步样式重算。
		<DropdownMenu open={open} modal={false} onOpenChange={handleOpenChange}>
			<DropdownMenuTrigger asChild disabled={disabled}>
				<ModelSelectorTrigger
					ref={triggerRef}
					aria-label={ariaLabel}
					disabled={disabled}
					label={selectedOption?.displayName ?? labels.placeholder}
					icon={
						selectedOption ? groups.find((group) => group.provider === selectedOption.provider)?.icon : undefined
					}
					reasoningLabel={currentLevel ? labels.levelLabel(currentLevel) : undefined}
					className={cn(className, classNames?.trigger)}
				/>
			</DropdownMenuTrigger>
			<AnimatePresence>
				{open && (
					<DropdownMenuContent
						forceMount
						asChild
						portalContainer={portalContainer}
						align="start"
						className={cn(
							// 底色跟搜索框走同一个变量：搜索行去掉底色后要和面板融成一块
							"w-[min(16rem,calc(100vw-2rem))] min-w-[180px] max-w-[16rem] overflow-visible bg-background p-0",
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
										"relative z-10 flex max-h-[min(360px,60vh)] flex-col overflow-hidden rounded-[inherit] p-1",
										classNames?.contentInner,
									)}
								>
									<div className="shrink-0 p-0.5">
										<div className="relative" onKeyDown={handleSearchKeyDown}>
											<span
												aria-hidden="true"
												className="icon-[solar--magnifer-linear] pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground"
											/>
											<input
												ref={searchInputRef}
												type="search"
												value={searchQuery}
												onChange={handleSearchChange}
												onClick={handleSearchClick}
												placeholder={labels.searchPlaceholder}
												aria-label={labels.searchPlaceholder}
												className="h-7 w-full rounded-md pl-7 pr-7 text-[11px] text-foreground outline-none placeholder:text-muted-foreground"
											/>
											{searchQuery && (
												<button
													type="button"
													onClick={handleClearSearch}
													aria-label={labels.clearSearch}
													className="absolute right-1 top-1/2 inline-flex size-4 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
												>
													<span aria-hidden="true" className="icon-[solar--close-circle-linear] size-3" />
												</button>
											)}
										</div>
									</div>
									{menuLevels.length > 0 && (
										<>
											<DropdownMenuSub open={reasoningOpen} onOpenChange={setReasoningOpen}>
												<DropdownMenuSubTrigger className={COMPACT_ITEM_CLASS}>
													<span className="min-w-0 flex-1 truncate">{labels.reasoningHeader}</span>
													{currentLevel && (
														<span className="shrink-0 text-[11px] text-muted-foreground">
															{labels.levelLabel(currentLevel)}
														</span>
													)}
												</DropdownMenuSubTrigger>
												<AnimatePresence>
													{reasoningOpen && (
														<DropdownMenuSubContent
															forceMount
															asChild
															portalContainer={portalContainer}
															className="min-w-[130px] overflow-visible bg-background p-0"
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
																		<DropdownMenuLabel className={COMPACT_LABEL_CLASS}>
																			{labels.reasoningHeader}
																		</DropdownMenuLabel>
																		{menuLevels.map((level) => (
																			<DropdownMenuItem
																				key={level}
																				className={COMPACT_ITEM_CLASS}
																				onSelect={() => onReasoningSelect(level)}
																			>
																				<span className="min-w-0 flex-1 truncate">
																					{labels.levelLabel(level)}
																				</span>
																				{level === currentLevel && (
																					<span className="icon-[solar--check-circle-linear] h-3 w-3 shrink-0" />
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
										{emptyOption && (
											<>
												<DropdownMenuItem
													aria-current={!selectedModel ? "true" : undefined}
													className={cn(
														COMPACT_ITEM_CLASS,
														!selectedModel && "bg-accent text-accent-foreground",
													)}
													onSelect={emptyOption.onSelect}
												>
													<span className="min-w-0 flex-1 truncate">{emptyOption.label}</span>
													{!selectedModel && (
														<span className="icon-[solar--check-circle-linear] h-3 w-3 shrink-0" />
													)}
												</DropdownMenuItem>
												<DropdownMenuSeparator />
											</>
										)}
										<DropdownMenuLabel className={COMPACT_LABEL_CLASS}>{labels.modelHeader}</DropdownMenuLabel>
										{filteredGroups.map((group) => {
											const expanded = !collapsible || expandedProviders.has(group.provider);
											return (
												<div key={group.provider}>
													<ProviderHeader
														group={group}
														cloudOnlyLabel={labels.cloudOnly}
														className={classNames?.providerHeader}
														collapsible={collapsible}
														expanded={expanded}
														onToggle={toggleProvider}
													/>
													{expanded &&
														group.models.map((model) => (
															<ModelRow
																key={model.key}
																model={model}
																selected={model.key === selectedModel}
																isDefault={model.key === defaultKey}
																itemClassName={classNames?.item}
																visionBadge={labels.visionBadge}
																defaultBadge={labels.defaultBadge}
																multiplierLabel={labels.multiplierLabel}
																onSelect={handleModelSelect}
															/>
														))}
												</div>
											);
										})}
										{filteredGroups.length === 0 && (
											<div className="flex min-h-24 flex-col items-center justify-center px-4 py-6 text-center">
												<span aria-hidden="true" className="icon-[solar--magnifer-linear] mb-1.5 size-4 text-muted-foreground" />
												<p className="text-xs font-medium text-foreground">{labels.noResults}</p>
												<p className="mt-0.5 text-[11px] text-muted-foreground">{labels.noResultsHint}</p>
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

/**
 * 分组头。可折叠时渲染成菜单项（保留方向键导航），选中后阻止菜单关闭，只切换展开状态。
 */
function ProviderHeader({
	group,
	cloudOnlyLabel,
	className,
	collapsible,
	expanded,
	onToggle,
}: {
	readonly group: ModelSelectorProviderGroup;
	readonly cloudOnlyLabel: string;
	readonly className?: string;
	readonly collapsible: boolean;
	readonly expanded: boolean;
	readonly onToggle: (provider: string) => void;
}): JSX.Element {
	const content = (
		<>
			<ProviderIcon symbol={group.icon} className="h-2.5 w-2.5" />
			<span className="min-w-0 truncate">{group.label}</span>
			{group.models[0]?.remote && (
				<span className="shrink-0 rounded-full bg-primary/15 px-1 text-[9px] font-medium text-primary">
					{cloudOnlyLabel}
				</span>
			)}
		</>
	);
	if (!collapsible) {
		return (
			<div
				className={cn(
					"flex items-center gap-1 px-2 pb-0.5 pt-1 text-[10px] font-medium text-muted-foreground/50",
					className,
				)}
			>
				{content}
			</div>
		);
	}
	return (
		<DropdownMenuItem
			aria-expanded={expanded}
			className={cn("gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-muted-foreground", className)}
			onSelect={(event) => {
				event.preventDefault();
				onToggle(group.provider);
			}}
		>
			{content}
			<span className="ml-auto shrink-0 tabular-nums">{group.models.length}</span>
			<span
				aria-hidden="true"
				className={cn(
					"size-3 shrink-0",
					expanded ? "icon-[solar--alt-arrow-down-linear]" : "icon-[solar--alt-arrow-right-linear]",
				)}
			/>
		</DropdownMenuItem>
	);
}

/**
 * 单行模型项。模型多达几百个时，搜索每敲一个字符都会重渲染列表；memo 让没变化的行直接跳过。
 */
const ModelRow = memo(function ModelRow({
	model,
	selected,
	isDefault,
	itemClassName,
	visionBadge,
	defaultBadge,
	multiplierLabel,
	onSelect,
}: {
	readonly model: ModelSelectorOptionView;
	readonly selected: boolean;
	readonly isDefault: boolean;
	readonly itemClassName?: string;
	readonly visionBadge: string;
	readonly defaultBadge: string;
	readonly multiplierLabel?: (option: ModelSelectorOptionView) => string | undefined;
	readonly onSelect: (key: string) => void;
}): JSX.Element {
	return (
		<DropdownMenuItem
			data-model-key={model.key}
			aria-current={selected ? "true" : undefined}
			className={cn(COMPACT_ITEM_CLASS, selected && "bg-accent text-accent-foreground", itemClassName)}
			onSelect={() => onSelect(model.key)}
		>
			<span className="min-w-0 flex-1 truncate">{model.displayName}</span>
			<ModelMultiplier label={multiplierLabel?.(model)} />
			{model.supportsImage && <ModelVisionIcon label={visionBadge} />}
			{isDefault && (
				<span className="shrink-0 rounded-full bg-primary/15 px-1 text-[9px] font-medium text-primary">
					{defaultBadge}
				</span>
			)}
			{selected && <span className="icon-[solar--check-circle-linear] h-3 w-3 shrink-0" />}
		</DropdownMenuItem>
	);
});

function ModelMultiplier({ label }: { label?: string }): JSX.Element | null {
	return label ? <MultiplierTag text={label} /> : null;
}

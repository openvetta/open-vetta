import type {
	ChangeEvent,
	JSX,
	KeyboardEvent as ReactKeyboardEvent,
	MouseEvent as ReactMouseEvent,
	ReactNode,
} from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@vetta-org/ui/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@vetta-org/ui/dropdown-menu";
import { ThemeSurface } from "../appearance/ThemeSurface";
import { MultiplierTag } from "../shared/MultiplierTag";
import { getProviderIcon, ProviderIcon } from "../shared/provider-icon";
import { ModelSelectorTrigger } from "./ModelSelectorTrigger";

/**
 * 模型选择器的视图层：三栏布局——供应商（含「收藏」）｜模型列表（可搜索）｜所选模型的推理档位，
 * 外加云端/默认/视觉徽章。只有一个供应商且没有收藏功能时不出现第一栏。
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
	 * 第一栏服务商过多时，折叠按钮的名称（带被折叠的数量）与收起按钮的名称。
	 * 两个都提供才会折叠；不提供则第一栏始终全部列出。
	 */
	moreProviders?: (hiddenCount: number) => string;
	fewerProviders?: string;
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

/** 收藏功能。不传则不出现「收藏」入口与星标按钮（插件等宿主可以不接）。 */
export interface ModelSelectorFavorites {
	readonly keys: ReadonlySet<string>;
	readonly onToggle: (key: string) => void;
	readonly labels: {
		/** 第一栏「收藏」入口的名称，也是收藏列表的标题 */
		tab: string;
		empty: string;
		add: string;
		remove: string;
	};
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
	/** 收藏功能；不传则隐藏收藏入口 */
	favorites?: ModelSelectorFavorites;
	/**
	 * 带推理档位的模型 key。选中这些模型后菜单保持打开，让用户接着在第三栏选档位；
	 * 不传则选中任何模型都直接关闭菜单。
	 */
	reasoningModelKeys?: ReadonlySet<string>;
	/** 菜单开合回调，宿主可借此在打开时刷新模型目录 */
	onOpenChange?: (open: boolean) => void;
}

const MODEL_ITEM_SELECTOR = "[data-model-key]";

/** 紧凑行：覆盖 @vetta-org/ui 默认的 px-3 py-2 text-[13px]，让模型多时列表不至于过长。 */
const COMPACT_ITEM_CLASS = "gap-1.5 rounded-md px-2 py-1 text-xs";
const COMPACT_LABEL_CLASS = "px-2 pb-0.5 pt-1 text-[10px]";
/** 行与分组头的固定高度：虚拟列表按它算位置，不逐行测量。 */
const ROW_HEIGHT = 28;
const HEADER_HEIGHT = 24;
/** 条目数超过它才虚拟化；少量条目直接渲染更简单，也保留菜单自带的字符跳转。 */
const VIRTUALIZE_THRESHOLD = 40;
const VIRTUAL_OVERSCAN = 8;
/** 第一栏折叠时保留显示的服务商个数（当前栏目始终可见，不计入）。 */
const RAIL_COLLAPSED_COUNT = 8;
/** 虚拟列表首帧还量不到滚动容器时，按这个高度估一屏，避免先闪一帧空白。 */
const LIST_FALLBACK_HEIGHT = 300;
/** 第一栏里「收藏」入口的标识；供应商 id 不会含 NUL。 */
const FAVORITES_TAB = "\u0000favorites";

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
	favorites,
	reasoningModelKeys,
	onModelSelect,
	onReasoningSelect,
	onOpenChange,
}: ModelSelectorViewProps): JSX.Element {
	const [open, setOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	// 用户在第一栏手动点选的栏目；null 表示没点过，跟随当前所选模型的供应商。关菜单即重置。
	const [tabOverride, setTabOverride] = useState<string | null>(null);
	const [railExpanded, setRailExpanded] = useState(false);
	const searchInputRef = useRef<HTMLInputElement>(null);
	const modelListRef = useRef<HTMLDivElement | null>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const portalContainer = open
		? (triggerRef.current?.closest<HTMLElement>('[data-slot="drawer-content"], [data-slot="dialog-content"]') ??
			undefined)
		: undefined;

	const searching = normalizeSearchValue(searchQuery) !== "";
	// 只有一个供应商又没有收藏功能时，第一栏没有意义。
	const showRail = favorites !== undefined || groups.length > 1;

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

	const favoriteKeys = favorites?.keys;
	const favoriteGroups = useMemo(() => {
		if (!favoriteKeys) return [];
		return groups.flatMap((group) => {
			const models = group.models.filter((model) => favoriteKeys.has(model.key));
			return models.length > 0 ? [{ ...group, models }] : [];
		});
	}, [groups, favoriteKeys]);

	const defaultTab =
		selectedOption && groups.some((group) => group.provider === selectedOption.provider)
			? selectedOption.provider
			: (groups[0]?.provider ?? FAVORITES_TAB);
	const requestedTab = tabOverride ?? defaultTab;
	const activeTab =
		requestedTab === FAVORITES_TAB
			? favorites
				? FAVORITES_TAB
				: defaultTab
			: groups.some((group) => group.provider === requestedTab)
				? requestedTab
				: defaultTab;
	const activeGroup = groups.find((group) => group.provider === activeTab);

	// 服务商很多时第一栏只露前几个（当前栏目始终露出），其余收进一个"更多"按钮。
	const canFoldRail =
		labels.moreProviders !== undefined &&
		labels.fewerProviders !== undefined &&
		groups.length > RAIL_COLLAPSED_COUNT + 1;
	const railFolded = canFoldRail && !railExpanded;
	const railGroups = railFolded
		? groups.filter((group, index) => index < RAIL_COLLAPSED_COUNT || group.provider === activeTab)
		: groups;
	const railHiddenCount = groups.length - railGroups.length;

	// 搜索跨所有供应商；没有第一栏时就是全部；否则只看当前栏目。
	let visibleGroups: readonly ModelSelectorProviderGroup[];
	let showProviderHeaders = true;
	let listTitle = labels.modelHeader;
	if (searching) {
		visibleGroups = filteredGroups;
	} else if (!showRail) {
		visibleGroups = groups;
	} else if (activeTab === FAVORITES_TAB) {
		visibleGroups = favoriteGroups;
		listTitle = favorites?.labels.tab ?? listTitle;
	} else {
		visibleGroups = activeGroup ? [activeGroup] : [];
		showProviderHeaders = false;
		listTitle = activeGroup?.label ?? listTitle;
	}

	const entries = useMemo<readonly ListEntry[]>(
		() =>
			visibleGroups.flatMap((group) => [
				...(showProviderHeaders ? [{ kind: "header" as const, group }] : []),
				...group.models.map((model) => ({ kind: "model" as const, model })),
			]),
		[visibleGroups, showProviderHeaders],
	);
	// 收藏还空着时整栏只放空态提示，不再显示列表标题。
	const favoritesEmpty = favorites !== undefined && !searching && activeTab === FAVORITES_TAB && entries.length === 0;
	const providerHeaderClassName = classNames?.providerHeader;
	const itemClassName = classNames?.item;
	const cloudOnlyLabel = labels.cloudOnly;
	const visionBadge = labels.visionBadge;
	const defaultBadge = labels.defaultBadge;
	const multiplierLabel = labels.multiplierLabel;

	const handleOpenChange = useCallback(
		(nextOpen: boolean) => {
			setOpen(nextOpen);
			if (!nextOpen) {
				setSearchQuery("");
				setTabOverride(null);
				setRailExpanded(false);
			}
			onOpenChange?.(nextOpen);
		},
		[onOpenChange],
	);

	useEffect(() => {
		if (!open) return;

		const frame = requestAnimationFrame(() => searchInputRef.current?.focus());
		return () => cancelAnimationFrame(frame);
	}, [open]);

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

	// 宿主的回调会随会话状态换引用；经 ref 取最新值，行组件的 memo 才不会被它们打穿。
	const onModelSelectRef = useRef(onModelSelect);
	onModelSelectRef.current = onModelSelect;
	const reasoningModelKeysRef = useRef(reasoningModelKeys);
	reasoningModelKeysRef.current = reasoningModelKeys;
	const handleModelSelect = useCallback(
		(model: ModelSelectorOptionView, event: Event) => {
			onModelSelectRef.current(model.key);
			// 带推理档位的模型：留着菜单，第三栏会随新的选中项刷出档位。
			if (reasoningModelKeysRef.current?.has(model.key)) event.preventDefault();
			// 从搜索结果里选的，清掉搜索后第二栏要落在它所属的供应商上。
			if (searching) setTabOverride(model.provider);
			setSearchQuery("");
		},
		[searching],
	);

	const listContext = useMemo<ModelListContext>(
		() => ({
			selectedModel,
			defaultKey,
			favorites,
			providerHeaderClassName,
			itemClassName,
			cloudOnlyLabel,
			visionBadge,
			defaultBadge,
			multiplierLabel,
			onSelect: handleModelSelect,
		}),
		[
			selectedModel,
			defaultKey,
			favorites,
			providerHeaderClassName,
			itemClassName,
			cloudOnlyLabel,
			visionBadge,
			defaultBadge,
			multiplierLabel,
			handleModelSelect,
		],
	);

	const selectTab = (tab: string) => {
		setTabOverride(tab);
		setSearchQuery("");
	};

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
			<DropdownMenuContent
				portalContainer={portalContainer}
				align="start"
				// 三栏后菜单较宽，贴着窗口右缘放会被推到边上；留出边距让它整体往左收。
				collisionPadding={16}
				className={cn(
					// 底色跟搜索框走同一个变量：搜索行去掉底色后要和面板融成一块
					"w-auto min-w-[180px] max-w-[calc(100vw-2rem)] overflow-visible bg-background p-0",
					classNames?.content,
				)}
			>
				<div className="relative overflow-visible rounded-[inherit]">
					<ThemeSurface slot="chat.modelSelectorMenu" />
					<div
						className={cn(
							"relative z-10 flex h-[min(340px,60vh)] overflow-hidden rounded-[inherit]",
							classNames?.contentInner,
						)}
					>
						{showRail && (
							<div className="flex w-11 shrink-0 flex-col items-center gap-1 overflow-y-auto overflow-x-hidden border-r border-border/40 p-1">
								{favorites && (
									<RailItem
										label={favorites.labels.tab}
										active={!searching && activeTab === FAVORITES_TAB}
										onSelect={() => selectTab(FAVORITES_TAB)}
									>
										<span aria-hidden="true" className="icon-[solar--star-bold] size-4" />
									</RailItem>
								)}
								{railGroups.map((group) => (
									<RailItem
										key={group.provider}
										label={group.label}
										active={!searching && activeTab === group.provider}
										onSelect={() => selectTab(group.provider)}
									>
										{getProviderIcon(group.icon) ? (
											<ProviderIcon symbol={group.icon} className="size-4" />
										) : (
											<span aria-hidden="true" className="text-[12px] font-semibold uppercase leading-none">
												{providerInitial(group.label)}
											</span>
										)}
									</RailItem>
								))}
								{canFoldRail && labels.moreProviders && labels.fewerProviders && (
									<RailItem
										label={railFolded ? labels.moreProviders(railHiddenCount) : labels.fewerProviders}
										active={false}
										onSelect={() => setRailExpanded(railFolded)}
									>
										{railFolded ? (
											<span aria-hidden="true" className="text-[10px] font-medium tabular-nums">
												+{railHiddenCount}
											</span>
										) : (
											<span aria-hidden="true" className="icon-[solar--alt-arrow-up-linear] size-4" />
										)}
									</RailItem>
								)}
							</div>
						)}
						<div className="flex w-64 min-w-0 shrink flex-col p-1">
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
							{emptyOption && (
								<>
									<DropdownMenuItem
										aria-current={!selectedModel ? "true" : undefined}
										className={cn(COMPACT_ITEM_CLASS, !selectedModel && "bg-accent text-accent-foreground")}
										onSelect={emptyOption.onSelect}
									>
										<span className="min-w-0 flex-1 truncate">{emptyOption.label}</span>
										{!selectedModel && <span className="icon-[solar--check-circle-linear] h-3 w-3 shrink-0" />}
									</DropdownMenuItem>
									<DropdownMenuSeparator />
								</>
							)}
							{!favoritesEmpty && (
				<DropdownMenuLabel className={COMPACT_LABEL_CLASS}>{listTitle}</DropdownMenuLabel>
			)}
							{entries.length > 0 ? (
								<ModelList
									// 换栏目或改搜索词就整张列表重来：滚动位置回到顶部（或所选项），虚拟窗口也跟着重算。
									key={`${searching ? "search" : activeTab}|${searchQuery}`}
									entries={entries}
									context={listContext}
									scrollRef={modelListRef}
								/>
							) : (
								<div ref={modelListRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
									{!searching && favorites && activeTab === FAVORITES_TAB && (
										<div className="flex h-full min-h-40 flex-col items-center justify-center gap-3 px-6 text-center">
											<span
												aria-hidden="true"
												className="flex size-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-500 ring-1 ring-amber-500/20"
											>
												<span className="icon-[solar--star-bold] size-6" />
											</span>
											<p className="text-xs font-medium text-foreground">{favorites.labels.empty}</p>
										</div>
									)}
									{searching && (
										<div className="flex min-h-24 flex-col items-center justify-center px-4 py-6 text-center">
											<span aria-hidden="true" className="icon-[solar--magnifer-linear] mb-1.5 size-4 text-muted-foreground" />
											<p className="text-xs font-medium text-foreground">{labels.noResults}</p>
											<p className="mt-0.5 text-[11px] text-muted-foreground">{labels.noResultsHint}</p>
										</div>
									)}
								</div>
							)}
						</div>
						{menuLevels.length > 0 && (
							<div className="relative flex w-32 shrink-0 flex-col overflow-hidden border-l border-border/40">
								<ThemeSurface slot="chat.modelSelectorReasoningMenu" />
								<div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto p-1">
									<DropdownMenuLabel className={COMPACT_LABEL_CLASS}>{labels.reasoningHeader}</DropdownMenuLabel>
									{selectedOption && (
										<p className="truncate px-2 pb-1 text-[10px] text-muted-foreground/70">
											{selectedOption.displayName}
										</p>
									)}
									{menuLevels.map((level) => (
										<DropdownMenuItem
											key={level}
											className={cn(
												COMPACT_ITEM_CLASS,
												level === currentLevel && "bg-accent text-accent-foreground",
											)}
											onSelect={() => onReasoningSelect(level)}
										>
											<span className="min-w-0 flex-1 truncate">{labels.levelLabel(level)}</span>
											{level === currentLevel && (
												<span className="icon-[solar--check-circle-linear] h-3 w-3 shrink-0" />
											)}
										</DropdownMenuItem>
									))}
								</div>
							</div>
						)}
					</div>
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

/** 供应商没有图标时，第一栏用名称的第一个字符做头像。 */
function providerInitial(label: string): string {
	return Array.from(label.trim())[0] ?? "?";
}

/**
 * 第一栏的一个入口。渲染成菜单项（保留方向键导航），选中后阻止菜单关闭，只切换栏目。
 */
function RailItem({
	label,
	active,
	onSelect,
	children,
}: {
	readonly label: string;
	readonly active: boolean;
	readonly onSelect: () => void;
	readonly children: ReactNode;
}): JSX.Element {
	return (
		<DropdownMenuItem
			aria-label={label}
			aria-current={active ? "true" : undefined}
			title={label}
			className={cn(
				"size-8 shrink-0 justify-center rounded-lg p-0 text-muted-foreground",
				active && "bg-accent text-accent-foreground",
			)}
			onSelect={(event) => {
				event.preventDefault();
				onSelect();
			}}
		>
			{children}
		</DropdownMenuItem>
	);
}

type ListEntry =
	| { readonly kind: "header"; readonly group: ModelSelectorProviderGroup }
	| { readonly kind: "model"; readonly model: ModelSelectorOptionView };

/** 列表项渲染所需的一切。整体 memo 成一个对象，行组件的 memo 才不会被它打穿。 */
interface ModelListContext {
	readonly selectedModel?: string;
	readonly defaultKey?: string;
	readonly favorites?: ModelSelectorFavorites;
	readonly providerHeaderClassName?: string;
	readonly itemClassName?: string;
	readonly cloudOnlyLabel: string;
	readonly visionBadge: string;
	readonly defaultBadge: string;
	readonly multiplierLabel?: (option: ModelSelectorOptionView) => string | undefined;
	readonly onSelect: (model: ModelSelectorOptionView, event: Event) => void;
}

function entryKey(entry: ListEntry): string {
	return entry.kind === "header" ? `header:${entry.group.provider}` : entry.model.key;
}

function ListEntryView({
	entry,
	context,
}: {
	readonly entry: ListEntry;
	readonly context: ModelListContext;
}): JSX.Element {
	if (entry.kind === "header") {
		return (
			<ProviderHeader
				group={entry.group}
				cloudOnlyLabel={context.cloudOnlyLabel}
				className={context.providerHeaderClassName}
			/>
		);
	}
	const { model } = entry;
	const { favorites } = context;
	return (
		<ModelRow
			model={model}
			selected={model.key === context.selectedModel}
			isDefault={model.key === context.defaultKey}
			isFavorite={favorites ? favorites.keys.has(model.key) : undefined}
			favoriteLabels={favorites?.labels}
			onToggleFavorite={favorites?.onToggle}
			itemClassName={context.itemClassName}
			visionBadge={context.visionBadge}
			defaultBadge={context.defaultBadge}
			multiplierLabel={context.multiplierLabel}
			onSelect={context.onSelect}
		/>
	);
}

interface ModelListProps {
	readonly entries: readonly ListEntry[];
	readonly context: ModelListContext;
	/** 滚动容器；父组件用它做方向键从搜索框跳进列表。 */
	readonly scrollRef: { current: HTMLDivElement | null };
}

/**
 * 模型列表。几百个模型时每个菜单项都要向 Radix 菜单注册、挂载并参与布局，一次全挂上就是卡顿的来源，
 * 所以条目多时只渲染可视窗口内的那几十行。
 */
function ModelList(props: ModelListProps): JSX.Element {
	return props.entries.length > VIRTUALIZE_THRESHOLD ? <VirtualModelList {...props} /> : <PlainModelList {...props} />;
}

function PlainModelList({ entries, context, scrollRef }: ModelListProps): JSX.Element {
	const { selectedModel } = context;
	useEffect(() => {
		if (!selectedModel) return;
		const frame = requestAnimationFrame(() => {
			const selectedItem = Array.from(
				scrollRef.current?.querySelectorAll<HTMLElement>(MODEL_ITEM_SELECTOR) ?? [],
			).find((item) => item.dataset.modelKey === selectedModel);
			selectedItem?.scrollIntoView({ block: "nearest" });
		});
		return () => cancelAnimationFrame(frame);
		// 只在列表出现时把所选项滚入可视区；选中后菜单还开着时不要再跳。
		// biome-ignore lint/correctness/useExhaustiveDependencies: 见上
	}, []);

	return (
		<div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
			{entries.map((entry) => (
				<ListEntryView key={entryKey(entry)} entry={entry} context={context} />
			))}
		</div>
	);
}

function VirtualModelList({ entries, context, scrollRef }: ModelListProps): JSX.Element {
	// 菜单内容经 Portal 挂载，滚动容器要等到真正进了 DOM 才拿得到，所以用 state 接 ref。
	const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
	const setRefs = useCallback(
		(node: HTMLDivElement | null) => {
			scrollRef.current = node;
			setScrollElement(node);
		},
		[scrollRef],
	);
	const virtualizer = useVirtualizer({
		count: entries.length,
		getScrollElement: () => scrollElement,
		estimateSize: (index) => (entries[index]?.kind === "header" ? HEADER_HEIGHT : ROW_HEIGHT),
		getItemKey: (index) => {
			const entry = entries[index];
			return entry ? entryKey(entry) : index;
		},
		overscan: VIRTUAL_OVERSCAN,
		initialRect: { width: 0, height: LIST_FALLBACK_HEIGHT },
	});

	const { selectedModel } = context;
	useEffect(() => {
		if (!scrollElement || !selectedModel) return;
		const index = entries.findIndex((entry) => entry.kind === "model" && entry.model.key === selectedModel);
		if (index >= 0) virtualizer.scrollToIndex(index, { align: "auto" });
		// 只在滚动容器就绪时定位一次；选中后菜单还开着时不要再跳。
		// biome-ignore lint/correctness/useExhaustiveDependencies: 见上
	}, [scrollElement]);

	return (
		<div ref={setRefs} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
			<div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
				{virtualizer.getVirtualItems().map((item) => {
					const entry = entries[item.index];
					if (!entry) return null;
					return (
						<div
							key={item.key}
							className="absolute left-0 top-0 w-full"
							style={{ height: item.size, transform: `translateY(${item.start}px)` }}
						>
							<ListEntryView entry={entry} context={context} />
						</div>
					);
				})}
			</div>
		</div>
	);
}

/** 搜索结果与收藏列表里的供应商分组头。 */
function ProviderHeader({
	group,
	cloudOnlyLabel,
	className,
}: {
	readonly group: ModelSelectorProviderGroup;
	readonly cloudOnlyLabel: string;
	readonly className?: string;
}): JSX.Element {
	return (
		<div
			className={cn(
				"flex h-6 items-center gap-1 px-2 pb-0.5 pt-1 text-[10px] font-medium text-muted-foreground/50",
				className,
			)}
		>
			<ProviderIcon symbol={group.icon} className="h-2.5 w-2.5" />
			<span className="min-w-0 truncate">{group.label}</span>
			{group.models[0]?.remote && (
				<span className="shrink-0 rounded-full bg-primary/15 px-1 text-[9px] font-medium text-primary">
					{cloudOnlyLabel}
				</span>
			)}
		</div>
	);
}

/**
 * 单行模型项。模型多达几百个时，搜索每敲一个字符都会重渲染列表；memo 让没变化的行直接跳过。
 */
const ModelRow = memo(function ModelRow({
	model,
	selected,
	isDefault,
	isFavorite,
	favoriteLabels,
	onToggleFavorite,
	itemClassName,
	visionBadge,
	defaultBadge,
	multiplierLabel,
	onSelect,
}: {
	readonly model: ModelSelectorOptionView;
	readonly selected: boolean;
	readonly isDefault: boolean;
	/** undefined 表示宿主没有接收藏功能，不渲染星标。 */
	readonly isFavorite?: boolean;
	readonly favoriteLabels?: ModelSelectorFavorites["labels"];
	readonly onToggleFavorite?: (key: string) => void;
	readonly itemClassName?: string;
	readonly visionBadge: string;
	readonly defaultBadge: string;
	readonly multiplierLabel?: (option: ModelSelectorOptionView) => string | undefined;
	readonly onSelect: (model: ModelSelectorOptionView, event: Event) => void;
}): JSX.Element {
	return (
		<DropdownMenuItem
			data-model-key={model.key}
			aria-current={selected ? "true" : undefined}
			className={cn(COMPACT_ITEM_CLASS, "group h-7", selected && "bg-accent text-accent-foreground", itemClassName)}
			onSelect={(event) => onSelect(model, event)}
		>
			<span className="min-w-0 flex-1 truncate">{model.displayName}</span>
			{isFavorite !== undefined && favoriteLabels && onToggleFavorite && (
				<button
					type="button"
					tabIndex={-1}
					aria-label={isFavorite ? favoriteLabels.remove : favoriteLabels.add}
					aria-pressed={isFavorite}
					title={isFavorite ? favoriteLabels.remove : favoriteLabels.add}
					// 星标在菜单项里：不能让点击冒泡成「选中该模型」。
					onClick={(event) => {
						event.stopPropagation();
						onToggleFavorite(model.key);
					}}
					// 已收藏的常亮；没收藏的悬停/高亮时才出现，平时 display:none 不占位。
					className={cn(
						"size-5 shrink-0 items-center justify-center rounded hover:bg-muted",
						isFavorite
							? "inline-flex text-amber-500"
							: "hidden text-muted-foreground group-hover:inline-flex group-data-[highlighted]:inline-flex",
					)}
				>
					<span
						aria-hidden="true"
						className={cn("size-3.5", isFavorite ? "icon-[solar--star-bold]" : "icon-[solar--star-linear]")}
					/>
				</button>
			)}
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

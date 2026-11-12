import type {
	ChangeEvent,
	CSSProperties,
	JSX,
	KeyboardEvent as ReactKeyboardEvent,
	MouseEvent as ReactMouseEvent,
	ReactNode,
} from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Popover, PopoverContent, PopoverTrigger } from "@vetta-org/ui/popover";
import { cn } from "@vetta-org/ui/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@vetta-org/ui/dropdown-menu";
import { ThemeSurface } from "../appearance/ThemeSurface";
import { MultiplierTag } from "../shared/MultiplierTag";
import { getProviderIcon, ProviderIcon } from "../shared/provider-icon";
import { ModelSelectorTrigger, type ModelSelectorTriggerVariant } from "./ModelSelectorTrigger";

export type { ModelSelectorTriggerVariant } from "./ModelSelectorTrigger";

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
	/** 以下几项只用于「模型详情」浮层，缺哪项就不显示哪行。 */
	/** 输入模态（text / image / …）；缺省时按 `supportsImage` 推出。 */
	readonly inputModalities?: readonly string[];
	/** 上下文窗口（tokens）。 */
	readonly contextWindow?: number;
	/** 最大输出（tokens）。 */
	readonly maxTokens?: number;
	readonly reasoning?: boolean;
	/** 明确配置的思考档位；没配但有推理能力时只显示「支持」。 */
	readonly reasoningLevels?: readonly string[];
}

/** 「模型详情」浮层的文案。 */
export interface ModelSelectorInfoLabels {
	/** 详情图标的名称（无障碍与悬停提示）。 */
	button: string;
	source: string;
	id: string;
	contextWindow: string;
	maxOutput: string;
	inputModes: string;
	reasoning: string;
	/** 有推理能力但没有明确档位时显示。 */
	reasoningSupported: string;
	multiplier: string;
	/** 输入模态的显示名（text → 文本）。 */
	modality: (modality: string) => string;
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
	 * 提供后，模型行上的识图图标、计费倍率与「默认」徽章不再平铺，统一收进悬停出现的详情图标，
	 * 点开看完整信息；不提供则保持平铺。
	 */
	info?: ModelSelectorInfoLabels;
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
	/** 触发器形态：输入栏胶囊（默认）或表单选择框。 */
	triggerVariant?: ModelSelectorTriggerVariant;
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
	/** 受控的开合状态；不传则视图自己管理。 */
	open?: boolean;
	/** 底栏左侧（如快捷键提示）与右侧（如执行模式选择）的内容；两个都不传就没有底栏。 */
	footerStart?: ReactNode;
	footerEnd?: ReactNode;
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
/** 列表上下边缘渐隐带的高度；定位所选项时要让出这一段，否则它刚好落在渐隐里。 */
const FADE_PX = 16;
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
	triggerVariant = "inline",
	emptyOption,
	className,
	classNames,
	favorites,
	reasoningModelKeys,
	open: openProp,
	footerStart,
	footerEnd,
	onModelSelect,
	onReasoningSelect,
	onOpenChange,
}: ModelSelectorViewProps): JSX.Element {
	const [openState, setOpenState] = useState(false);
	// 宿主可以传 open 来控制（例如快捷键唤起）；不传就由视图自己管。
	const open = openProp ?? openState;
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

	// 常用的模型都在收藏里：当前模型已收藏就直接落在「收藏」栏，方便在常用集合里切换；没收藏则回到它的供应商栏。
	const defaultTab =
		selectedOption && favoriteKeys?.has(selectedOption.key)
			? FAVORITES_TAB
			: selectedOption && groups.some((group) => group.provider === selectedOption.provider)
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
				...group.models.map((model) => ({ kind: "model" as const, model, providerLabel: group.label })),
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
	const info = labels.info;
	const levelLabel = labels.levelLabel;

	const handleOpenChange = useCallback(
		(nextOpen: boolean) => {
			setOpenState(nextOpen);
			onOpenChange?.(nextOpen);
		},
		[onOpenChange],
	);

	// 无论是用户关的还是宿主把 open 改成 false，下次打开都从干净的状态开始。
	useEffect(() => {
		if (open) return;
		setSearchQuery("");
		setTabOverride(null);
		setRailExpanded(false);
	}, [open]);

	useEffect(() => {
		if (!open) return;

		const frame = requestAnimationFrame(() => searchInputRef.current?.focus());
		return () => cancelAnimationFrame(frame);
	}, [open]);

	const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
		setSearchQuery(event.target.value);
	};

	const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
		// Escape 交给菜单关闭；带 Cmd/Ctrl 的组合键是全局快捷键（如再按一次收起菜单），都不拦。
		if (event.key === "Escape" || event.metaKey || event.ctrlKey) return;
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
			info,
			levelLabel,
			reasoningModelKeys,
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
			info,
			levelLabel,
			reasoningModelKeys,
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
					variant={triggerVariant}
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
					// 毛玻璃：半透明的主题底色 + 背景模糊，真正透出面板背后的内容（只留柔和的轮廓）。
					// 底色仍用主题的 background 变量，搜索行等没有自己底色的子元素因此和面板融成一块；
					// 不要再叠自绘的描边/高光去"假装"玻璃。
					"w-auto min-w-[180px] max-w-[calc(100vw-2rem)] overflow-visible bg-background/40 p-0 backdrop-blur-2xl backdrop-saturate-150",
					classNames?.content,
				)}
			>
				<div className="relative overflow-visible rounded-[inherit]">
					<ThemeSurface slot="chat.modelSelectorMenu" />
					<div
						className={cn(
							"relative z-10 flex flex-col overflow-hidden rounded-[inherit]",
							classNames?.contentInner,
						)}
					>
						<div className="flex h-[min(340px,60vh)] min-h-0">
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
										{/* type=search 在 WebKit 里自带清除按钮，隐藏它，只留下面自绘的那个 */}
										<input
											ref={searchInputRef}
											type="search"
											value={searchQuery}
											onChange={handleSearchChange}
											onClick={handleSearchClick}
											placeholder={labels.searchPlaceholder}
											aria-label={labels.searchPlaceholder}
											className="h-7 w-full rounded-md pl-7 pr-7 text-[11px] text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
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
					{(footerStart || footerEnd) && (
						<div className="flex h-9 shrink-0 items-center justify-between gap-2 border-t border-border/40 px-2">
							<div className="flex min-w-0 items-center">{footerStart}</div>
							<div className="flex min-w-0 shrink-0 items-center">{footerEnd}</div>
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
	| { readonly kind: "model"; readonly model: ModelSelectorOptionView; readonly providerLabel: string };

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
	readonly info?: ModelSelectorInfoLabels;
	readonly levelLabel: (value: string) => string;
	readonly reasoningModelKeys?: ReadonlySet<string>;
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
			info={context.info}
			levelLabel={context.levelLabel}
			providerLabel={entry.providerLabel}
			cloudOnlyLabel={context.cloudOnlyLabel}
			hasReasoning={context.reasoningModelKeys?.has(model.key) ?? false}
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

/**
 * 列表滚动容器：上方/下方还有可滚的内容时，对应边缘用 mask 渐隐，提示"这里还能滚"。
 * 用 mask-image 让内容本身淡出，不在上面叠遮罩；到顶/到底的那一侧不渐隐。
 */
function useFadingScroll(scrollRef: { current: HTMLDivElement | null }): {
	readonly node: HTMLDivElement | null;
	readonly setNode: (node: HTMLDivElement | null) => void;
	/** 铺在滚动容器上：mask 样式 + 标明哪一侧在渐隐的 data-fade（top / bottom / both）。 */
	readonly fadeProps: { readonly style?: CSSProperties; readonly "data-fade"?: string };
} {
	// 菜单内容经 Portal 挂载，滚动容器要等到真正进了 DOM 才拿得到，所以用 state 接 ref。
	const [node, setNodeState] = useState<HTMLDivElement | null>(null);
	const [fade, setFade] = useState({ top: false, bottom: false });
	const setNode = useCallback(
		(next: HTMLDivElement | null) => {
			scrollRef.current = next;
			setNodeState(next);
		},
		[scrollRef],
	);

	useEffect(() => {
		if (!node) return;
		const update = (): void => {
			const top = node.scrollTop > 1;
			const bottom = node.scrollTop + node.clientHeight < node.scrollHeight - 1;
			setFade((prev) => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }));
		};
		update();
		node.addEventListener("scroll", update, { passive: true });
		const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(update);
		observer?.observe(node);
		if (node.firstElementChild) observer?.observe(node.firstElementChild);
		return () => {
			node.removeEventListener("scroll", update);
			observer?.disconnect();
		};
	}, [node]);

	if (!fade.top && !fade.bottom) return { node, setNode, fadeProps: {} };
	const mask = `linear-gradient(to bottom, ${fade.top ? `transparent 0, #000 ${FADE_PX}px` : "#000 0"}, ${
		fade.bottom ? `#000 calc(100% - ${FADE_PX}px), transparent 100%` : "#000 100%"
	})`;
	return {
		node,
		setNode,
		fadeProps: {
			style: { maskImage: mask, WebkitMaskImage: mask },
			"data-fade": fade.top && fade.bottom ? "both" : fade.top ? "top" : "bottom",
		},
	};
}

function PlainModelList({ entries, context, scrollRef }: ModelListProps): JSX.Element {
	const { selectedModel } = context;
	const { setNode, fadeProps } = useFadingScroll(scrollRef);
	useEffect(() => {
		if (!selectedModel) return;
		const frame = requestAnimationFrame(() => {
			const container = scrollRef.current;
			const selectedItem = Array.from(container?.querySelectorAll<HTMLElement>(MODEL_ITEM_SELECTOR) ?? []).find(
				(item) => item.dataset.modelKey === selectedModel,
			);
			if (!container || !selectedItem) return;
			// 把所选项对齐到列表顶部（让出渐隐带）；够不着顶部时浏览器会自动停在能滚到的最远处。
			const delta = selectedItem.getBoundingClientRect().top - container.getBoundingClientRect().top;
			container.scrollTop = Math.max(0, container.scrollTop + delta - FADE_PX);
		});
		return () => cancelAnimationFrame(frame);
		// 只在列表出现时定位一次；选中后菜单还开着时不要再跳。
		// biome-ignore lint/correctness/useExhaustiveDependencies: 见上
	}, []);

	return (
		<div ref={setNode} {...fadeProps} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
			{entries.map((entry) => (
				<ListEntryView key={entryKey(entry)} entry={entry} context={context} />
			))}
		</div>
	);
}

function VirtualModelList({ entries, context, scrollRef }: ModelListProps): JSX.Element {
	const { node: scrollElement, setNode: setRefs, fadeProps } = useFadingScroll(scrollRef);
	const virtualizer = useVirtualizer({
		count: entries.length,
		getScrollElement: () => scrollElement,
		estimateSize: (index) => (entries[index]?.kind === "header" ? HEADER_HEIGHT : ROW_HEIGHT),
		getItemKey: (index) => {
			const entry = entries[index];
			return entry ? entryKey(entry) : index;
		},
		overscan: VIRTUAL_OVERSCAN,
		// 定位到某项时让它落在顶部渐隐带下面，而不是被淡掉。
		scrollPaddingStart: FADE_PX,
		initialRect: { width: 0, height: LIST_FALLBACK_HEIGHT },
	});

	const { selectedModel } = context;
	useEffect(() => {
		if (!scrollElement || !selectedModel) return;
		const index = entries.findIndex((entry) => entry.kind === "model" && entry.model.key === selectedModel);
		if (index >= 0) virtualizer.scrollToIndex(index, { align: "start" });
		// 只在滚动容器就绪时定位一次；选中后菜单还开着时不要再跳。
		// biome-ignore lint/correctness/useExhaustiveDependencies: 见上
	}, [scrollElement]);

	return (
		<div ref={setRefs} {...fadeProps} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
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
	info,
	levelLabel,
	providerLabel,
	cloudOnlyLabel,
	hasReasoning,
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
	/** 提供后识图/倍率/默认标识收进详情浮层。 */
	readonly info?: ModelSelectorInfoLabels;
	readonly levelLabel: (value: string) => string;
	readonly providerLabel: string;
	readonly cloudOnlyLabel: string;
	readonly hasReasoning: boolean;
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
			{info && (
				<ModelInfoButton
					model={model}
					info={info}
					levelLabel={levelLabel}
					providerLabel={providerLabel}
					cloudOnlyLabel={cloudOnlyLabel}
					defaultBadge={isDefault ? defaultBadge : undefined}
					multiplier={multiplierLabel?.(model)}
					hasReasoning={hasReasoning}
				/>
			)}
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
			{!info && (
				<>
					<ModelMultiplier label={multiplierLabel?.(model)} />
					{model.supportsImage && <ModelVisionIcon label={visionBadge} />}
					{isDefault && (
						<span className="shrink-0 rounded-full bg-primary/15 px-1 text-[9px] font-medium text-primary">
							{defaultBadge}
						</span>
					)}
				</>
			)}
		</DropdownMenuItem>
	);
});

/** 输入 token 数的简写：128K / 1M；2 的幂按 1024 进位（131072 → 128K），其余按 1000。 */
function formatTokens(value: number): string {
	const trim = (n: number): string => `${Math.round(n * 10) / 10}`;
	if (value >= 1 << 20 && value % (1 << 20) === 0) return `${value / (1 << 20)}M`;
	if (value >= 1024 && value < 1 << 20 && value % 1024 === 0) return `${value / 1024}K`;
	if (value >= 1_000_000) return `${trim(value / 1_000_000)}M`;
	if (value >= 1000) return `${trim(value / 1000)}K`;
	return String(value);
}

const MODALITY_ICONS: Record<string, string> = {
	text: "icon-[solar--text-field-linear]",
	image: "icon-[solar--gallery-linear]",
	audio: "icon-[solar--microphone-3-linear]",
	video: "icon-[solar--videocamera-record-linear]",
	pdf: "icon-[solar--document-text-linear]",
};

/**
 * 模型行上唯一的详情入口：悬停/高亮时才出现（打开浮层期间保持显示，免得触发器消失让浮层失去锚点），
 * 点开后在浮层里看名称、来源、ID、上下文与输入模式等。
 */
function ModelInfoButton({
	model,
	info,
	levelLabel,
	providerLabel,
	cloudOnlyLabel,
	defaultBadge,
	multiplier,
	hasReasoning,
}: {
	readonly model: ModelSelectorOptionView;
	readonly info: ModelSelectorInfoLabels;
	readonly levelLabel: (value: string) => string;
	readonly providerLabel: string;
	readonly cloudOnlyLabel: string;
	readonly defaultBadge?: string;
	readonly multiplier?: string;
	readonly hasReasoning: boolean;
}): JSX.Element {
	const modalities = model.inputModalities?.length
		? Array.from(new Set(model.inputModalities))
		: ["text", ...(model.supportsImage ? ["image"] : [])];
	const levels = model.reasoningLevels ?? [];
	const supportsReasoning = hasReasoning || Boolean(model.reasoning) || levels.length > 0;

	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					tabIndex={-1}
					aria-label={info.button}
					title={info.button}
					// 在菜单项里：不能让点击冒泡成「选中该模型」。
					onClick={(event) => event.stopPropagation()}
					className="hidden size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted data-[state=open]:inline-flex group-hover:inline-flex group-data-[highlighted]:inline-flex"
				>
					<span aria-hidden="true" className="icon-[solar--info-circle-linear] size-3.5" />
				</button>
			</PopoverTrigger>
			<PopoverContent
				side="right"
				align="start"
				sideOffset={10}
				collisionPadding={16}
				// 浮层经 Portal 挂出去，但 React 事件仍会冒泡回所在的菜单项：不拦就会被当成「选中该模型」或触发菜单的键盘导航。
				onClick={(event) => event.stopPropagation()}
				onPointerDown={(event) => event.stopPropagation()}
				onPointerUp={(event) => event.stopPropagation()}
				// 菜单项在 pointermove 时会把焦点抢到自己身上，拖选文字时选区会被打断。
				onPointerMove={(event) => event.stopPropagation()}
				onKeyDown={(event) => {
					if (event.key !== "Escape") event.stopPropagation();
				}}
				// 只在「点了浮层外面」或按 Esc 时关闭。鼠标划过菜单里别的行会让那一行拿到焦点，
				// Radix 会把"焦点移出浮层"也当成关闭，于是鼠标一动浮层就没了；这里忽略焦点移动。
				onFocusOutside={(event) => event.preventDefault()}
				// 应用默认不可选中文字；详情里的 ID、名称等常要复制，整个浮层放开选择。
				className="w-64 cursor-text select-text gap-3 border-border/60 bg-background/70 p-3 backdrop-blur-xl backdrop-saturate-150"
			>
				<div className="flex min-w-0 flex-col gap-0.5">
					<div className="flex items-center gap-1.5">
						<p className="min-w-0 break-words text-[13px] font-medium leading-snug text-foreground">
							{model.displayName}
						</p>
						{defaultBadge && (
							<span className="shrink-0 rounded-full bg-primary/15 px-1.5 text-[10px] font-medium text-primary">
								{defaultBadge}
							</span>
						)}
					</div>
				</div>
				<dl className="flex flex-col gap-2.5 text-[11px]">
					<InfoRow label={info.source}>
						<span className="flex flex-wrap items-center gap-1">
							<span className="break-words">{providerLabel}</span>
							{model.remote && (
								<span className="shrink-0 rounded-full bg-primary/15 px-1 text-[9px] font-medium text-primary">
									{cloudOnlyLabel}
								</span>
							)}
						</span>
					</InfoRow>
					<InfoRow label={info.id}>
						<span className="break-all font-mono text-[10px]">{model.modelId}</span>
					</InfoRow>
					{model.contextWindow ? (
						<InfoRow label={info.contextWindow}>
							<span title={model.contextWindow.toLocaleString()}>{formatTokens(model.contextWindow)}</span>
						</InfoRow>
					) : null}
					{model.maxTokens ? (
						<InfoRow label={info.maxOutput}>
							<span title={model.maxTokens.toLocaleString()}>{formatTokens(model.maxTokens)}</span>
						</InfoRow>
					) : null}
					<InfoRow label={info.inputModes}>
						<span className="flex flex-wrap items-center gap-1">
							{modalities.map((modality) => (
								<span
									key={modality}
									className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px]"
								>
									{MODALITY_ICONS[modality] && (
										<span aria-hidden="true" className={cn(MODALITY_ICONS[modality], "size-3")} />
									)}
									{info.modality(modality)}
								</span>
							))}
						</span>
					</InfoRow>
					{supportsReasoning ? (
						<InfoRow label={info.reasoning}>
							{levels.length > 0 ? (
								<span className="flex flex-wrap items-center gap-1">
									{levels.map((level) => (
										<span key={level} className="rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px]">
											{levelLabel(level)}
										</span>
									))}
								</span>
							) : (
								info.reasoningSupported
							)}
						</InfoRow>
					) : null}
					{multiplier ? (
						<InfoRow label={info.multiplier}>
							<span>{multiplier}</span>
						</InfoRow>
					) : null}
				</dl>
			</PopoverContent>
		</Popover>
	);
}

/** 标签在上、值在下，左对齐；标签比值小一号。 */
function InfoRow({ label, children }: { readonly label: string; readonly children: ReactNode }): JSX.Element {
	return (
		<div className="flex min-w-0 flex-col items-start gap-0.5">
			<dt className="text-[10px] leading-none text-muted-foreground">{label}</dt>
			<dd className="min-w-0 text-left text-foreground">{children}</dd>
		</div>
	);
}

function ModelMultiplier({ label }: { label?: string }): JSX.Element | null {
	return label ? <MultiplierTag text={label} /> : null;
}

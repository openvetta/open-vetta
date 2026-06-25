import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { AnimatePresence, motion } from "motion/react";
import {
	activityPanelWidthAtom,
	activityPanelMaxWidth,
	ACTIVITY_PANEL_MIN_WIDTH,
	ACTIVITY_PANEL_MIN_CHAT_AREA,
	ACTIVITY_PANEL_PREVIEW_MIN_WIDTH,
	activityPanelOpenAtom,
	activityPanelTabByProjectAtom,
	activityTabOrderAtom,
	hiddenActivityTabsAtom,
	activeSessionAtom,
	backgroundTasksBySessionAtom,
	flowingChatUnreadAtom,
	getBackgroundTasksForSession,
	todoItemsBySessionAtom,
	getTodoItemsForSession,
	debugModeAtom,
	closeInlineFilePreviewAtom,
	inlineFilePreviewAtom,
	inlineFilePreviewContextReadonlyAtom,
	currentScenarioAtom,
	pluginActivityTabsAtom,
	sidebarCollapsedAtom,
	sidebarWidthAtom,
} from "@shared/store/atoms";
import { FilePreviewView, usePreviewNav } from "@domains/file-preview/components/FilePreviewView";
import { useProjectProfile, type ActivityTabKey } from "@shared/lib/project-profile";
import { FilesPanel } from "@domains/file-explorer/components/FilesPanel";
import { JourneyPanel } from "./JourneyPanel";
import { KnowledgeHistoryPanel } from "./KnowledgeHistoryPanel";
import { ChatTabPanel } from "./ChatTabPanel";
import { BatchProgressTabPanel } from "./BatchProgressTabPanel";
import { BackgroundTasksTabPanel } from "./BackgroundTasksTabPanel";
import { ScheduleExecutionTabPanel } from "./ScheduleExecutionTabPanel";
import { TodoTabPanel } from "./TodoTabPanel";
import { DebugTabPanel } from "./DebugTabPanel";
import { DEFAULT_PLUGIN_TAB_ICON, PluginTabPicker } from "./PluginTabPicker";
import { PluginActivityTabPanel } from "@domains/plugins/components/PluginActivityTabPanel";
import { TabBar, type TabBarItem } from "@shared/components/ui/tab-bar";
import { ResizeHandle } from "@shared/components/ResizeHandle";
import { useNarrowScreen, useWindowWidth } from "@shared/hooks/useNarrowScreen";

const MIN_WIDTH = ACTIVITY_PANEL_MIN_WIDTH;
const MIN_CHAT_AREA = ACTIVITY_PANEL_MIN_CHAT_AREA;

/** 永远禁止手动隐藏的 tab：文件、知识库加工历史。 */
const NON_HIDEABLE_TABS = new Set<ActivityTabKey>(["file", "knowledge-history"]);

/**
 * 按用户拖拽排序 `order` 重排 `items`：出现在 order 中的按其顺序，未出现的（新 tab）
 * 保持原相对顺序追加在后面。
 */
function applyTabOrder<T extends { key: ActivityTabKey }>(items: T[], order: string[]): T[] {
	if (order.length === 0) return items;
	const rank = (key: string): number => {
		const i = order.indexOf(key);
		return i === -1 ? Number.MAX_SAFE_INTEGER : i;
	};
	return items
		.map((item, index) => ({ item, index }))
		.sort((a, b) => rank(a.item.key) - rank(b.item.key) || a.index - b.index)
		.map((x) => x.item);
}

interface ActivityPanelProps {
	/** 显式指定 cwd（项目详情页用），不传则回退到当前活动 session */
	cwd?: string | null;
	/**
	 * 是否启用插件 tab（attach 池 + "+"选择器）。IM 会话查看器传 false——
	 * 其 cwd 是单一固定目录，无法满足 per-session 隔离语义（见 ADR-0026）。
	 */
	enablePluginTabs?: boolean;
	/**
	 * 知识库加工历史模式：只显示唯一的「知识库加工历史」tab（列出 cwd 下加工 session、点击跳转），
	 * 不显示文件/旅程等其它 tab。查看加工 session 时启用。
	 */
	knowledgeHistory?: boolean;
}

export function ActivityPanel({
	cwd: cwdProp,
	enablePluginTabs = true,
	knowledgeHistory = false,
}: ActivityPanelProps = {}): JSX.Element {
	const [isOpen, setOpen] = useAtom(activityPanelOpenAtom);
	const narrow = useNarrowScreen();
	const activeSession = useAtomValue(activeSessionAtom);
	const [width, setWidth] = useAtom(activityPanelWidthAtom);
	const [isResizing, setIsResizing] = useState(false);
	// 因宽度不足被 TabBar 响应式收纳的页签 key（由 TabBar 上报），用于"下拉"菜单展示
	const [overflowKeys, setOverflowKeys] = useState<ActivityTabKey[]>([]);
	const [tabByProject, setTabByProject] = useAtom(activityPanelTabByProjectAtom);

	const windowWidth = useWindowWidth();
	const sidebarWidth = useAtomValue(sidebarWidthAtom);
	// 动态上限：占满到只给主聊天区保留 MIN_CHAT_AREA。隐藏侧边栏后聊天区仍能保有此宽度。
	const maxWidth = activityPanelMaxWidth(windowWidth);

	const [sidebarCollapsed, setSidebarCollapsed] = useAtom(sidebarCollapsedAtom);
	// 因面板过宽而自动折叠侧边栏时，记住折叠前的状态以便回拉时恢复。
	const widthCollapsedSidebarRef = useRef<boolean | null>(null);
	// 跟踪 sidebarCollapsed 上一次的值，用于识别「用户手动展开侧边栏」这一跳变。
	const prevSidebarCollapsedRef = useRef(sidebarCollapsed);

	const cwd = cwdProp ?? activeSession?.cwd ?? null;
	const { profile } = useProjectProfile(cwd);
	const unreadMap = useAtomValue(flowingChatUnreadAtom);
	const chatUnread = profile?.flowingId != null ? (unreadMap.get(profile.flowingId) ?? 0) : 0;
	const todoMap = useAtomValue(todoItemsBySessionAtom);
	const todoItems = useMemo(
		() => getTodoItemsForSession(todoMap, activeSession?.runtimeId ?? null),
		[todoMap, activeSession?.runtimeId],
	);
	const hasTodo = todoItems.length > 0;
	const backgroundTasksMap = useAtomValue(backgroundTasksBySessionAtom);
	const backgroundTasks = useMemo(
		() => getBackgroundTasksForSession(backgroundTasksMap, activeSession?.runtimeId ?? null),
		[backgroundTasksMap, activeSession?.runtimeId],
	);
	const hasBackgroundTasks = backgroundTasks.length > 0;
	const debugMode = useAtomValue(debugModeAtom);

	// 外部插件面板：已加载插件注册的全部 contribution 都作为常驻标签随响应式拉伸显示，
	// 不再用 attach 勾选挑选；不需要的用减号隐藏（进"已隐藏面板"恢复）。
	const registeredPluginTabs = useAtomValue(pluginActivityTabsAtom);
	// 会话页插槽按对话类型显隐：fail-closed——仅当场景已知且在该标签卡的 scope_use 内才显示。
	// 未声明 scope_use / 场景未知（新建会话页、尚未加载）一律不显示。
	const currentScenario = useAtomValue(currentScenarioAtom);
	const pluginTabContribs = useMemo(
		() =>
			enablePluginTabs && currentScenario !== null
				? registeredPluginTabs.filter((tab) => tab.scope_use?.includes(currentScenario))
				: [],
		[enablePluginTabs, registeredPluginTabs, currentScenario],
	);
	// 用户手动隐藏的内置/动态 tab（per-cwd）+ 拖拽排序（per-cwd）
	const [hiddenTabsMap, setHiddenTabsMap] = useAtom(hiddenActivityTabsAtom);
	const [tabOrderMap, setTabOrderMap] = useAtom(activityTabOrderAtom);
	const hiddenKeys = useMemo(
		() => (cwd ? (hiddenTabsMap.get(cwd) ?? []) : []),
		[cwd, hiddenTabsMap],
	);
	const tabOrder = useMemo(() => (cwd ? (tabOrderMap.get(cwd) ?? []) : []), [cwd, tabOrderMap]);

	const onResize = useCallback(
		(delta: number) => {
			setIsResizing(true);
			setWidth((w) => Math.min(maxWidth, Math.max(MIN_WIDTH, w + delta)));
		},
		[setWidth, maxWidth],
	);

	const onResizeEnd = useCallback(() => setIsResizing(false), []);

	// 窗口缩小后，把已存宽度夹回新上限内。
	useEffect(() => {
		setWidth((w) => Math.min(maxWidth, Math.max(MIN_WIDTH, w)));
	}, [maxWidth, setWidth]);

	// 侧边栏 ↔ 活动面板联动，保证聊天区不被压到 MIN_CHAT_AREA 以下。两个互斥的旋钮，
	// 以「用户最后操作的那个」为准：
	//  - 拖宽面板越过阈值 → 自动折叠侧边栏（记住原状态，回拉到阈值内自动恢复）；
	//  - 手动展开侧边栏而面板过宽 → 收窄面板让出空间（而不是挤压聊天区）。
	// 文件预览把面板拉到 max 时走前一条，无需单独处理。
	useEffect(() => {
		const openLimit = Math.max(MIN_WIDTH, windowWidth - sidebarWidth - MIN_CHAT_AREA);
		const collapsedChanged = prevSidebarCollapsedRef.current !== sidebarCollapsed;
		prevSidebarCollapsedRef.current = sidebarCollapsed;

		// 用户手动展开侧边栏，而面板过宽 → 收窄面板到阈值内（显式操作解除宽度联动）。
		if (collapsedChanged && !sidebarCollapsed && isOpen && width > openLimit) {
			widthCollapsedSidebarRef.current = null;
			setWidth(openLimit);
			return;
		}

		const shouldCollapse = isOpen && width > openLimit;
		if (shouldCollapse) {
			if (widthCollapsedSidebarRef.current === null) {
				widthCollapsedSidebarRef.current = sidebarCollapsed;
				setSidebarCollapsed(true);
			}
		} else if (widthCollapsedSidebarRef.current !== null) {
			const restore = widthCollapsedSidebarRef.current;
			widthCollapsedSidebarRef.current = null;
			setSidebarCollapsed(restore);
		}
	}, [width, windowWidth, sidebarWidth, isOpen, sidebarCollapsed, setSidebarCollapsed, setWidth]);

	// 全量 tab（未过滤隐藏、未排序）：内置 + 动态 + 已 attach 插件。removable 标记可隐藏性。
	const allTabItems: TabBarItem<ActivityTabKey>[] = useMemo(() => {
		if (knowledgeHistory) {
			return [
				{
					key: "knowledge-history" as ActivityTabKey,
					label: "知识库加工历史",
					icon: "icon-[mdi--history]",
				},
			];
		}
		const base: TabBarItem<ActivityTabKey>[] = (profile?.activityTabs ?? []).map((t) => ({
			key: t.key,
			label: t.label,
			icon: t.icon,
			badge: t.key === "chat" ? chatUnread : undefined,
			removable: !NON_HIDEABLE_TABS.has(t.key),
		}));
		// Dynamically inject todo tab when items exist
		if (hasTodo) {
			const todoDone = todoItems.filter((i) => i.status === "done").length;
			base.push({
				key: "todo" as ActivityTabKey,
				label: "待办",
				icon: "icon-[mdi--checkbox-marked-circle-outline]",
				badge: todoItems.length - todoDone > 0 ? todoItems.length - todoDone : undefined,
				removable: true,
			});
		}
		// Dynamically inject background-tasks tab when the session has background tasks
		if (hasBackgroundTasks) {
			const running = backgroundTasks.filter((t) => t.status === "running").length;
			base.push({
				key: "background-tasks" as ActivityTabKey,
				label: "后台任务",
				icon: "icon-[mdi--console-line]",
				badge: running > 0 ? running : undefined,
				removable: true,
			});
		}
		// Dynamically inject debug tab when debug mode is enabled
		if (debugMode) {
			base.push({
				key: "debug" as ActivityTabKey,
				label: "调试",
				icon: "icon-[mdi--bug-outline]",
				removable: true,
			});
		}
		// 外部插件面板追加在所有内置 tab 之后，全部常驻
		for (const tab of pluginTabContribs) {
			base.push({
				key: `plugin:${tab.pluginId}:${tab.tabId}` as ActivityTabKey,
				label: tab.label,
				icon: tab.icon ?? DEFAULT_PLUGIN_TAB_ICON,
				removable: true,
			});
		}
		return base;
	}, [
		knowledgeHistory,
		profile,
		chatUnread,
		hasTodo,
		todoItems,
		hasBackgroundTasks,
		backgroundTasks,
		debugMode,
		pluginTabContribs,
	]);

	// 可见 tab：剔除被隐藏的 tab（内置/动态/插件统一进隐藏集），再按用户拖拽顺序重排
	const tabItems = useMemo(
		() => applyTabOrder(allTabItems.filter((t) => !hiddenKeys.includes(t.key)), tabOrder),
		[allTabItems, hiddenKeys, tabOrder],
	);

	// "+"下拉里「已隐藏面板」区：当前适用但被隐藏的内置/动态 tab，可点击恢复
	const restorableTabs = useMemo(
		() =>
			allTabItems
				.filter((t) => hiddenKeys.includes(t.key))
				.map((t) => ({ key: t.key as string, label: t.label, icon: t.icon })),
		[allTabItems, hiddenKeys],
	);

	// 当前 active tab：优先取项目记忆，否则 profile 默认；二者都不在可见 tab 中
	// （如默认 tab 被隐藏）时退回第一个可见 tab，避免激活到已隐藏 tab 导致内容残留无高亮。
	const activeTab: ActivityTabKey = useMemo(() => {
		if (knowledgeHistory) return "knowledge-history";
		if (cwd) {
			const remembered = tabByProject.get(cwd);
			if (remembered && tabItems.some((t) => t.key === remembered)) {
				return remembered;
			}
		}
		const fallback = profile?.defaultActivityTab ?? "file";
		if (tabItems.some((t) => t.key === fallback)) return fallback;
		return tabItems[0]?.key ?? fallback;
	}, [knowledgeHistory, cwd, tabByProject, profile, tabItems]);

	// 动态唤起：任何地方程序化打开某 tab（写入 activityPanelTabByProjectAtom）时，
	// 若该 tab 当前被隐藏在"+"里且仍是有效候选，则自动移出隐藏集抬回标签栏并激活。
	// 集中在此监听，免去每个触发点（InputBar/TextBlock/插件等）各自处理。
	useEffect(() => {
		if (!cwd) return;
		const remembered = tabByProject.get(cwd);
		if (!remembered || !hiddenKeys.includes(remembered)) return;
		if (!allTabItems.some((t) => t.key === remembered)) return;
		const next = new Map(hiddenTabsMap);
		next.set(
			cwd,
			(next.get(cwd) ?? []).filter((k) => k !== remembered),
		);
		setHiddenTabsMap(next);
	}, [cwd, tabByProject, hiddenKeys, allTabItems, hiddenTabsMap, setHiddenTabsMap]);

	const onTabChange = useCallback(
		(next: ActivityTabKey) => {
			if (!cwd) return;
			setTabByProject((prev) => {
				const map = new Map(prev);
				map.set(cwd, next);
				return map;
			});
		},
		[cwd, setTabByProject],
	);

	// 当前激活的插件 tab（activeTab 形如 plugin:<pluginId>:<tabId>）
	const activePluginTab = useMemo(() => {
		if (!activeTab.startsWith("plugin:")) return null;
		return (
			pluginTabContribs.find((tab) => `plugin:${tab.pluginId}:${tab.tabId}` === activeTab) ?? null
		);
	}, [activeTab, pluginTabContribs]);

	// 隐藏（收回到下拉）某个 tab：内置/动态/插件统一写入隐藏集。
	// 隐藏当前激活 tab 时切到隐藏后仍可见的第一个 tab（file 永不可隐藏，必然存在）。
	const onRemoveTab = useCallback(
		(key: ActivityTabKey) => {
			if (!cwd || NON_HIDEABLE_TABS.has(key)) return;
			const next = new Map(hiddenTabsMap);
			const current = next.get(cwd) ?? [];
			if (!current.includes(key)) next.set(cwd, [...current, key]);
			setHiddenTabsMap(next);
			if (activeTab === key) {
				const fallback = tabItems.find((t) => t.key !== key)?.key ?? "file";
				onTabChange(fallback);
			}
		},
		[cwd, hiddenTabsMap, setHiddenTabsMap, activeTab, tabItems, onTabChange],
	);

	// 从"+"下拉恢复某个被隐藏的内置/动态 tab，并切换到它
	const onRestoreTab = useCallback(
		(key: string) => {
			if (!cwd) return;
			const next = new Map(hiddenTabsMap);
			const current = next.get(cwd) ?? [];
			next.set(
				cwd,
				current.filter((k) => k !== key),
			);
			setHiddenTabsMap(next);
			onTabChange(key as ActivityTabKey);
		},
		[cwd, hiddenTabsMap, setHiddenTabsMap, onTabChange],
	);

	// 拖拽排序：持久化该 cwd 的完整 tab 顺序
	const onReorderTabs = useCallback(
		(keys: ActivityTabKey[]) => {
			if (!cwd) return;
			const next = new Map(tabOrderMap);
			next.set(cwd, keys);
			setTabOrderMap(next);
		},
		[cwd, tabOrderMap, setTabOrderMap],
	);

	// 被响应式收纳的页签（按当前可见顺序），喂给"下拉"菜单
	const overflowTabs = useMemo(
		() =>
			tabItems
				.filter((t) => overflowKeys.includes(t.key))
				.map((t) => ({ key: t.key as string, label: t.label, icon: t.icon })),
		[tabItems, overflowKeys],
	);

	// 下拉按钮：有可恢复的隐藏 tab、或被响应式收纳的页签时才显示
	const showTabPicker =
		cwd != null && !knowledgeHistory && (restorableTabs.length > 0 || overflowTabs.length > 0);

	// 窄屏：活动面板不再挤压内容，改为从底部升起的全宽 bottom sheet。
	// 窄屏不走内嵌预览（FilesPanel/ArtifactCard 等改用全屏 Dialog），故无需特殊处理。
	// narrowSheet 时完全不渲染 in-flow 的 <aside>，否则父级 flex 的 gap 会在
	// 右侧多留一道间距，导致输入栏左右边距不一致。
	const narrowSheet = narrow;
	const bottomSheet = narrowSheet && isOpen;

	const panelBody = (
		<>
			{/* Tab list 顶栏 — 始终渲染（即便只有一个 tab）。浏览器式页签悬浮在卡片上方，
			    激活页签与卡片底色融合（TabBar 内部向下延伸 1px 盖住卡片描边）。页签按宽度
			    响应式收纳，放不下的收进右侧下拉；下拉同时可恢复被减号隐藏的页签。 */}
			{(tabItems.length > 0 || showTabPicker) && (
				<div className="group/activity-tabs flex shrink-0 items-end">
					<TabBar
						className="min-w-0 flex-1"
						items={tabItems}
						value={activeTab}
						onChange={onTabChange}
						suppressLayoutAnimation={isResizing}
						onRemove={knowledgeHistory ? undefined : onRemoveTab}
						onReorder={knowledgeHistory ? undefined : onReorderTabs}
						onOverflowChange={knowledgeHistory ? undefined : setOverflowKeys}
					/>
					{showTabPicker && (
						<PluginTabPicker
							hiddenTabs={restorableTabs}
							onRestore={onRestoreTab}
							overflowTabs={overflowTabs}
							onSelectOverflow={(k) => onTabChange(k as ActivityTabKey)}
						/>
					)}
				</div>
			)}
			<div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-border bg-muted shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
				{/* cwd 作 key：切 session 时整块 remount，强制各 tab 的内部缓存/订阅按
				    新 cwd 重新拉取，避免上个 session 的卡片内容残留。 */}
				<div key={cwd ?? "__none__"} className="flex min-h-0 flex-1 flex-col">
					{activeTab === "file" && <FileTabContent cwd={cwd} />}
					{activeTab === "journey" && cwd && <JourneyPanel cwd={cwd} />}
					{activeTab === "chat" && cwd && <ChatTabPanel cwd={cwd} />}
					{activeTab === "batch-progress" && cwd && <BatchProgressTabPanel cwd={cwd} />}
					{activeTab === "schedule-records" && cwd && <ScheduleExecutionTabPanel cwd={cwd} />}
					{activeTab === "todo" && cwd && <TodoTabPanel />}
					{activeTab === "background-tasks" && cwd && <BackgroundTasksTabPanel />}
					{activeTab === "debug" && cwd && <DebugTabPanel cwd={cwd} />}
					{activeTab === "knowledge-history" && <KnowledgeHistoryPanel cwd={cwd} />}
					{activePluginTab && cwd && <PluginActivityTabPanel tab={activePluginTab} cwd={cwd} />}
				</div>
			</div>
		</>
	);

	return (
		<>
			{!narrowSheet && (
				<aside
					style={{
						width: isOpen ? width : 0,
						transition: isResizing ? "none" : "width 0.2s ease-in-out",
					}}
					className="relative shrink-0 overflow-hidden"
				>
					<div className="flex h-full flex-col" style={{ width }}>
						{panelBody}
					</div>
					{isOpen && <ResizeHandle side="left" onResize={onResize} onResizeEnd={onResizeEnd} />}
				</aside>
			)}
			{/* 窄屏 bottom sheet：从底部升起、宽度站满，点击空白区域（遮罩）关闭 */}
			<AnimatePresence>
				{bottomSheet && (
					<>
						<motion.div
							key="activity-sheet-backdrop"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{ duration: 0.2 }}
							onClick={() => setOpen(false)}
							className="fixed inset-0 z-40 bg-black/25"
						/>
						<motion.div
							key="activity-sheet"
							initial={{ y: "100%" }}
							animate={{ y: 0 }}
							exit={{ y: "100%" }}
							transition={{ duration: 0.26, ease: [0.22, 0.61, 0.36, 1] }}
							className="fixed inset-x-0 bottom-0 top-16 z-50 flex flex-col rounded-t-2xl border-t border-border bg-background p-2 shadow-2xl shadow-black/40"
						>
							{panelBody}
						</motion.div>
					</>
				)}
			</AnimatePresence>
		</>
	);
}

const TREE_DEFAULT_WIDTH = 220;
const TREE_MIN_WIDTH = 160;
const TREE_MAX_WIDTH = 360;
// 面板宽度动画时长（aside transition: width 0.2s）+ 缓冲：动画跑完再挂载预览重内容，避免抢主线程导致划出卡顿
const PREVIEW_MOUNT_DELAY_MS = 240;

function FileTabContent({ cwd }: { cwd: string | null }): JSX.Element {
	const [previewCtx, setPreviewCtx] = useAtom(inlineFilePreviewContextReadonlyAtom);
	const setPreview = useSetAtom(inlineFilePreviewAtom);
	const closePreview = useSetAtom(closeInlineFilePreviewAtom);
	const width = useAtomValue(activityPanelWidthAtom);
	const { goPrev, goNext } = usePreviewNav((updater) => {
		if (typeof updater === "function") {
			setPreviewCtx(updater(previewCtx));
		} else {
			setPreview(updater);
		}
	});

	// 预览显隐纯由面板宽度驱动：选中文件且面板够宽才展示右侧预览，否则只剩目录树。
	// 拖窄到阈值以下自动收起、拖宽回来自动恢复（见 ACTIVITY_PANEL_PREVIEW_MIN_WIDTH）。
	const showPreview = previewCtx !== null && width >= ACTIVITY_PANEL_PREVIEW_MIN_WIDTH;

	// width state 在点击文件时即刻跳到目标值，showPreview 随之 true，但 aside 仍在做
	// width 动画。若此刻挂载预览（含插件首次加载/解码等重活）会抢主线程导致划出卡顿。
	// 故 showPreview 从无到有后延迟挂载，等动画跑完再渲染预览内容；已展开时切文件不延迟。
	const [previewMounted, setPreviewMounted] = useState(false);
	useEffect(() => {
		if (!showPreview) {
			setPreviewMounted(false);
			return;
		}
		const t = setTimeout(() => setPreviewMounted(true), PREVIEW_MOUNT_DELAY_MS);
		return () => clearTimeout(t);
	}, [showPreview]);

	// 文件树列宽，预览展开时可拖拽分隔调整。
	const [treeWidth, setTreeWidth] = useState(TREE_DEFAULT_WIDTH);
	const onTreeResize = useCallback((delta: number) => {
		setTreeWidth((w) => Math.max(TREE_MIN_WIDTH, Math.min(TREE_MAX_WIDTH, w + delta)));
	}, []);

	// 预览展开时可手动收起左侧文件树，把空间全部让给预览。
	const [treeCollapsed, setTreeCollapsed] = useState(false);
	const toggleTree = useCallback(() => setTreeCollapsed((c) => !c), []);
	// 预览收起时一并恢复文件树，避免下次展开预览时残留隐藏态。
	useEffect(() => {
		if (!showPreview) setTreeCollapsed(false);
	}, [showPreview]);

	// 切走文件 tab / 切换 session 时卸载：清空预览并回拉面板宽度，避免「拉宽」残留到别的 tab。
	useEffect(() => () => closePreview(), [closePreview]);

	// 目录树：无预览时铺满；有预览时固定在 treeWidth（可拖拽分隔），多出的宽度让给右侧预览。
	// 预览展开且手动收起文件树时，整列隐藏，由预览头部按钮重新展开。
	const showTree = !showPreview || !treeCollapsed;
	return (
		<div className="flex min-h-0 flex-1 overflow-hidden">
			{showTree && (
				<div
					className={
						showPreview
							? "relative flex min-h-0 shrink-0 flex-col overflow-hidden border-r border-border/50"
							: "flex min-h-0 flex-1 flex-col overflow-hidden"
					}
					style={showPreview ? { width: treeWidth } : undefined}
				>
					<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
						<FilesPanel cwd={cwd} />
					</div>
					{showPreview && <ResizeHandle side="right" onResize={onTreeResize} />}
				</div>
			)}
			{showPreview && previewCtx && (
				<div className="flex min-w-0 flex-1 flex-col overflow-hidden">
					{/* 动画期间静态占位（不挂载重内容），动画结束后再渲染预览 */}
					{previewMounted ? (
						<FilePreviewView
							ctx={previewCtx}
							onPrev={goPrev}
							onNext={goNext}
							onClose={closePreview}
							canPrev={previewCtx.index > 0}
							canNext={previewCtx.index < previewCtx.items.length - 1}
							enableKeyboard
							onToggleSidebar={toggleTree}
							sidebarCollapsed={treeCollapsed}
						/>
					) : (
						<div className="flex min-h-0 flex-1" />
					)}
				</div>
			)}
		</div>
	);
}

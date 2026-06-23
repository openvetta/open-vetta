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
	activeSessionAtom,
	attachedPluginTabsAtom,
	backgroundTasksBySessionAtom,
	flowingChatUnreadAtom,
	getBackgroundTasksForSession,
	todoItemsBySessionAtom,
	getTodoItemsForSession,
	debugModeAtom,
	closeInlineFilePreviewAtom,
	inlineFilePreviewAtom,
	inlineFilePreviewContextReadonlyAtom,
	pluginActivityTabsAtom,
	sidebarCollapsedAtom,
	sidebarWidthAtom,
	type RegisteredActivityTab,
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
	const [tabByProject, setTabByProject] = useAtom(activityPanelTabByProjectAtom);

	const windowWidth = useWindowWidth();
	const sidebarWidth = useAtomValue(sidebarWidthAtom);
	// 动态上限：占满到只给主聊天区保留 MIN_CHAT_AREA。隐藏侧边栏后聊天区仍能保有此宽度。
	const maxWidth = activityPanelMaxWidth(windowWidth);

	const setSidebarCollapsed = useSetAtom(sidebarCollapsedAtom);
	// 因面板过宽而自动折叠侧边栏时，记住折叠前的状态以便回拉时恢复。
	const widthCollapsedSidebarRef = useRef<boolean | null>(null);

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

	// 插件 tab：可添加池（已加载插件注册的 contribution）∩ 当前 cwd 的 attach 记录才渲染
	const registeredPluginTabs = useAtomValue(pluginActivityTabsAtom);
	const [attachedPluginTabs, setAttachedPluginTabs] = useAtom(attachedPluginTabsAtom);
	const attachedKeys = useMemo(
		() => (enablePluginTabs && cwd ? (attachedPluginTabs.get(cwd) ?? []) : []),
		[enablePluginTabs, cwd, attachedPluginTabs],
	);
	const attachedPluginTabContribs = useMemo(
		() =>
			attachedKeys
				.map((key) => registeredPluginTabs.find((tab) => `${tab.pluginId}:${tab.tabId}` === key))
				.filter((tab): tab is RegisteredActivityTab => tab != null),
		[attachedKeys, registeredPluginTabs],
	);
	const showPluginPicker = enablePluginTabs && cwd != null && registeredPluginTabs.length > 0;

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

	// 面板过宽（聊天区将被压到 MIN_CHAT_AREA 以下）时自动折叠侧边栏，回拉到阈值内自动恢复。
	// 文件预览把面板拉到 max 时也会触发这里，无需单独处理，侧边栏纯随宽度联动。
	useEffect(() => {
		const collapseThreshold = windowWidth - sidebarWidth - MIN_CHAT_AREA;
		const shouldCollapse = isOpen && width > collapseThreshold;
		if (shouldCollapse) {
			if (widthCollapsedSidebarRef.current === null) {
				let prev = false;
				setSidebarCollapsed((current) => {
					prev = current;
					return true;
				});
				widthCollapsedSidebarRef.current = prev;
			}
		} else if (widthCollapsedSidebarRef.current !== null) {
			const restore = widthCollapsedSidebarRef.current;
			widthCollapsedSidebarRef.current = null;
			setSidebarCollapsed(restore);
		}
	}, [width, windowWidth, sidebarWidth, isOpen, setSidebarCollapsed]);

	const tabItems: TabBarItem<ActivityTabKey>[] = useMemo(() => {
		if (knowledgeHistory) {
			return [{ key: "knowledge-history" as ActivityTabKey, label: "知识库加工历史", icon: "icon-[mdi--history]" }];
		}
		const base: TabBarItem<ActivityTabKey>[] = (profile?.activityTabs ?? []).map((t) => ({
			key: t.key,
			label: t.label,
			icon: t.icon,
			badge: t.key === "chat" ? chatUnread : undefined,
		}));
		// Dynamically inject todo tab when items exist
		if (hasTodo) {
			const todoDone = todoItems.filter((i) => i.status === "done").length;
			base.push({
				key: "todo" as ActivityTabKey,
				label: "待办",
				icon: "icon-[mdi--checkbox-marked-circle-outline]",
				badge: todoItems.length - todoDone > 0 ? todoItems.length - todoDone : undefined,
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
			});
		}
		// Dynamically inject debug tab when debug mode is enabled
		if (debugMode) {
			base.push({
				key: "debug" as ActivityTabKey,
				label: "调试",
				icon: "icon-[mdi--bug-outline]",
			});
		}
		// 用户 attach 的插件 tab 追加在所有内置 tab 之后，按 attach 顺序排列
		for (const tab of attachedPluginTabContribs) {
			base.push({
				key: `plugin:${tab.pluginId}:${tab.tabId}` as ActivityTabKey,
				label: tab.label,
				icon: tab.icon ?? DEFAULT_PLUGIN_TAB_ICON,
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
		attachedPluginTabContribs,
	]);

	// 当前 active tab：优先取项目记忆，否则用 profile 默认；profile 未就绪时退回 "file"
	const activeTab: ActivityTabKey = useMemo(() => {
		if (knowledgeHistory) return "knowledge-history";
		if (cwd) {
			const remembered = tabByProject.get(cwd);
			if (remembered && tabItems.some((t) => t.key === remembered)) {
				return remembered;
			}
		}
		return profile?.defaultActivityTab ?? "file";
	}, [knowledgeHistory, cwd, tabByProject, profile, tabItems]);

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
			attachedPluginTabContribs.find((tab) => `plugin:${tab.pluginId}:${tab.tabId}` === activeTab) ?? null
		);
	}, [activeTab, attachedPluginTabContribs]);

	// attach 即切到该 tab；remove 当前激活的插件 tab 时回退到 profile 默认 tab
	const onAttachPluginTab = useCallback(
		(key: string) => {
			if (!cwd) return;
			const next = new Map(attachedPluginTabs);
			const current = next.get(cwd) ?? [];
			if (!current.includes(key)) next.set(cwd, [...current, key]);
			setAttachedPluginTabs(next);
			onTabChange(`plugin:${key}` as ActivityTabKey);
		},
		[cwd, attachedPluginTabs, setAttachedPluginTabs, onTabChange],
	);

	const onDetachPluginTab = useCallback(
		(key: string) => {
			if (!cwd) return;
			const next = new Map(attachedPluginTabs);
			const current = next.get(cwd) ?? [];
			next.set(
				cwd,
				current.filter((k) => k !== key),
			);
			setAttachedPluginTabs(next);
			if (activeTab === `plugin:${key}`) {
				onTabChange(profile?.defaultActivityTab ?? "file");
			}
		},
		[cwd, attachedPluginTabs, setAttachedPluginTabs, activeTab, profile, onTabChange],
	);

	// 窄屏：活动面板不再挤压内容，改为从底部升起的全宽 bottom sheet。
	// 窄屏不走内嵌预览（FilesPanel/ArtifactCard 等改用全屏 Dialog），故无需特殊处理。
	// narrowSheet 时完全不渲染 in-flow 的 <aside>，否则父级 flex 的 gap 会在
	// 右侧多留一道间距，导致输入栏左右边距不一致。
	const narrowSheet = narrow;
	const bottomSheet = narrowSheet && isOpen;

	const panelBody = (
		<>
			{/* Tab list 顶栏 — 始终渲染（即便只有一个 tab）。浏览器式页签悬浮在卡片上方，
			    激活页签与卡片底色融合（TabBar 内部向下延伸 1px 盖住卡片描边）。
			    hover 时右侧浮现"+"按钮，弹出勾选列表管理插件 tab 的 attach/remove。 */}
			{(tabItems.length > 0 || showPluginPicker) && (
				<div className="group/activity-tabs flex shrink-0 items-end">
					<TabBar
						className="min-w-0 flex-1"
						items={tabItems}
						value={activeTab}
						onChange={onTabChange}
						suppressLayoutAnimation={isResizing}
					/>
					{showPluginPicker && (
						<PluginTabPicker
							contributions={registeredPluginTabs}
							attachedKeys={attachedKeys}
							onAttach={onAttachPluginTab}
							onDetach={onDetachPluginTab}
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
				</div>
			)}
		</div>
	);
}

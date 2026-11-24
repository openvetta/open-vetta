import { rememberSpaceLocation, revealSpaceItem, spaceDisplayName } from "@domains/project/hooks/useSpaceNavigation";
import type { InstalledPlugin, SkillInfo } from "@preload/api";
import { PLUGIN_HOSTED_ROUTE_PATH } from "@shared/hosted-routes/hosted-route-descriptors";
import { isMac, isWindows } from "@shared/lib/platform";
import { getEffectiveShortcut, loadShortcutBindings } from "@shared/lib/shortcuts";
import { useShortcutScope } from "@shared/shortcuts";
import {
	commandMenuOpenAtom,
	defaultConversationCwdAtom,
	defaultImConversationCwdAtom,
	pluginWorkspaceViewsAtom,
	projectsAtom,
	type SessionExecutionMode,
	sessionsMapAtom,
} from "@shared/store/atoms";
import { attentionSessionPathsAtom } from "@shared/store/attention-sessions-atoms";
import { pendingInteractionPathsAtom } from "@shared/store/pending-interactions-atoms";
import { recentSessionVisitsAtom } from "@shared/store/recent-sessions-atoms";
import { runningSessionPathsAtom } from "@shared/store/running-sessions-atoms";
import type { SpaceItem } from "@shared/store/spaces";
import { spaceOf, spacesAtom } from "@shared/store/spaces";
import { useNavigate } from "@tanstack/react-router";
import type { CommandMenuGroupView, CommandMenuViewLabels } from "@vetta-org/theme-ui/overlays";
import { useAtom, useAtomValue, useStore } from "jotai";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { resolveDesktopSessionOpenTarget } from "@/shared/session-access";
import type { DesktopSessionSearchResult } from "@/shared/session-search";
import type { DesktopTeamSidebarConversation } from "@/shared/sidebar-conversation";
import { prefetchCommandMenuAction } from "../../../root-layout/nav-route-prefetch";
import { usePluginTextResolver } from "../../plugins/runtime/plugin-i18n";
import { useSessionSearch } from "../../project/hooks/useSessionSearch";
import { buildCommandMenuGroups, type CommandMenuGroupLabels } from "../lib/build-groups";
import { pickLatestOpenableSession } from "../lib/latest-session";
import { tokenizeCommandMenuQuery } from "../lib/match";
import { findSidebarSessions } from "../lib/sidebar-sessions";
import {
	buildInstalledAbilityEntries,
	buildMarketplaceEscapeEntry,
	buildProjectEntries,
	buildSessionEntries,
	buildSettingsEntries,
	buildWorkspaceViewEntries,
	type CommandMenuSourceLabels,
	resolveSessionStatus,
} from "../lib/sources";
import type { CommandMenuAction, CommandMenuEntry } from "../types";

/** 会话组一次最多渲染几条；后端结果远多于此，截断在进 React 之前完成。 */
const SESSION_RESULT_LIMIT = 12;
/** 空查询时「最近打开」最多列几条（与每组上限一致，不出现「还有 N 条」）。 */
const RECENT_GROUP_SIZE = 6;

const OPEN_COMMAND_MENU_ACTION = "open-command-menu";
const NEW_SESSION_ACTION = "new-session";

type ShortcutBindings = Parameters<typeof getEffectiveShortcut>[1];

/**
 * 面板用到的生效快捷键：「再按一次关闭」的开关键，以及按钮上展示的新建会话键。
 * 必须读生效绑定而不是写死默认键：这些动作在设置里可改键，写死会导致改键后旧键仍能关、
 * 按钮上显示的也是错的。默认键只在快捷键定义里维护一份，空绑定即推导出默认值。
 * 只在面板打开过之后才去读配置，避免为一个常驻组件在启动路径上多一次 IPC。
 */
function useCommandMenuShortcuts(enabled: boolean): { toggleKey: string; newSessionKey: string } {
	const [bindings, setBindings] = useState<ShortcutBindings>({});
	useEffect(() => {
		if (!enabled) return;
		let active = true;
		const apply = (next: ShortcutBindings) => {
			if (active) setBindings(next);
		};
		void loadShortcutBindings().then(apply);
		const unsubscribe = window.vetta.config.onShortcutsChanged((event) => apply(event.bindings ?? {}));
		return () => {
			active = false;
			unsubscribe();
		};
	}, [enabled]);
	return useMemo(
		() => ({
			toggleKey:
				getEffectiveShortcut(OPEN_COMMAND_MENU_ACTION, bindings) ||
				getEffectiveShortcut(OPEN_COMMAND_MENU_ACTION, {}),
			newSessionKey: getEffectiveShortcut(NEW_SESSION_ACTION, bindings),
		}),
		[bindings],
	);
}

export interface CommandMenuModel {
	readonly open: boolean;
	readonly query: string;
	readonly groups: readonly CommandMenuGroupView[];
	readonly selectedId: string | null;
	readonly labels: CommandMenuViewLabels;
	/** 唤起 / 关闭面板的生效快捷键，供视图显示键帽。 */
	readonly toggleShortcut: string;
	/** 新建会话的生效快捷键，显示在左下角按钮里。 */
	readonly newSessionShortcut: string;
	readonly onNewSession: () => void;
	readonly suppressSelectionAnimation: boolean;
	readonly onQueryChange: (value: string) => void;
	readonly onHoverItem: (id: string) => void;
	readonly onActivateItem: (id: string) => void;
	readonly onClose: () => void;
}

/**
 * 已装能力的目录。刻意**不在面板打开时就取**，而是等到第一次有查询词：
 * 空查询态下不产生任何 IPC 是既定约束，而这两个调用虽然是本地的，也没必要
 * 为一次「打开面板又按 esc」付出代价。取到后在本次打开期间缓存。
 */
function useInstalledAbilities(enabled: boolean): {
	data: { skills: SkillInfo[]; plugins: InstalledPlugin[] };
	loading: boolean;
} {
	const [data, setData] = useState<{ skills: SkillInfo[]; plugins: InstalledPlugin[] }>({
		skills: [],
		plugins: [],
	});
	const [loading, setLoading] = useState(false);
	const loadedRef = useRef(false);

	useEffect(() => {
		if (!enabled || loadedRef.current) return;
		loadedRef.current = true;
		let active = true;
		setLoading(true);
		void Promise.all([window.vetta.skills.list(), window.vetta.plugins.listAll()])
			.then(([skills, plugins]) => {
				if (active) setData({ skills, plugins });
			})
			.catch(() => {
				// 能力目录取不到不该让整个面板失效：其余四源照常可用。
				if (active) setData({ skills: [], plugins: [] });
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
		};
	}, [enabled]);

	return { data, loading };
}

export interface UseCommandMenuModelArgs {
	readonly onOpenSession: (cwd: string, sessionPath?: string, executionMode?: SessionExecutionMode) => Promise<void>;
}

export function useCommandMenuModel({ onOpenSession }: UseCommandMenuModelArgs): CommandMenuModel {
	const { t } = useTranslation("common");
	const { t: tSettings } = useTranslation("settings");
	const { t: tProject } = useTranslation("project");
	const spaces = useAtomValue(spacesAtom);
	const store = useStore();
	const [teams, setTeams] = useState<readonly DesktopTeamSidebarConversation[]>([]);
	const navigate = useNavigate();

	const [open, setOpen] = useAtom(commandMenuOpenAtom);
	const [query, setQuery] = useState("");
	// 输入框永远跟手：匹配与重排跑在延迟值上，击键本身只更新受控 input。
	const deferredQuery = useDeferredValue(query);

	const projects = useAtomValue(projectsAtom);
	const workspaceViews = useAtomValue(pluginWorkspaceViewsAtom);
	const resolvePluginText = usePluginTextResolver();

	const { toggleKey, newSessionKey } = useCommandMenuShortcuts(open);
	const defaultConversationCwd = useAtomValue(defaultConversationCwdAtom);
	const hasQuery = Boolean(deferredQuery.trim());
	const runningPaths = useAtomValue(runningSessionPathsAtom);
	const waitingPaths = useAtomValue(pendingInteractionPathsAtom);
	const attentionPaths = useAtomValue(attentionSessionPathsAtom);
	const activity = useMemo(
		() => ({ runningPaths, waitingPaths, attentionPaths }),
		[runningPaths, waitingPaths, attentionPaths],
	);
	const recentVisits = useAtomValue(recentSessionVisitsAtom);
	const recentRank = useMemo(
		() => new Map(recentVisits.map((visit, index) => [visit.path, index] as const)),
		[recentVisits],
	);
	/**
	 * 空查询时要展示的会话：进行中的全部 + 最近打开的前几条（面板兼做全局监视与回访入口）。
	 * 用排序后拼接的字符串做依赖：集合对象每次变化都是新引用，但只有成员变了才值得重算。
	 */
	// 面板常驻挂载：关着时不算任何目录，运行状态 / 侧栏数据频繁变化也只是几次廉价的空分支。
	const watchedKey = useMemo(
		() =>
			!open || hasQuery
				? ""
				: [
						...new Set([
							...[...waitingPaths].filter(([, n]) => n > 0).map(([path]) => path),
							...runningPaths,
							...attentionPaths,
							...recentVisits.slice(0, RECENT_GROUP_SIZE).map((visit) => visit.path),
						]),
					]
						.sort()
						.join("\n"),
		[open, hasQuery, runningPaths, waitingPaths, attentionPaths, recentVisits],
	);
	const watchedPaths = useMemo(() => (watchedKey ? watchedKey.split("\n") : []), [watchedKey]);

	/**
	 * 关注会话的元数据优先取侧栏内存（零 IPC、标题实时）；侧栏里没有的（例如自动化 / IM 在没展开的项目里
	 * 跑起来的会话）才去检索，检索到的结果缓存下来跨多次打开复用。
	 * 每个路径在本次运行里最多检索一次：检索不到的（已删除、来源不在检索范围）记下来不再重试，
	 * 否则它会永远「缺数据」，每次呼出都重新检索、闪一次骨架。
	 */
	const sidebarSessions = useAtomValue(sessionsMapAtom);
	const imConversationCwd = useAtomValue(defaultImConversationCwdAtom);
	const sidebarMeta = useMemo(
		() =>
			findSidebarSessions(watchedPaths, {
				sessionsByBucket: sidebarSessions,
				projects,
				defaultConversationCwd,
				imConversationCwd,
			}),
		[watchedPaths, sidebarSessions, projects, defaultConversationCwd, imConversationCwd],
	);
	const [searchedMeta, setSearchedMeta] = useState<ReadonlyMap<string, DesktopSessionSearchResult>>(() => new Map());
	const searchedMetaRef = useRef(searchedMeta);
	searchedMetaRef.current = searchedMeta;
	const attemptedPathsRef = useRef(new Set<string>());
	// 只在关注集合、侧栏数据变化或面板重新打开时计算缺口，而不是检索结果每合入一条就重算：
	// 结果逐条流式到达，缺口若随之变化，就会不断取消、重开同一次检索。
	const missingPaths = useMemo(() => {
		if (!open) return undefined;
		const missing = watchedPaths.filter(
			(path) => !sidebarMeta.has(path) && !searchedMetaRef.current.has(path) && !attemptedPathsRef.current.has(path),
		);
		return missing.length > 0 ? missing : undefined;
	}, [watchedPaths, sidebarMeta, open]);

	const abilities = useInstalledAbilities(open && hasQuery);
	useEffect(() => {
		if (!open || !hasQuery || !window.vetta.agentTeams) return;
		let cancelled = false;
		void window.vetta.agentTeams
			.listSidebarConversations()
			.then((items) => {
				if (!cancelled) setTeams(items);
			})
			.catch(() => {
				if (!cancelled) setTeams([]);
			});
		return () => {
			cancelled = true;
		};
	}, [open, hasQuery]);

	// 会话是唯一的异步源：空查询时只为缓存里没有的关注会话发起。
	const sessionSearch = useSessionSearch(open && (hasQuery || Boolean(missingPaths)), {
		query: deferredQuery,
		limit: hasQuery ? SESSION_RESULT_LIMIT : Math.max(SESSION_RESULT_LIMIT, missingPaths?.length ?? 0),
		activePaths: hasQuery ? undefined : missingPaths,
	});
	// 一次为缺口发起的检索结束（loading 由真转假）后，把这批路径记为已尝试；检索不到的不再重试。
	// 放在 effect 里而不是计算缺口的 memo 里：memo 必须是纯的（开发模式会执行两次）。
	const searchWasLoadingRef = useRef(false);
	useEffect(() => {
		const finished = searchWasLoadingRef.current && !sessionSearch.loading;
		searchWasLoadingRef.current = sessionSearch.loading;
		if (finished && !hasQuery && missingPaths) {
			for (const path of missingPaths) attemptedPathsRef.current.add(path);
		}
	}, [sessionSearch.loading, hasQuery, missingPaths]);
	useEffect(() => {
		if (sessionSearch.results.length === 0) return;
		setSearchedMeta((previous) => {
			const next = new Map(previous);
			for (const result of sessionSearch.results) next.set(result.session.path, result);
			return next;
		});
	}, [sessionSearch.results]);

	const sourceLabels = useMemo<CommandMenuSourceLabels>(
		() => ({
			sessionTypes: {
				conversation: t("commandMenu.sessionTypes.conversation"),
				claw: t("commandMenu.sessionTypes.claw"),
				project: t("commandMenu.sessionTypes.project"),
				batch: t("commandMenu.sessionTypes.batch"),
			},
			sessionStatus: {
				running: t("commandMenu.sessionStatus.running"),
				waiting: t("commandMenu.sessionStatus.waiting"),
				unread: t("commandMenu.sessionStatus.unread"),
			},
			sessionUnavailable: t("commandMenu.sessionUnavailable"),
			settingsGroupHint: t("commandMenu.groups.settings"),
			abilitySkill: t("commandMenu.badges.skill"),
			abilityPlugin: t("commandMenu.badges.plugin"),
			searchMarketplace: t("commandMenu.searchMarketplace"),
		}),
		[t],
	);

	const groupLabels = useMemo<CommandMenuGroupLabels>(
		() => ({
			groups: {
				activeSessions: t("commandMenu.groups.activeSessions"),
				recentSessions: t("commandMenu.groups.recentSessions"),
				projects: t("commandMenu.groups.projects"),
				sessions: t("commandMenu.groups.sessions"),
				abilities: t("commandMenu.groups.abilities"),
				settings: t("commandMenu.groups.settings"),
				workspaceViews: t("commandMenu.groups.workspaceViews"),
			},
			overflow: (count: number) => t("commandMenu.overflow", { count }),
		}),
		[t],
	);

	// 目录只跟着源数据重建，击键不会重跑它——这是击键路径上最大的一块成本。
	const staticEntries = useMemo<CommandMenuEntry[]>(
		() =>
			open
				? [
						...buildProjectEntries(projects),
						...buildSettingsEntries({ isMac, isWindows }, (key) => tSettings(key)),
						...buildWorkspaceViewEntries(workspaceViews, (view, raw) => resolvePluginText(view.pluginId, raw)),
					]
				: [],
		[open, projects, workspaceViews, tSettings, resolvePluginText],
	);

	const abilityEntries = useMemo(
		() => buildInstalledAbilityEntries(abilities.data, sourceLabels),
		[abilities.data, sourceLabels],
	);

	const sessionEntries = useMemo(() => {
		const results = hasQuery
			? sessionSearch.results.slice(0, SESSION_RESULT_LIMIT)
			: watchedPaths.flatMap((path) => sidebarMeta.get(path) ?? searchedMeta.get(path) ?? []);
		return buildSessionEntries(results, sourceLabels, { activity, recentRank, asRecentGroup: !hasQuery });
	}, [hasQuery, sessionSearch.results, watchedPaths, sidebarMeta, searchedMeta, sourceLabels, activity, recentRank]);

	const entries = useMemo<CommandMenuEntry[]>(() => {
		if (!open) return [];
		const teamEntries = teams
			.filter(
				(session) =>
					hasQuery &&
					(session.placement.kind === "default" ||
						projects.some(
							(project) => session.placement.kind === "project" && project.cwd === session.placement.projectPath,
						)),
			)
			.map(
				(session, order): CommandMenuEntry => ({
					id: `team-session:${session.teamSessionId}`,
					title: session.sessionTitle,
					groupKey: "sessions",
					order,
					icon: "icon-[solar--users-group-rounded-linear]",
					action: { kind: "openTeamSession", session },
				}),
			);
		const all = [...staticEntries, ...abilityEntries, ...sessionEntries, ...teamEntries].map((entry) => {
			const item = commandSpaceItem(entry.action);
			if (!item) return entry;
			const label = spaceDisplayName(spaces, spaceOf(spaces, item), tProject("spaces.main"));
			// 项目行的工作空间放进 badge；会话行的 badge 已经是所属项目，工作空间退到副标题。
			if (entry.action.kind === "openProject") return { ...entry, badge: label };
			return { ...entry, subtitle: entry.subtitle ? `${entry.subtitle} · ${label}` : label };
		});
		// 逃生行只在有查询词时出现：空态里它没有可携带的搜索词，等于一条噪音。
		return hasQuery ? [...all, buildMarketplaceEscapeEntry(deferredQuery, sourceLabels)] : all;
	}, [
		open,
		staticEntries,
		abilityEntries,
		sessionEntries,
		teams,
		projects,
		spaces,
		tProject,
		hasQuery,
		deferredQuery,
		sourceLabels,
	]);

	// 空查询只在有进行中的会话还没取到时才在「进行中」占骨架位；最近打开不占，取到了再出现即可。
	const showActiveSkeleton =
		!hasQuery && sessionSearch.loading && Boolean(missingPaths?.some((path) => resolveSessionStatus(path, activity)));

	const tokens = useMemo(() => tokenizeCommandMenuQuery(deferredQuery), [deferredQuery]);

	const { groups, orderedIds, entryById } = useMemo(
		() =>
			buildCommandMenuGroups({
				entries,
				tokens,
				labels: groupLabels,
				// 空查询只在列进行中会话，骨架位留给「进行中」组。
				loadingGroups: hasQuery
					? sessionSearch.loading
						? ["sessions"]
						: []
					: showActiveSkeleton
						? ["activeSessions"]
						: [],
			}),
		[entries, tokens, groupLabels, sessionSearch.loading, hasQuery, showActiveSkeleton],
	);

	const [selectedId, setSelectedId] = useState<string | null>(null);
	// 只有方向键移动才播指示条位移；结果重算导致的选中变化一律不播。
	const [suppressSelectionAnimation, setSuppressSelectionAnimation] = useState(true);

	/**
	 * 选中态锚在 id 上：异步会话结果到达会重排列表，若锚在下标，光标的视觉位置不动
	 * 但指向的条目会被换掉，回车打开的将是用户没看见的东西。id 还在就保持，
	 * 消失了才回落到第一条。
	 */
	useEffect(() => {
		setSelectedId((current) => {
			if (current && orderedIds.includes(current)) return current;
			return orderedIds[0] ?? null;
		});
	}, [orderedIds]);

	useEffect(() => {
		if (!open || !selectedId) return;
		const entry = entryById.get(selectedId);
		if (entry) prefetchCommandMenuAction(entry.action);
	}, [entryById, open, selectedId]);

	const close = useCallback(() => {
		setOpen(false);
		setQuery("");
		setSelectedId(null);
		setSuppressSelectionAnimation(true);
	}, [setOpen]);

	/** 与全局「新建会话」快捷键同一落点：默认进「对话」的新会话页，cwd 未就绪时退回第一个项目。 */
	const newSession = useCallback(() => {
		const target = defaultConversationCwd || projects[0]?.cwd;
		close();
		if (target) void navigate({ to: "/new-session/$cwd", params: { cwd: encodeURIComponent(target) } });
	}, [close, defaultConversationCwd, projects, navigate]);

	const runAction = useCallback(
		(action: CommandMenuAction) => {
			const item = commandSpaceItem(action);
			if (
				item &&
				(action.kind !== "openSession" ||
					resolveDesktopSessionOpenTarget(action.result.session.access) !== "unavailable")
			)
				revealSpaceItem(store, item);
			switch (action.kind) {
				case "openTeamSession": {
					const { teamId, teamSessionId: sessionId, placement } = action.session;
					rememberSpaceLocation(store, {
						kind: "team",
						teamId,
						sessionId,
						projectCwd: placement.kind === "project" ? placement.projectPath : undefined,
					});
					void navigate({ to: "/agent-teams/$teamId/sessions/$sessionId", params: { teamId, sessionId } });
					return true;
				}
				case "openProject": {
					// 用户选中项目是想继续干活，不是想看项目概览：落到最新一条会话上。
					// listSessions 是本地调用，且只在真的选中某个项目时才发一次。
					void (async () => {
						const sessions = await window.vetta.session.listSessions(action.cwd).catch(() => []);
						const latest = pickLatestOpenableSession(sessions);
						if (latest?.target === "interactive") {
							await onOpenSession(action.cwd, latest.session.path);
							return;
						}
						if (latest?.target === "viewer") {
							rememberSpaceLocation(store, {
								kind: "conversation",
								cwd: action.cwd,
								path: latest.session.path,
								viewer: true,
							});
							await navigate({
								to: "/viewer/$path",
								params: { path: encodeURIComponent(latest.session.path) },
							});
							return;
						}
						// 一条会话都没有（或都打不开）时回到项目页——与侧栏点项目的落点一致。
						await navigate({ to: "/project/$cwd", params: { cwd: encodeURIComponent(action.cwd) } });
					})();
					return true;
				}
				case "openSettingsSection":
					void navigate({
						to: "/settings/$tab",
						params: { tab: action.tab },
						search: { section: action.section },
					});
					return true;
				case "openAbilities":
					void navigate({
						to: "/abilities",
						search: {
							...(action.query ? { q: action.query } : {}),
							...(action.scope ? { scope: action.scope } : {}),
						},
					});
					return true;
				case "openWorkspaceView":
					void navigate({
						to: PLUGIN_HOSTED_ROUTE_PATH,
						params: { pluginId: action.pluginId, viewId: action.viewId },
					});
					return true;
				case "openSession": {
					const { result } = action;
					const target = resolveDesktopSessionOpenTarget(result.session.access);
					if (target === "viewer") {
						if (result.sourceKind === "conversation" || result.sourceKind === "project")
							rememberSpaceLocation(store, {
								kind: "conversation",
								cwd: result.sourceCwd,
								path: result.session.path,
								viewer: true,
							});
						void navigate({
							to: "/viewer/$path",
							params: { path: encodeURIComponent(result.session.path) },
						});
						return true;
					}
					if (target === "interactive") {
						// batch 会话的落点是它自己的 cwd，其余取侧栏分桶的 sourceCwd。
						const cwd = result.sourceKind === "batch" ? result.session.cwd : result.sourceCwd;
						void onOpenSession(cwd, result.session.path, result.executionMode);
						return true;
					}
					return false;
				}
			}
		},
		[navigate, onOpenSession, store],
	);

	const activate = useCallback(
		(id: string) => {
			const entry = entryById.get(id);
			if (!entry || entry.disabled) return;
			if (runAction(entry.action)) close();
		},
		[entryById, runAction, close],
	);

	const move = useCallback(
		(delta: number) => {
			setSuppressSelectionAnimation(false);
			setSelectedId((current) => {
				if (orderedIds.length === 0) return null;
				const index = current ? orderedIds.indexOf(current) : -1;
				const next = (index + delta + orderedIds.length) % orderedIds.length;
				return orderedIds[next];
			});
		},
		[orderedIds],
	);

	const selectedIdRef = useRef(selectedId);
	selectedIdRef.current = selectedId;

	/**
	 * exclusive：面板打开期间未匹配的键不下沉到 app 层，避免在背后触发别的全局动作。
	 * 开关键显式绑成关闭——app 层那条是 `when: "always"`，不在这里拦下就会被再次「打开」，
	 * 表现为按了没反应。新建会话键绑到面板自己的「新会话」：左下角按钮提示的就是这个键，
	 * 按下应当关掉面板再新建，而不是被独占吞掉。都用生效绑定而非默认键。
	 */
	useShortcutScope({
		id: "overlay:command-menu",
		kind: "overlay",
		active: open,
		exclusive: true,
		bindings: useMemo(
			() => [
				{ key: "arrowdown", run: () => move(1) },
				{ key: "arrowup", run: () => move(-1) },
				{ key: "enter", run: () => selectedIdRef.current && activate(selectedIdRef.current) },
				{ key: "escape", run: () => close() },
				{ key: toggleKey, run: () => close() },
				...(newSessionKey ? [{ key: newSessionKey, run: () => newSession() }] : []),
			],
			[move, activate, close, toggleKey, newSessionKey, newSession],
		),
	});

	const onQueryChange = useCallback((value: string) => {
		setQuery(value);
		setSuppressSelectionAnimation(true);
	}, []);

	/**
	 * 鼠标悬停让选中底色直接落到指针下那一行，不做滑动：指针扫过一串行时，
	 * 底色追着指针一路滑会显得拖沓。只有方向键移动才播放滑动。
	 */
	const onHoverItem = useCallback((id: string) => {
		setSuppressSelectionAnimation(true);
		setSelectedId(id);
	}, []);

	const labels = useMemo<CommandMenuViewLabels>(
		() => ({
			placeholder: t("commandMenu.placeholder"),
			empty: t("commandMenu.empty"),
			emptyHint: t("commandMenu.emptyHint"),
			loading: t("commandMenu.loading"),
			title: t("commandMenu.title"),
			actionsLabel: t("commandMenu.actionsLabel"),
			newSession: t("commandMenu.newSession"),
			hintSelect: t("commandMenu.hintSelect"),
			hintClose: t("commandMenu.hintClose"),
		}),
		[t],
	);

	// 关闭后不再计算条目，但退场淡出期间面板还在画面上：沿用关闭前最后一次的分组，
	// 否则淡出时会闪一下空状态。
	const lastOpenGroupsRef = useRef(groups);
	if (open) lastOpenGroupsRef.current = groups;

	return {
		open,
		query,
		groups: open ? groups : lastOpenGroupsRef.current,
		selectedId,
		labels,
		toggleShortcut: toggleKey,
		newSessionShortcut: newSessionKey,
		onNewSession: newSession,
		suppressSelectionAnimation,
		onQueryChange,
		onHoverItem,
		onActivateItem: activate,
		onClose: close,
	};
}

function commandSpaceItem(action: CommandMenuAction): SpaceItem | undefined {
	switch (action.kind) {
		case "openProject":
			return { kind: "project", key: action.cwd };
		case "openTeamSession":
			return action.session.placement.kind === "project"
				? { kind: "project", key: action.session.placement.projectPath }
				: { kind: "conversation", key: action.session.teamSessionId };
		case "openSession":
			return action.result.sourceKind === "conversation"
				? { kind: "conversation", key: action.result.session.path }
				: { kind: "project", key: action.result.sourceCwd };
		default:
			return undefined;
	}
}

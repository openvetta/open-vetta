import {
	DEFAULT_CONVERSATION_PROJECT_NAME,
	defaultConversationCwdAtom,
	defaultImConversationCwdAtom,
	expandedProjectsAtom,
	NO_MESSAGES_SENTINEL,
	type Project,
	type ProjectType,
	projectsAtom,
	type SessionInfo,
	scheduledRecordsVersionAtom,
	scheduledSessionPathsAtom,
	sessionsMapAtom,
	workspacePathAtom,
} from "@shared/store/atoms";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";

/** firstMessage 是否可直接当展示名（排除空串与 coding-agent 占位）。 */
function isUsableFirstMessage(text: string | undefined): boolean {
	const t = (text ?? "").trim();
	return t.length > 0 && t !== NO_MESSAGES_SENTINEL;
}

// Module-level flag so auto-expand only happens once per app session
let didAutoExpand = false;

// Module-level guard so the IM session-changed subscription only runs once
// per renderer (useProjects is called from many components). The subscriber
// reloads the default "对话" project's session list whenever the sidecar
// emits a state_patch (i.e. an IM message just created or updated a session).
let imSubscribed = false;

export function useProjects() {
	const [projects, setProjects] = useAtom(projectsAtom);
	const [sessionsMap, setSessionsMap] = useAtom(sessionsMapAtom);
	const scheduledSessionPaths = useAtomValue(scheduledSessionPathsAtom);
	const setScheduledSessionPaths = useSetAtom(scheduledSessionPathsAtom);
	const setScheduledRecordsVersion = useSetAtom(scheduledRecordsVersionAtom);
	const [expandedProjects, setExpandedProjects] = useAtom(expandedProjectsAtom);
	const workspacePath = useAtomValue(workspacePathAtom);
	const defaultConversationCwd = useAtomValue(defaultConversationCwdAtom);
	const defaultImConversationCwd = useAtomValue(defaultImConversationCwdAtom);

	const loadSessions = useCallback(
		async (cwd: string) => {
			const sessions = (await window.vetta.session.listSessions(cwd)) as SessionInfo[];
			setSessionsMap((prev) => {
				// 定时 / 新建 session 的 name、以及发送瞬间写入的乐观 firstMessage，在 assistant
				// 首条落盘前磁盘可能仍是空 name + "(no messages)"。若直接覆盖会让侧栏/标题
				// 闪回「未命名会话」。用上一次已知的非空 name / 可用 firstMessage 兜底。
				const prevByPath = new Map((prev.get(cwd) ?? []).map((s) => [s.path, s]));
				const merged = sessions.map((s) => {
					const known = prevByPath.get(s.path);
					if (!known) return s;
					let next = s;
					if (!s.name && known.name) {
						next = { ...next, name: known.name };
					}
					if (!isUsableFirstMessage(s.firstMessage) && isUsableFirstMessage(known.firstMessage)) {
						next = { ...next, firstMessage: known.firstMessage };
					}
					return next;
				});
				return new Map([...prev, [cwd, merged]]);
			});
		},
		[setSessionsMap],
	);

	// Keep a ref to loadSessions so the IM subscription (set up once at module
	// scope via imSubscribed) always calls the latest closure.
	const loadSessionsRef = useRef(loadSessions);
	loadSessionsRef.current = loadSessions;
	const defaultCwdRef = useRef(defaultConversationCwd);
	defaultCwdRef.current = defaultConversationCwd;
	const imCwdRef = useRef(defaultImConversationCwd);
	imCwdRef.current = defaultImConversationCwd;
	useEffect(() => {
		if (imSubscribed) return;
		imSubscribed = true;
		window.vetta.im.onSessionChanged(() => {
			// Claw 会话写在独立的 IM cwd 下（ADR-0005），fs watcher 监听的也是它；
			// 桌面「对话」cwd 不会被 sidecar 写，但保留刷新以兼容历史路径。
			const imCwd = imCwdRef.current;
			if (imCwd) void loadSessionsRef.current(imCwd);
			const cwd = defaultCwdRef.current;
			if (cwd && cwd !== imCwd) void loadSessionsRef.current(cwd);
		});
		// Intentionally no cleanup: the listener lives for the renderer's
		// lifetime, mirroring the singleton-style hooks (useAppInit, etc.).
	}, []);

	const refreshProjects = useCallback(async () => {
		// Read project list from app-specific config file (not shared with CLI)
		const config = await window.vetta.config.get();
		const entries = config.projects.map((entry) => ({ cwd: entry.path, name: entry.name, sessionCount: 0 }));

		// Read meta.json for each project in parallel to determine type
		const metaResults = await Promise.all(
			entries.map(async (entry) => {
				const meta = await window.vetta.flowing.readMeta(entry.cwd);
				const rawType = meta?.type as string | undefined;
				const type: ProjectType = rawType === "flowing" || rawType === "batch" ? rawType : "normal";
				const workflowInstanceId =
					typeof meta?.workflowInstanceId === "number" ? (meta.workflowInstanceId as number) : undefined;
				const flowingId = typeof meta?.flowingId === "number" ? (meta.flowingId as number) : undefined;
				return { ...entry, type, workflowInstanceId, flowingId };
			}),
		);

		// 虚拟注入默认「对话」项目，置于最前，且过滤掉用户误手动加入的同名条目。
		const defaultCwd = config.defaultConversationCwd ?? "";
		const filtered = defaultCwd ? metaResults.filter((p) => p.cwd !== defaultCwd) : metaResults;
		const all: Project[] = defaultCwd
			? [
					{
						cwd: defaultCwd,
						name: DEFAULT_CONVERSATION_PROJECT_NAME,
						sessionCount: 0,
						type: "normal" as const,
						isDefault: true,
					},
					...filtered,
				]
			: filtered;
		setProjects(all);

		// Load sessions for each project (含默认项目)
		for (const project of all) {
			void loadSessions(project.cwd);
		}

		// Claw tab 的 sessions 存放在独立 cwd 下（ADR-0005），单独拉一遍 —— 它不在 `all`
		// 项目列表里，但「对话」project 的 Claw tab 需要读到。
		const imCwd = config.defaultImConversationCwd ?? "";
		if (imCwd) void loadSessions(imCwd);

		if (!didAutoExpand && all.length > 0) {
			didAutoExpand = true;
			setExpandedProjects(new Set<string>([all[0].cwd]));
			await loadSessions(all[0].cwd);
		}
	}, [setProjects, setExpandedProjects, loadSessions]);

	/** Create a new project directory in workspace and add to config; returns resolved cwd. */
	const createProject = useCallback(
		async (name: string): Promise<string> => {
			const projectPath = `${workspacePath}/${name}`;
			await window.vetta.fs.createDirectory(projectPath);
			// Read the resolved path back via listSubDirs to get the absolute path
			const subDirs = await window.vetta.fs.listSubDirs(workspacePath);
			const created = subDirs.find((d) => d.name === name);
			const resolvedPath = created?.path ?? projectPath;

			// Add to config with the user-provided name
			const config = await window.vetta.config.get();
			if (!config.projects.some((p) => p.path === resolvedPath)) {
				config.projects.push({ path: resolvedPath, name });
				await window.vetta.config.set({ projects: config.projects });
			}

			await refreshProjects();
			setExpandedProjects((prev) => new Set([...prev, resolvedPath]));
			return resolvedPath;
		},
		[workspacePath, refreshProjects, setExpandedProjects],
	);

	/** Open an existing directory and add to config */
	const openProject = useCallback(async () => {
		const cwd = await window.vetta.dialog.selectFolder();
		if (!cwd) return null;

		const config = await window.vetta.config.get();
		if (!config.projects.some((p) => p.path === cwd)) {
			config.projects.push({ path: cwd });
			await window.vetta.config.set({ projects: config.projects });
		}

		await refreshProjects();
		setExpandedProjects((prev) => new Set([...prev, cwd]));
		await loadSessions(cwd);
		return cwd;
	}, [refreshProjects, setExpandedProjects, loadSessions]);

	const expandProject = useCallback(
		(cwd: string) => {
			setExpandedProjects((prev) => {
				if (prev.has(cwd)) return prev;
				void loadSessions(cwd);
				const next = new Set(prev);
				next.add(cwd);
				return next;
			});
		},
		[setExpandedProjects, loadSessions],
	);

	const collapseProject = useCallback(
		(cwd: string) => {
			setExpandedProjects((prev) => {
				if (!prev.has(cwd)) return prev;
				const next = new Set(prev);
				next.delete(cwd);
				return next;
			});
		},
		[setExpandedProjects],
	);

	const toggleProject = useCallback(
		(cwd: string) => {
			setExpandedProjects((prev) => {
				if (prev.has(cwd)) {
					const next = new Set(prev);
					next.delete(cwd);
					return next;
				}
				void loadSessions(cwd);
				const next = new Set(prev);
				next.add(cwd);
				return next;
			});
		},
		[setExpandedProjects, loadSessions],
	);

	const removeProject = useCallback(
		async (cwd: string) => {
			// 默认「对话」项目不允许从列表中移除。
			if (cwd === defaultConversationCwd) return;
			const config = await window.vetta.config.get();
			config.projects = config.projects.filter((p) => p.path !== cwd);
			await window.vetta.config.set({ projects: config.projects });
			await refreshProjects();
		},
		[refreshProjects, defaultConversationCwd],
	);

	const archiveProject = useCallback(
		async (cwd: string) => {
			if (cwd === defaultConversationCwd) return;
			const config = await window.vetta.config.get();
			const entry = config.projects.find((p) => p.path === cwd);
			config.projects = config.projects.filter((p) => p.path !== cwd);
			const archived = config.archivedProjects ?? [];
			if (!archived.some((p) => p.path === cwd)) {
				archived.push(entry ?? { path: cwd });
			}
			await window.vetta.config.set({ projects: config.projects, archivedProjects: archived });
			await refreshProjects();
		},
		[refreshProjects, defaultConversationCwd],
	);

	const unarchiveProject = useCallback(
		async (cwd: string) => {
			const config = await window.vetta.config.get();
			const archived = (config.archivedProjects ?? []).filter((p) => p.path !== cwd);
			const projects = config.projects.some((p) => p.path === cwd)
				? config.projects
				: [...config.projects, { path: cwd }];
			await window.vetta.config.set({ projects, archivedProjects: archived });
			await refreshProjects();
		},
		[refreshProjects],
	);

	const deleteArchivedProject = useCallback(async (cwd: string) => {
		const config = await window.vetta.config.get();
		const archived = (config.archivedProjects ?? []).filter((p) => p.path !== cwd);
		await window.vetta.config.set({ archivedProjects: archived });
	}, []);

	/** Remove project from config AND delete from disk */
	const deleteProjectFromDisk = useCallback(
		async (cwd: string) => {
			if (cwd === defaultConversationCwd) return;
			const config = await window.vetta.config.get();
			config.projects = config.projects.filter((p) => p.path !== cwd);
			const archived = (config.archivedProjects ?? []).filter((p) => p.path !== cwd);
			await window.vetta.config.set({ projects: config.projects, archivedProjects: archived });
			await window.vetta.fs.delete(cwd);
			await refreshProjects();
		},
		[refreshProjects, defaultConversationCwd],
	);

	const deleteSession = useCallback(
		async (_cwd: string, sessionPath: string) => {
			await window.vetta.session.delete(sessionPath);
			// 定时任务 session：同步删掉「自动化」里的执行记录，否则历史列表会残留。
			if (scheduledSessionPaths.has(sessionPath)) {
				await window.vetta.scheduler.deleteRecordsBySession(sessionPath);
				setScheduledSessionPaths((prev) => {
					if (!prev.has(sessionPath)) return prev;
					const next = new Set(prev);
					next.delete(sessionPath);
					return next;
				});
				// 驱动正在展示的执行历史重新拉取。
				setScheduledRecordsVersion((v) => v + 1);
			}
			setSessionsMap((prev) => {
				// ADR-0007: 「对话」项目下的 session.cwd 是 per-session 子目录，但
				// sessionsMap 的 key 仍是项目根。这里不再用传入的 cwd 反查，而是
				// 遍历所有桶把命中 sessionPath 的条目摘掉，避免侧栏不刷新。
				const next = new Map(prev);
				for (const [key, sessions] of prev) {
					const filtered = sessions.filter((s) => s.path !== sessionPath);
					if (filtered.length !== sessions.length) next.set(key, filtered);
				}
				return next;
			});
		},
		[setSessionsMap, scheduledSessionPaths, setScheduledSessionPaths, setScheduledRecordsVersion],
	);

	/**
	 * 保证本地 sessionsMap 有该 session 条目。
	 * - 不存在：插入（用于首条 prompt 发出时，JSONL 尚未含用户消息）。
	 * - 已存在但 name/firstMessage 仍是空或 "(no messages)"：用 info 补齐，
	 *   避免侧栏/标题卡在「未命名会话」（openSession 后 listSessions 常先写占位行）。
	 * 已有真实 name 的条目不覆盖。
	 */
	const ensureLocalSession = useCallback(
		(cwd: string, info: SessionInfo) => {
			setSessionsMap((prev) => {
				const sessions = prev.get(cwd) ?? [];
				const idx = sessions.findIndex((s) => s.path === info.path);
				if (idx < 0) {
					const next = new Map(prev);
					next.set(cwd, [...sessions, info]);
					return next;
				}
				const existing = sessions[idx];
				const patchFirst = !isUsableFirstMessage(existing.firstMessage) && isUsableFirstMessage(info.firstMessage);
				const patchName = !existing.name && !!info.name;
				if (!patchFirst && !patchName) {
					// 仍刷新 modifiedAt，让侧栏排序贴近「刚发过消息」。
					if (info.modifiedAt <= existing.modifiedAt) return prev;
					const updated = sessions.slice();
					updated[idx] = { ...existing, modifiedAt: info.modifiedAt };
					const next = new Map(prev);
					next.set(cwd, updated);
					return next;
				}
				const updated = sessions.slice();
				updated[idx] = {
					...existing,
					firstMessage: patchFirst ? info.firstMessage : existing.firstMessage,
					name: patchName ? info.name : existing.name,
					modifiedAt: Math.max(existing.modifiedAt, info.modifiedAt),
				};
				const next = new Map(prev);
				next.set(cwd, updated);
				return next;
			});
		},
		[setSessionsMap],
	);

	const applyLocalRename = useCallback(
		(cwd: string, sessionPath: string, name: string) => {
			setSessionsMap((prev) => {
				const next = new Map(prev);
				const sessions = next.get(cwd);
				if (sessions) {
					next.set(
						cwd,
						sessions.map((s) => (s.path === sessionPath ? { ...s, name } : s)),
					);
				}
				return next;
			});
		},
		[setSessionsMap],
	);

	const renameSession = useCallback(
		async (cwd: string, sessionPath: string, name: string) => {
			await window.vetta.session.rename(sessionPath, name);
			applyLocalRename(cwd, sessionPath, name);
		},
		[applyLocalRename],
	);

	return {
		projects,
		sessionsMap,
		expandedProjects,
		refreshProjects,
		loadSessions,
		createProject,
		openProject,
		removeProject,
		archiveProject,
		unarchiveProject,
		deleteArchivedProject,
		deleteProjectFromDisk,
		expandProject,
		collapseProject,
		toggleProject,
		deleteSession,
		renameSession,
		applyLocalRename,
		ensureLocalSession,
	};
}

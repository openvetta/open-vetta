import type { ProjectType } from "@shared/store/project-atoms";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 项目活动面板 tab 配置
 */
export type ActivityTabKey =
	| "file"
	| "journey"
	| "chat"
	| "batch-progress"
	| "schedule-records"
	| "todo"
	| "background-tasks"
	| "debug";

export interface ActivityTabConfig {
	key: ActivityTabKey;
	label: string;
	icon?: string;
}

/**
 * 项目属性 / 元数据
 *
 * 这是一个统一的项目"画像"，未来所有需要按项目类型区分的配置和属性
 * 都应该通过此对象暴露 —— 调用方不应再关心 meta.json 的原始结构。
 */
export interface ProjectProfile {
	/** 项目工作目录 */
	cwd: string;
	/** 项目类型 */
	type: ProjectType;
	/** 是否为工作流项目（建立在 flowing 之上） */
	isWorkflow: boolean;
	/** 工作流实例 ID（若存在） */
	workflowInstanceId: string | null;
	/** 流转 ID（若存在） */
	flowingId: number | null;
	/** 原始 meta.json 内容（仅用于兜底，业务尽量不直接读） */
	rawMeta: Record<string, unknown> | null;
	/** 该项目的活动面板 tab 列表 */
	activityTabs: ActivityTabConfig[];
	/** 该项目活动面板默认激活的 tab */
	defaultActivityTab: ActivityTabKey;
}

const TAB_FILE: ActivityTabConfig = { key: "file", label: "文件", icon: "icon-[mdi--file-document-outline]" };
const TAB_JOURNEY: ActivityTabConfig = { key: "journey", label: "历程", icon: "icon-[mdi--timeline-outline]" };
const TAB_CHAT: ActivityTabConfig = { key: "chat", label: "聊天", icon: "icon-[mdi--message-text-outline]" };
const TAB_BATCH_PROGRESS: ActivityTabConfig = {
	key: "batch-progress",
	label: "执行进度",
	icon: "icon-[mdi--progress-clock]",
};
/**
 * 根据 meta 推断项目类型与是否工作流。
 * 规则：
 * - meta.type === "flowing" 且 meta.workflowInstanceId 存在 → 工作流项目
 * - meta.type 为 "flowing" / "batch" → 对应类型
 * - 其他 → "normal"
 */
function deriveType(meta: Record<string, unknown> | null): {
	type: ProjectType;
	isWorkflow: boolean;
	workflowInstanceId: string | null;
	flowingId: number | null;
} {
	const rawType = typeof meta?.type === "string" ? (meta.type as string) : null;
	const workflowInstanceIdRaw = meta?.workflowInstanceId;
	const workflowInstanceId =
		typeof workflowInstanceIdRaw === "string" || typeof workflowInstanceIdRaw === "number"
			? String(workflowInstanceIdRaw)
			: null;
	const flowingIdRaw = meta?.flowingId;
	const flowingId = typeof flowingIdRaw === "number" ? flowingIdRaw : null;

	let type: ProjectType;
	switch (rawType) {
		case "flowing":
		case "batch":
			type = rawType;
			break;
		default:
			type = "normal";
	}

	const isWorkflow = type === "flowing" && workflowInstanceId !== null;
	return { type, isWorkflow, workflowInstanceId, flowingId };
}

/**
 * 根据项目类型 / 是否工作流 计算活动面板 tab 配置。
 * 这是项目类型差异化配置的"中央调度点"，未来要按项目类型加 tab 在这里加。
 */
function buildActivityTabs(
	type: ProjectType,
	isWorkflow: boolean,
): {
	tabs: ActivityTabConfig[];
	defaultTab: ActivityTabKey;
} {
	if (isWorkflow) {
		return {
			tabs: [TAB_FILE, TAB_JOURNEY, TAB_CHAT],
			defaultTab: "journey",
		};
	}

	if (type === "batch") {
		return {
			tabs: [TAB_FILE, TAB_BATCH_PROGRESS],
			defaultTab: "file",
		};
	}

	// 非工作流项目（普通 / 流转）只展示文件 tab
	return {
		tabs: [TAB_FILE],
		defaultTab: "file",
	};
}

function buildProfile(cwd: string, meta: Record<string, unknown> | null): ProjectProfile {
	const { type, isWorkflow, workflowInstanceId, flowingId } = deriveType(meta);
	const { tabs, defaultTab } = buildActivityTabs(type, isWorkflow);
	return {
		cwd,
		type,
		isWorkflow,
		workflowInstanceId,
		flowingId,
		rawMeta: meta,
		activityTabs: tabs,
		defaultActivityTab: defaultTab,
	};
}

/**
 * 异步获取项目 profile。
 *
 * 直接读取 .vetta/meta.json，不做任何缓存。
 * 适合在事件回调 / 命令式代码中使用。组件渲染请使用 {@link useProjectProfile}。
 */
export async function getProjectProfile(cwd: string): Promise<ProjectProfile> {
	let meta: Record<string, unknown> | null = null;
	try {
		meta = await window.vetta.flowing.readMeta(cwd);
	} catch {
		meta = null;
	}
	return buildProfile(cwd, meta);
}

/**
 * 同步根据已知的 meta 构造 profile（不做 IO）。
 * 用于已经持有 meta 的场景，避免重复 IPC。
 */
export function buildProjectProfileFromMeta(cwd: string, meta: Record<string, unknown> | null): ProjectProfile {
	return buildProfile(cwd, meta);
}

interface UseProjectProfileResult {
	profile: ProjectProfile | null;
	loading: boolean;
	error: Error | null;
	/** 重新读取 meta.json 并刷新 profile */
	refresh: () => Promise<void>;
}

/**
 * React Hook：根据 cwd 获取项目 profile。
 *
 * - 内置 hook 内存缓存（同一 cwd 的多次渲染不会重复 IPC）
 * - 切换 cwd 时自动重新读取
 * - 调用 refresh() 可强制重新读取（例如 meta.json 被修改后）
 * - cwd 为 null 时不发起请求，profile 返回 null
 */
export function useProjectProfile(cwd: string | null): UseProjectProfileResult {
	const [profile, setProfile] = useState<ProjectProfile | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	// 缓存：cwd → profile，避免同一 cwd 反复读 meta
	const cacheRef = useRef<Map<string, ProjectProfile>>(new Map());
	// 标识当前正在处理的 cwd，避免并发请求乱序覆盖
	const activeCwdRef = useRef<string | null>(null);

	const load = useCallback(async (targetCwd: string, force: boolean) => {
		if (!force) {
			const cached = cacheRef.current.get(targetCwd);
			if (cached) {
				activeCwdRef.current = targetCwd;
				setProfile(cached);
				setLoading(false);
				setError(null);
				return;
			}
		}
		activeCwdRef.current = targetCwd;
		setLoading(true);
		setError(null);
		try {
			const next = await getProjectProfile(targetCwd);
			cacheRef.current.set(targetCwd, next);
			// 仅当当前请求仍是最新的才写回 state
			if (activeCwdRef.current === targetCwd) {
				setProfile(next);
				setLoading(false);
			}
		} catch (err) {
			if (activeCwdRef.current === targetCwd) {
				setError(err instanceof Error ? err : new Error(String(err)));
				setLoading(false);
			}
		}
	}, []);

	useEffect(() => {
		if (!cwd) {
			activeCwdRef.current = null;
			setProfile(null);
			setLoading(false);
			setError(null);
			return;
		}
		void load(cwd, false);
	}, [cwd, load]);

	const refresh = useCallback(async () => {
		if (!cwd) return;
		cacheRef.current.delete(cwd);
		await load(cwd, true);
	}, [cwd, load]);

	return { profile, loading, error, refresh };
}

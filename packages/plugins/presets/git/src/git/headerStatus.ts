import { collapseByPath, parseStatus } from "./parseStatus";
import { aheadBehind, currentBranch, resolveRepoRoot, statusPorcelain } from "./run";
import { peekGitTabProbe } from "./runtime";
import type { StatusGroups } from "./types";

/** 顶栏动作记住最近一次的 cwd：气泡由宿主渲染在插件子树外，不能靠闭包传参。 */
let headerRepoCwd: string | null = null;

export function setHeaderRepoCwd(cwd: string | null): void {
	headerRepoCwd = cwd;
}

export function getHeaderRepoCwd(): string | null {
	return headerRepoCwd;
}

/** 顶栏动作要显示的那几个数。刻意保持极小：它要能挂在一个每秒都可能重渲染的按钮上，
 * 而真正的工作区细节属于活动面板。
 */
export interface HeaderRepoStatus {
	branch: string | null;
	/** 有改动的文件数（同一文件只算一次）。 */
	files: number;
	/** 冲突文件数——唯一「必须人来处理」的状态，角标优先显示它。 */
	conflict: number;
	ahead: number;
	behind: number;
	/** 当前分支在远端有对应分支；false 时推送要先发布。 */
	published: boolean;
}

export interface HeaderStatusExtras {
	branch: string | null;
	ahead: number;
	behind: number;
	published: boolean;
}

export function summarizeStatus(groups: StatusGroups, extras: HeaderStatusExtras): HeaderRepoStatus {
	return {
		branch: extras.branch,
		files: collapseByPath(groups).length,
		conflict: groups.conflict.length,
		ahead: extras.ahead,
		behind: extras.behind,
		published: extras.published,
	};
}

/** `null` = 这个目录不是仓库（明确结论）；`undefined` = 还没探测过。 */
type Stored = HeaderRepoStatus | null;

const statuses = new Map<string, Stored>();
const listeners = new Set<() => void>();
const inFlight = new Set<string>();
const queued = new Set<string>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** 顶栏按钮上的数字不需要毫秒级新鲜：两次探测至少隔这么久，避免连点暂存时把 git 打满。 */
const MIN_GAP_MS = 500;

export function peekHeaderRepoStatus(cwd: string): Stored | undefined {
	return statuses.get(cwd);
}

export function subscribeHeaderRepoStatus(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

function publish(cwd: string, status: Stored): void {
	const previous = statuses.get(cwd);
	statuses.set(cwd, status);
	// 结论没变就不惊动订阅者：这个 store 被顶栏按钮订阅着，多余的通知等于多余的整排重渲。
	if (previous === status || JSON.stringify(previous) === JSON.stringify(status)) return;
	for (const listener of listeners) listener();
}

async function probe(cwd: string): Promise<Stored> {
	// 标签卡已经判定「不是仓库」时不必再跑三条命令。
	if (peekGitTabProbe(cwd) === "not-repo") return null;
	const root = await resolveRepoRoot(cwd).catch(() => null);
	if (!root) return null;
	const [raw, branch, ab] = await Promise.all([
		statusPorcelain(root).catch(() => null),
		currentBranch(root).catch(() => null),
		aheadBehind(root).catch(() => null),
	]);
	if (raw === null) return null;
	return summarizeStatus(parseStatus(raw), {
		branch,
		ahead: ab?.ahead ?? 0,
		behind: ab?.behind ?? 0,
		published: ab !== null,
	});
}

function run(cwd: string): void {
	if (inFlight.has(cwd)) {
		// 正在跑就记一笔「跑完再来一次」，保证最后一次改动一定会被反映出来。
		queued.add(cwd);
		return;
	}
	inFlight.add(cwd);
	void probe(cwd)
		.then((status) => publish(cwd, status))
		.catch(() => publish(cwd, null))
		.finally(() => {
			inFlight.delete(cwd);
			if (queued.delete(cwd)) run(cwd);
		});
}

const lastRunAt = new Map<string, number>();

/**
 * 确保 `cwd` 有一份不太旧的状态。渲染期不要调用（它会跑命令）；放在 effect、
 * 刷新信号与窗口聚焦里。
 */
export function ensureHeaderRepoStatus(cwd: string): void {
	if (inFlight.has(cwd)) {
		queued.add(cwd);
		return;
	}
	if (timers.has(cwd)) return;
	const last = lastRunAt.get(cwd);
	const wait = last === undefined ? 0 : Math.max(0, MIN_GAP_MS - (Date.now() - last));
	if (wait === 0) {
		lastRunAt.set(cwd, Date.now());
		run(cwd);
		return;
	}
	timers.set(
		cwd,
		setTimeout(() => {
			timers.delete(cwd);
			lastRunAt.set(cwd, Date.now());
			run(cwd);
		}, wait),
	);
}

/** 停用插件 / 卸载界面时清掉待触发的定时器，别让幽灵任务拖着插件不放。 */
export function disposeHeaderRepoStatus(): void {
	for (const timer of timers.values()) clearTimeout(timer);
	timers.clear();
	statuses.clear();
	lastRunAt.clear();
}

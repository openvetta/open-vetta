import type { PluginCommandApi, PluginFsApi } from "@vetta-org/plugin-sdk";
import { getFsApi, getGitCommand, peekGitTabProbe, publishGitTabProbe } from "./runtime";

/** 活动面板标签卡 id（与 registerActivityTab 的 contribution id 一致）。 */
export const CHANGES_TAB_ID = "changes";

/**
 * cwd 是否落在一个 git 工作区里。`git rev-parse --is-inside-work-tree` 在非仓库
 * 目录退出码非 0（stderr 是 "not a git repository"），仓库内输出 "true"；bare 仓库
 * 输出 "false"，此时没有可看的工作区变更，同样当作不在仓库。
 */
export async function isInsideGitWorkTree(command: PluginCommandApi, cwd: string): Promise<boolean> {
	try {
		const { stdout, exitCode } = await command.run("git", ["rev-parse", "--is-inside-work-tree"], {
			cwd,
			timeoutMs: 5_000,
		});
		return exitCode === 0 && stdout.trim() === "true";
	} catch {
		// 命令被禁用 / 超时 / 没装 git：一律当作不在仓库，标签卡不上栏。
		return false;
	}
}

/**
 * cwd 所在机器能不能跑 git（远程项目在远端执行）。没装时宿主的命令执行会直接失败；
 * macOS 缺命令行工具时宿主也按没装处理，不去碰会弹系统安装框的 /usr/bin/git。
 */
export async function isGitAvailable(command: PluginCommandApi, cwd?: string): Promise<boolean> {
	try {
		const { stdout, exitCode } = await command.run("git", ["--version"], { cwd, timeoutMs: 5_000 });
		return exitCode === 0 && stdout.startsWith("git version");
	} catch {
		return false;
	}
}

/** 标签卡的探测结论：no-git 表示目录看起来是仓库，但本机没有 git 可用。 */
export type GitTabProbe = "repo" | "not-repo" | "no-git";

/**
 * 决定标签卡要不要上栏。没装 git 时 rev-parse 必然失败，只凭它会把标签卡藏起来，
 * 用户就看不到安装引导；此时按目录里有没有 `.git` 判断它是不是仓库。
 */
export async function probeGitTab(command: PluginCommandApi, fs: PluginFsApi, cwd: string): Promise<GitTabProbe> {
	if (await isInsideGitWorkTree(command, cwd)) return "repo";
	if (await isGitAvailable(command, cwd)) return "not-repo";
	const gitDir = await fs.stat(`${cwd.replace(/[\\/]+$/, "")}/.git`).catch(() => null);
	return gitDir ? "no-git" : "not-repo";
}

/** 正在探测的 cwd，避免同一 cwd 被多个面板重复探测。 */
const inFlight = new Set<string>();

/**
 * 确保 `cwd` 有一个已缓存（或正在获取）的探测结论。
 *
 * 标签卡显隐只看缓存：探测完成后写回运行时并广播，标签栏随之重算。
 */
export function ensureGitTabProbe(cwd: string): void {
	if (peekGitTabProbe(cwd) !== undefined || inFlight.has(cwd)) return;
	inFlight.add(cwd);
	void probeGitTab(getGitCommand(), getFsApi(), cwd)
		.then((probe) => publishGitTabProbe(cwd, probe))
		.catch(() => publishGitTabProbe(cwd, "not-repo"))
		.finally(() => inFlight.delete(cwd));
}

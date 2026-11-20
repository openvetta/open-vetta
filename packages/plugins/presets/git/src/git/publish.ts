import { currentBranch, defaultRemote, hasUpstream } from "./run";

/** 推送前要知道的事：「直接推」还是「这个分支还没发布，先问一句」。 */
export type PushPreflight =
	| { kind: "ready" }
	| { kind: "needs-publish"; branch: string; remote: string }
	| { kind: "error"; key: "error.detachedHead" | "error.noRemote" };

/**
 * 新分支直接 `git push` 会失败（"has no upstream branch"），每个刚创建的分支都会撞上。
 * 这里统一判断：能推就推，没 upstream 就把分支和远端交回给调用方去确认，
 * 而不是偷偷替用户写 tracking 配置。面板工具栏与顶栏气泡共用这一份判断。
 */
export async function preflightPush(root: string): Promise<PushPreflight> {
	if (await hasUpstream(root)) return { kind: "ready" };
	const [branch, remote] = await Promise.all([currentBranch(root), defaultRemote(root)]);
	if (!branch) return { kind: "error", key: "error.detachedHead" };
	if (!remote) return { kind: "error", key: "error.noRemote" };
	return { kind: "needs-publish", branch, remote };
}

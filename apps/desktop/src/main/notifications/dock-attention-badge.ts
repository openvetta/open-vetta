import { app } from "electron";

/**
 * 会话需要用户回来看的原因：
 * - `action-required`：在等用户回答、审批计划、响应 MCP elicitation 或批准沙盒访问；
 * - `unread-result`：一轮已结束（完成或失败），用户还没打开看。
 */
export type DockAttentionKind = "action-required" | "unread-result";

/** Dock 的最小写入面；非 macOS 上没有 Dock，宿主为空操作。 */
export interface DockBadgeHost {
	setBadge(label: string): void;
	/** 只跳一次（informational），不持续跳到窗口前台化。 */
	bounce(): void;
}

const MAX_BADGE_COUNT = 99;

/** 0 时不显示角标；超过 99 显示「99+」。 */
export function formatDockBadgeLabel(count: number): string {
	if (count <= 0) return "";
	return count > MAX_BADGE_COUNT ? `${MAX_BADGE_COUNT}+` : String(count);
}

/**
 * Dock 角标计数：按 session 去重，一个会话最多计 1。只存在内存里，
 * 重启即清零——上次退出时挂着的提问/审批在重启后已经失效。
 */
export class DockAttentionTracker {
	private readonly pending = new Set<string>();

	/**
	 * `onChange` 把「需要回来看」的会话集合交给渲染层（命令面板据此保留刚跑完、还没打开的会话），
	 * 只在集合成员真正变化时调用。
	 */
	constructor(
		private readonly host: DockBadgeHost,
		private readonly onChange?: (sessionPaths: readonly string[]) => void,
	) {}

	get count(): number {
		return this.pending.size;
	}

	get sessionPaths(): readonly string[] {
		return [...this.pending];
	}

	/** `viewing` 为 true（窗口聚焦且正停在该会话）时用户已经看见，不计数也不跳。 */
	record(sessionPath: string, kind: DockAttentionKind, viewing: boolean): void {
		if (viewing) return;
		const before = this.pending.size;
		this.pending.add(sessionPath);
		if (this.pending.size !== before) this.render();
		// 已计数的会话又弹出提问时仍要跳：任务因此卡住，值得再提醒一次。
		if (kind === "action-required") this.host.bounce();
	}

	/** 用户打开了该会话：不论它是跑完还是在等操作，都算已读。 */
	markSeen(sessionPath: string | null): void {
		if (sessionPath && this.pending.delete(sessionPath)) this.render();
	}

	/** 会话被删除后再也打不开，必须移出计数，否则角标会一直挂到重启。 */
	forget(isDeleted: (sessionPath: string) => boolean): void {
		let changed = false;
		for (const sessionPath of [...this.pending]) {
			if (isDeleted(sessionPath)) {
				this.pending.delete(sessionPath);
				changed = true;
			}
		}
		if (changed) this.render();
	}

	private render(): void {
		this.host.setBadge(formatDockBadgeLabel(this.pending.size));
		this.onChange?.(this.sessionPaths);
	}
}

/** `app.dock` 只在 macOS 上存在；其余平台自然退化为空操作。 */
export function createElectronDockBadgeHost(): DockBadgeHost {
	return {
		setBadge: (label) => app?.dock?.setBadge(label),
		bounce: () => {
			app?.dock?.bounce("informational");
		},
	};
}

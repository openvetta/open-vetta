/**
 * 哪些会话正在等用户处理（提问 / 计划审批 / MCP 询问 / 沙箱授权）。
 *
 * 一个会话可能同时挂着多个请求：沙箱授权排队时又来了一个提问。所以按 `requestId` 记账，
 * 用集合而不是布尔值——早先只存 `sessionPath` 的布尔集合时，先被答复的那个请求会把仍在
 * 等待的标记一并清掉，侧栏的问号就提前灭了。
 */
export class PendingInteractions {
	private readonly byPath = new Map<string, Set<string>>();

	/** 开始等待；返回 true 表示这条会话的对外状态发生了变化。 */
	begin(sessionPath: string, requestId: string): boolean {
		const current = this.byPath.get(sessionPath);
		if (current?.has(requestId)) return false;
		const next = current ?? new Set<string>();
		next.add(requestId);
		this.byPath.set(sessionPath, next);
		return current === undefined;
	}

	/** 结束等待；返回 true 表示这条会话已经没有待处理请求。 */
	end(sessionPath: string, requestId: string): boolean {
		const current = this.byPath.get(sessionPath);
		if (!current?.delete(requestId)) return false;
		if (current.size > 0) return false;
		this.byPath.delete(sessionPath);
		return true;
	}

	/** 该会话剩余的请求数；0 表示它不在等待。 */
	countOf(sessionPath: string): number {
		return this.byPath.get(sessionPath)?.size ?? 0;
	}

	/** 仍在等待的会话快照，窗口重载后据此收敛。 */
	list(): { sessionPath: string; count: number }[] {
		return [...this.byPath].map(([sessionPath, ids]) => ({ sessionPath, count: ids.size }));
	}

	clear(): void {
		this.byPath.clear();
	}
}

import type { DesktopSessionSearchResult } from "../../shared/session-search.js";

/**
 * 把逐条产出的检索结果攒成批再发。
 *
 * 检索每命中一条就回调一次；若逐条跨线程发送，每条都要一次 worker→主进程消息、一轮主进程权限检查、
 * 一次 IPC 到渲染层和一次 React 更新。检索本身每处理一小段就让出一次事件循环，所以在下一轮事件循环
 * 统一发送，既不增加首条结果的可见延迟，又能把同一段里的命中合成一次。
 */
export interface SessionSearchResultBatcher {
	push(result: DesktopSessionSearchResult): void;
	/** 立刻发送尚未发出的结果；结束事件之前必须调用，保证结果先于 done 到达。 */
	flush(): void;
}

export function createSessionSearchResultBatcher(
	send: (results: DesktopSessionSearchResult[]) => void,
	schedule: (callback: () => void) => void = (callback) => setImmediate(callback),
): SessionSearchResultBatcher {
	let pending: DesktopSessionSearchResult[] = [];
	let scheduled = false;
	const flush = () => {
		scheduled = false;
		if (pending.length === 0) return;
		const batch = pending;
		pending = [];
		send(batch);
	};
	return {
		push(result) {
			pending.push(result);
			if (scheduled) return;
			scheduled = true;
			schedule(flush);
		},
		flush,
	};
}

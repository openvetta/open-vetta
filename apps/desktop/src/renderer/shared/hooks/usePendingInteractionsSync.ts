import { pendingInteractionPathsAtom } from "@shared/store/pending-interactions-atoms";
import { useSetAtom } from "jotai";
import { useEffect } from "react";

/**
 * 同步「正在等用户处理的会话」到 `pendingInteractionPathsAtom`。
 *
 * 与 `useRunningSessionsSync` 一样必须挂在始终存活的根级组件上：窗口重载期间事件会丢，
 * 所以订阅前先用主进程快照收敛一次，之后只吃增量。
 */
export function usePendingInteractionsSync(): void {
	const setPendingInteractions = useSetAtom(pendingInteractionPathsAtom);
	useEffect(() => {
		let cancelled = false;
		void window.vetta.session
			.listPendingQuestionPaths()
			.then((snapshot) => {
				if (cancelled) return;
				setPendingInteractions(new Map(snapshot.map(({ sessionPath, count }) => [sessionPath, count])));
			})
			.catch((error: unknown) => console.warn("[pending-interactions] snapshot failed", error));
		const unsubscribe = window.vetta.session.onPendingQuestionChanged(({ sessionPath, count }) => {
			setPendingInteractions((previous) => {
				const had = previous.get(sessionPath) ?? 0;
				if (count > 0 ? had === count : had === 0) return previous;
				const next = new Map(previous);
				if (count > 0) next.set(sessionPath, count);
				else next.delete(sessionPath);
				return next;
			});
		});
		return () => {
			cancelled = true;
			unsubscribe();
		};
	}, [setPendingInteractions]);
}

import { attentionSessionPathsAtom } from "@shared/store/attention-sessions-atoms";
import { useSetAtom } from "jotai";
import { useEffect } from "react";

/**
 * 同步「需要用户回来看的会话」到 attentionSessionPathsAtom。与 useRunningSessionsSync 同理
 * 挂在常驻的根组件上：挂在会卸载的组件里会漏掉期间的变化事件。
 * 先订阅再取快照；事件与快照都是全量集合，若快照返回前已收到事件，事件更新，快照丢弃。
 */
export function useAttentionSessionsSync(): void {
	const setAttentionPaths = useSetAtom(attentionSessionPathsAtom);
	useEffect(() => {
		let cancelled = false;
		let receivedEvent = false;
		const unsubscribe = window.vetta.notification.onAttentionSessionsChanged((paths) => {
			receivedEvent = true;
			setAttentionPaths(new Set(paths));
		});
		void window.vetta.notification
			.listAttentionSessions()
			.then((paths) => {
				if (!cancelled && !receivedEvent) setAttentionPaths(new Set(paths));
			})
			.catch(() => undefined);
		return () => {
			cancelled = true;
			unsubscribe();
		};
	}, [setAttentionPaths]);
}

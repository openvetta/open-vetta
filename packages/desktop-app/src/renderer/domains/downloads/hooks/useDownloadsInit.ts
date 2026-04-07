import { downloadsMapAtom } from "@shared/store/atoms";
import { useSetAtom } from "jotai";
import { useEffect } from "react";

/**
 * 应用级初始化：加载主进程已有下载列表 + 订阅事件。
 * 单挂载点：App.tsx 调用一次。
 */
export function useDownloadsInit(): void {
	const setMap = useSetAtom(downloadsMapAtom);

	useEffect(() => {
		void window.vetta.downloads.list().then((items) => {
			setMap(new Map(items.map((it) => [it.id, it])));
		});

		const unsub = window.vetta.downloads.onEvent((event) => {
			setMap((prev) => {
				const next = new Map(prev);
				if (event.type === "added" && event.item) {
					next.set(event.item.id, event.item);
				} else if (event.type === "updated" && event.item) {
					next.set(event.item.id, event.item);
				} else if (event.type === "removed" && event.id) {
					next.delete(event.id);
				}
				return next;
			});
		});

		return () => {
			unsub();
		};
	}, [setMap]);
}

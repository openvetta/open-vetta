import { fetchPendingCount, fetchPendingFlowings } from "@shared/lib/api";
import { authTokenAtom, flowingPendingCountAtom, flowingPendingListAtom } from "@shared/store/atoms";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import { useFlowingSSE } from "./useFlowingSSE";

export function useFlowingInit(): void {
	const token = useAtomValue(authTokenAtom);
	const setPendingList = useSetAtom(flowingPendingListAtom);
	const setPendingCount = useSetAtom(flowingPendingCountAtom);

	// 挂载 SSE 监听
	useFlowingSSE();

	// 登录后拉取 pending 数据
	useEffect(() => {
		if (!token) {
			setPendingList([]);
			setPendingCount(0);
			return;
		}

		void fetchPendingFlowings(token).then(setPendingList).catch(console.error);
		void fetchPendingCount(token).then(setPendingCount).catch(console.error);
	}, [token, setPendingList, setPendingCount]);
}

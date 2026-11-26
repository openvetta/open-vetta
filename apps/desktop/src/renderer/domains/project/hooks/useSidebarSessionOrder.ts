import { runningSessionPathsAtom, sidebarSessionViewAtom } from "@shared/store/atoms";
import { pendingInteractionPathsAtom } from "@shared/store/pending-interactions-atoms";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import type { SidebarSessionOrder } from "../services/sidebar-session-order";

/** 侧栏各会话列表共用的排序依据：用户选择的排序方式 + 当前活跃（运行中或等用户处理）的会话。 */
export function useSidebarSessionOrder(): SidebarSessionOrder {
	const { sort } = useAtomValue(sidebarSessionViewAtom);
	const runningPaths = useAtomValue(runningSessionPathsAtom);
	const waitingPaths = useAtomValue(pendingInteractionPathsAtom);
	return useMemo(
		() => ({
			sort,
			// 按创建时间排时活跃状态不参与排序，避免每次开始/结束运行都让列表跳动。
			activePaths: sort === "updated" ? new Set([...runningPaths, ...waitingPaths.keys()]) : new Set<string>(),
		}),
		[runningPaths, sort, waitingPaths],
	);
}

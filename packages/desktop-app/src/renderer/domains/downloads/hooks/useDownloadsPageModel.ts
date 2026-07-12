import { downloadsListAtom } from "@shared/store/atoms";
import { useNavigate } from "@tanstack/react-router";
import type { DownloadsPageViewProps } from "@vetta/theme-ui/downloads";
import { useAtomValue } from "jotai";
import { useMemo } from "react";

export function useDownloadsPageModel(): DownloadsPageViewProps {
	const list = useAtomValue(downloadsListAtom);
	const navigate = useNavigate();

	const grouped = useMemo(() => {
		const active = [];
		const finished = [];
		for (const it of list) {
			if (it.status === "downloading" || it.status === "queued" || it.status === "paused") {
				active.push(it);
			} else {
				finished.push(it);
			}
		}
		return { active, finished };
	}, [list]);

	return {
		labels: {
			title: "下载管理",
			subtitle: "支持断点续传与下载排队，最多同时下载 2 项",
			back: "返回",
			empty: "还没有下载任务",
			sectionActive: "进行中",
			sectionHistory: "历史",
			statusQueued: "排队中",
			statusDownloading: "下载中",
			statusPaused: "已暂停",
			statusCompleted: "已完成",
			statusFailed: "失败",
			statusCanceled: "已取消",
			pause: "暂停",
			resume: "继续",
			cancel: "取消",
			open: "打开",
			showInFolder: "文件位置",
			remove: "移除记录",
		},
		active: grouped.active,
		finished: grouped.finished,
		onBack: () => void navigate({ to: "/" }),
		onPause: (id) => void window.vetta.downloads.pause(id),
		onResume: (id) => void window.vetta.downloads.resume(id),
		onCancel: (id) => void window.vetta.downloads.cancel(id),
		onOpen: (id) => void window.vetta.downloads.openFile(id),
		onShowInFolder: (id) => void window.vetta.downloads.showInFolder(id),
		onRemove: (id) => void window.vetta.downloads.remove(id, false),
	};
}

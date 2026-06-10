import { updaterRestartDialogOpenAtom, updaterStateAtom } from "@shared/store/atoms";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";

/**
 * 出现在 Sidebar 顶栏（traffic-light 旁）：
 * - idle / checking：不渲染
 * - available：蓝点 icon，点击触发后台下载
 * - downloading：环形进度
 * - ready：醒目的"重启"图标 + 红点，点击重新打开 Dialog
 * - error：警示色，点击重试 check
 */
export function SidebarUpdateButton(): JSX.Element | null {
	const state = useAtomValue(updaterStateAtom);
	const openRestartDialog = useSetAtom(updaterRestartDialogOpenAtom);

	const onClick = useCallback(() => {
		if (state.phase === "available") {
			void window.vetta.updater.download();
			return;
		}
		if (state.phase === "ready") {
			openRestartDialog(true);
			return;
		}
		if (state.phase === "error") {
			void window.vetta.updater.check();
			return;
		}
		// downloading / installing：忽略
	}, [state.phase, openRestartDialog]);

	if (state.phase === "idle" || state.phase === "checking" || state.phase === "installing") {
		return null;
	}

	const title = (() => {
		if (state.phase === "available")
			return `发现新版本 ${state.latestVersion ?? ""}，点击后台下载`;
		if (state.phase === "downloading") {
			const pct = state.progress ? Math.round(state.progress * 100) : 0;
			return `正在下载 ${state.latestVersion ?? ""}（${pct}%）`;
		}
		if (state.phase === "ready") return `更新 ${state.latestVersion ?? ""} 已就绪，点击重启`;
		if (state.phase === "error") return state.error ?? "更新检查失败，点击重试";
		return "";
	})();

	const radius = 9;
	const stroke = 2;
	const circumference = 2 * Math.PI * radius;
	const progressOffset =
		state.phase === "downloading"
			? circumference * (1 - (state.progress ?? 0))
			: circumference;

	return (
		<button
			type="button"
			onClick={onClick}
			title={title}
			className="no-drag relative flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
		>
			{state.phase === "downloading" ? (
				<svg width="22" height="22" viewBox="0 0 22 22" className="rotate-[-90deg]">
					<title>下载进度</title>
					<circle
						cx="11"
						cy="11"
						r={radius}
						fill="none"
						stroke="currentColor"
						strokeWidth={stroke}
						opacity={0.25}
					/>
					<circle
						cx="11"
						cy="11"
						r={radius}
						fill="none"
						stroke="var(--primary)"
						strokeWidth={stroke}
						strokeDasharray={circumference}
						strokeDashoffset={progressOffset}
						strokeLinecap="round"
						style={{ transition: "stroke-dashoffset 200ms ease-out" }}
					/>
				</svg>
			) : state.phase === "ready" ? (
				<>
					<span className="icon-[solar--restart-linear] h-4 w-4 text-primary" />
					<span className="absolute right-[3px] top-[3px] h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_4px_color-mix(in_srgb,var(--primary)_60%,transparent)]" />
				</>
			) : state.phase === "available" ? (
				<>
					<span className="icon-[solar--download-linear] h-4 w-4 text-primary" />
					<span className="absolute right-[3px] top-[3px] h-1.5 w-1.5 rounded-full bg-primary" />
				</>
			) : (
				<span className="icon-[solar--danger-circle-linear] h-4 w-4 text-destructive" />
			)}
		</button>
	);
}

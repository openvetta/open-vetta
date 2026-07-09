import type { BatchTask } from "@shared/store/atoms";
import { AnimatePresence, motion } from "motion/react";
import { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import { relativeTime, statusLabel } from "../../utils/batchTaskListData";
import { OverlayActionButton } from "./BatchTaskActionButtons";
import type { TaskCallbacks, TaskTone } from "./types";

const STATUS_TONE: Record<BatchTask["status"], TaskTone> = {
	completed: {
		dot: "bg-emerald-500",
		ring: "ring-emerald-500/25",
		text: "text-emerald-400",
		bg: "bg-emerald-500/10",
	},
	running: {
		dot: "bg-emerald-500",
		ring: "ring-emerald-500/30",
		text: "text-emerald-400",
		bg: "bg-emerald-500/10",
	},
	failed: {
		dot: "bg-destructive",
		ring: "ring-destructive/30",
		text: "text-destructive",
		bg: "bg-destructive/10",
	},
	paused: {
		dot: "bg-primary",
		ring: "ring-primary/30",
		text: "text-primary",
		bg: "bg-primary/10",
	},
	pending: {
		dot: "bg-muted-foreground/40",
		ring: "ring-border/50",
		text: "text-muted-foreground/70",
		bg: "bg-muted/40",
	},
};

const QUEUED_TONE: TaskTone = {
	dot: "bg-amber-500",
	ring: "ring-amber-500/30",
	text: "text-amber-400",
	bg: "bg-amber-500/10",
};

export const BatchTaskCard = memo(function BatchTaskCard({
	callbacks,
	isQueued,
	task,
}: {
	callbacks: TaskCallbacks;
	isQueued: boolean;
	task: BatchTask;
}): JSX.Element {
	const { t } = useTranslation("batch-tasks");
	const tone = isQueued ? QUEUED_TONE : STATUS_TONE[task.status];
	const label = isQueued ? t("status.waiting") : statusLabel(task.status, Boolean(task.sessionId), t);
	const [hovered, setHovered] = useState(false);

	return (
		<div
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
			className="relative flex flex-col gap-1 overflow-hidden rounded-lg bg-muted px-2.5 py-2 transition-colors duration-300 ease-out hover:bg-accent"
		>
			<div className="flex items-center gap-1.5">
				<div className="relative flex h-1.5 w-1.5 shrink-0">
					{task.status === "running" && !isQueued && (
						<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
					)}
					<span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${tone.dot}`} />
				</div>
				<span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">{task.name}</span>
				<span
					className={`inline-flex h-4 shrink-0 items-center rounded-full px-1.5 text-[9px] font-medium leading-none ${tone.bg} ${tone.text}`}
				>
					{label}
				</span>
			</div>

			<div className="flex items-center text-[10px] text-muted-foreground/50">
				{task.sessionId ? (
					<span className="flex items-center gap-0.5">
						<span className="icon-[solar--clock-circle-linear] h-2.5 w-2.5" />
						{relativeTime(task.updatedAt, t)}
					</span>
				) : (
					<span className="text-muted-foreground/40">{t("status.notRun")}</span>
				)}
				{task.status === "failed" && task.error && (
					<span className="ml-auto flex max-w-[60%] items-center gap-0.5 truncate text-destructive" title={task.error}>
						<span className="icon-[solar--danger-circle-linear] h-2.5 w-2.5 shrink-0" />
						<span className="truncate">{task.error}</span>
					</span>
				)}
			</div>

			<AnimatePresence>
				{hovered && (
					<motion.div
						key="overlay"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
						className="absolute inset-0 flex items-center justify-center gap-1.5 bg-background/75 backdrop-blur-[3px]"
					>
						{task.sessionPath && (
							<OverlayActionButton
								icon="icon-[solar--square-top-down-linear]"
								title={t("actions.goToSession")}
								onClick={(event) => {
									event.stopPropagation();
									callbacks.goToSession(task);
								}}
							/>
						)}
						{isQueued ? (
							<OverlayActionButton
								icon="icon-[solar--close-circle-linear]"
								title={t("actions.cancelWait")}
								variant="danger"
								onClick={(event) => {
									event.stopPropagation();
									callbacks.stop(task.id);
								}}
							/>
						) : task.status === "pending" ? (
							<OverlayActionButton
								icon="icon-[solar--play-linear]"
								title={t("actions.run")}
								onClick={(event) => {
									event.stopPropagation();
									callbacks.run(task.id);
								}}
							/>
						) : task.status === "paused" ? (
							<OverlayActionButton
								icon="icon-[solar--play-linear]"
								title={t("actions.resume")}
								onClick={(event) => {
									event.stopPropagation();
									callbacks.resume(task.id);
								}}
							/>
						) : task.status === "failed" ? (
							<OverlayActionButton
								icon="icon-[solar--restart-linear]"
								title={t("actions.retry")}
								variant="danger"
								onClick={(event) => {
									event.stopPropagation();
									callbacks.retry(task);
								}}
							/>
						) : task.status === "completed" ? (
							<OverlayActionButton
								icon="icon-[solar--restart-linear]"
								title={t("actions.rerun")}
								onClick={(event) => {
									event.stopPropagation();
									callbacks.retry(task);
								}}
							/>
						) : null}
						{task.status !== "running" && (
							<OverlayActionButton
								icon="icon-[solar--trash-bin-trash-linear]"
								title={t("actions.delete")}
								variant="danger"
								onClick={(event) => {
									event.stopPropagation();
									callbacks.delete(task);
								}}
							/>
						)}
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
});

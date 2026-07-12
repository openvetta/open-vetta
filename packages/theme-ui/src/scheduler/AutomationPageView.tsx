import type { JSX, ReactNode } from "react";
import { motion } from "motion/react";
import { Button } from "@vetta/ui";

const easeOut = [0.22, 1, 0.36, 1] as const;

export interface AutomationPageViewLabels {
	readonly title: string;
	readonly subtitle: string;
	readonly newTask: string;
	readonly newTaskTitle: string;
	readonly emptyTitle: string;
	readonly emptyDesc: string;
	readonly emptyAction: string;
}

export interface AutomationPageViewProps {
	readonly hasTasks: boolean;
	readonly labels: AutomationPageViewLabels;
	readonly onNewTask: () => void;
	/** Host-owned TaskList / empty handled here when hasTasks. */
	readonly taskList: ReactNode;
	readonly historyDrawer: ReactNode;
	readonly taskFormDialog: ReactNode;
}

export function AutomationPageView({
	hasTasks,
	labels,
	onNewTask,
	taskList,
	historyDrawer,
	taskFormDialog,
}: AutomationPageViewProps): JSX.Element {
	return (
		<div className="relative flex h-full w-full flex-1 flex-col overflow-hidden">
			<div className="drag-region h-6 shrink-0" />

			<div className="relative shrink-0 px-8 pb-4">
				<div className="flex items-end justify-between gap-4">
					<motion.div
						initial={{ opacity: 0, y: -8 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.5, ease: easeOut }}
					>
						<h1 className="bg-gradient-to-br from-foreground via-foreground to-foreground/70 bg-clip-text text-[26px] font-bold leading-tight tracking-tight text-transparent">
							{labels.title}
						</h1>
						<p className="mt-1 text-[12px] text-muted-foreground/60">{labels.subtitle}</p>
					</motion.div>

					<Button type="button" variant="primary" onClick={onNewTask} title={labels.newTaskTitle}>
						<span className="icon-[mdi--plus] text-[15px]" />
						{labels.newTask}
					</Button>
				</div>
			</div>

			<div className="flex flex-1 flex-col gap-5 overflow-y-auto px-8 pt-5 pb-6">
				{hasTasks ? (
					taskList
				) : (
					<AutomationEmptyState
						title={labels.emptyTitle}
						desc={labels.emptyDesc}
						action={labels.emptyAction}
						onNew={onNewTask}
					/>
				)}
			</div>

			{historyDrawer}
			{taskFormDialog}
		</div>
	);
}

function AutomationEmptyState({
	title,
	desc,
	action,
	onNew,
}: {
	readonly title: string;
	readonly desc: string;
	readonly action: string;
	readonly onNew: () => void;
}): JSX.Element {
	return (
		<motion.div
			className="flex flex-1 flex-col items-center justify-center gap-5 text-center"
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.5, ease: easeOut }}
		>
			<motion.div
				className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-inset ring-primary/20"
				animate={{ y: [0, -6, 0] }}
				transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
			>
				<span className="absolute inset-0 rounded-2xl bg-primary/10 blur-2xl" />
				<span className="icon-[mdi--clock-check-outline] relative text-4xl text-primary/80" />
			</motion.div>
			<div className="space-y-1.5">
				<p className="text-[15px] font-semibold text-foreground">{title}</p>
				<p className="max-w-xs text-[12px] text-muted-foreground/60">{desc}</p>
			</div>
			<Button type="button" variant="primary" onClick={onNew} className="mt-2">
				<span className="icon-[mdi--plus] text-[15px]" />
				{action}
			</Button>
		</motion.div>
	);
}

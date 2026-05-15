import { useEffect, useMemo, useState } from "react";
import { useAtomValue, useAtom } from "jotai";
import { motion } from "motion/react";
import {
	batchProjectsAtom,
	batchProjectDialogOpenAtom,
	type BatchProject,
} from "@shared/store/atoms";
import { useBatchTasks } from "../hooks/useBatchTasks";
import { BatchTaskList } from "./BatchTaskList";
import { BatchProjectDialog } from "./BatchProjectDialog";

const easeOut = [0.22, 1, 0.36, 1] as const;

export function BatchTasksPage(): JSX.Element {
	const projects = useAtomValue(batchProjectsAtom);
	const [dialogProject, setDialogProject] = useAtom(batchProjectDialogOpenAtom);
	const { refreshProjects } = useBatchTasks();

	const [dialogOpen, setDialogOpen] = useState(false);

	useEffect(() => {
		refreshProjects();
	}, [refreshProjects]);

	useEffect(() => {
		if (dialogProject !== undefined) {
			setDialogOpen(true);
		}
	}, [dialogProject]);

	const handleCloseDialog = () => {
		setDialogOpen(false);
		setDialogProject(undefined);
	};

	const handleNewProject = () => {
		setDialogProject(null);
		setDialogOpen(true);
	};

	const stats = useMemo(() => {
		let total = 0;
		let running = 0;
		let completed = 0;
		let failed = 0;
		for (const p of projects) {
			for (const t of p.tasks) {
				total += 1;
				if (t.status === "running") running += 1;
				else if (t.status === "completed") completed += 1;
				else if (t.status === "failed") failed += 1;
			}
		}
		return { total, running, completed, failed, projects: projects.length };
	}, [projects]);

	return (
		<div className="relative flex h-full w-full flex-1 flex-col overflow-hidden">
			{/* Drag region */}
			<div className="drag-region h-12 shrink-0" />

			{/* ─── Header ─── */}
			<div className="relative shrink-0 px-8 pb-4">
				<div className="flex items-end justify-between gap-4">
					<motion.div
						initial={{ opacity: 0, y: -8 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.5, ease: easeOut }}
					>
						<div className="mb-1 flex items-center gap-2">
							<span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
								<span className="relative flex h-1.5 w-1.5">
									<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
									<span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
								</span>
								Batch
							</span>
						</div>
						<h1 className="bg-gradient-to-br from-foreground via-foreground to-foreground/70 bg-clip-text text-[26px] font-bold leading-tight tracking-tight text-transparent">
							批量任务
						</h1>
						<p className="mt-1 text-[12px] text-muted-foreground/60">
							一次配置，让 AI 自动处理多个文件夹
						</p>
					</motion.div>

					<div className="flex items-center gap-3">
						{stats.total > 0 && <CompactStats stats={stats} />}
						<motion.button
							type="button"
							onClick={handleNewProject}
							initial={{ opacity: 0, y: -6, scale: 0.96 }}
							animate={{ opacity: 1, y: 0, scale: 1 }}
							transition={{ type: "spring", stiffness: 380, damping: 26, delay: 0.1 }}
							whileHover={{ scale: 1.04, y: -1 }}
							whileTap={{ scale: 0.96 }}
							className="flex items-center gap-1.5 rounded-full bg-gradient-to-br from-primary to-primary/85 px-4 py-2 text-[13px] font-medium text-primary-foreground shadow-[0_8px_24px_-10px_var(--primary)] transition-shadow hover:shadow-[0_12px_30px_-8px_var(--primary)]"
						>
							<span className="icon-[mdi--plus] text-[15px]" />
							新建项目
						</motion.button>
					</div>
				</div>
			</div>

			{/* Divider */}
			<div className="mx-8 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />

			{/* ─── Content ─── */}
			<div className="flex flex-1 flex-col gap-6 overflow-y-auto px-8 pt-5 pb-6">
				{projects.length === 0 ? (
					<EmptyState onNew={handleNewProject} />
				) : (
					<BatchTaskList
						projects={projects}
						onEditProject={(project: BatchProject) => {
							setDialogProject(project);
							setDialogOpen(true);
						}}
					/>
				)}
			</div>

			<BatchProjectDialog
				open={dialogOpen}
				project={dialogProject ?? undefined}
				onClose={handleCloseDialog}
			/>
		</div>
	);
}

interface BatchStats {
	total: number;
	running: number;
	completed: number;
	failed: number;
	projects: number;
}

function CompactStats({ stats }: { stats: BatchStats }): JSX.Element {
	const items: { label: string; value: number; tone: string }[] = [
		{ label: "总数", value: stats.total, tone: "text-muted-foreground" },
		{ label: "运行中", value: stats.running, tone: "text-emerald-400" },
		{ label: "已完成", value: stats.completed, tone: "text-emerald-400" },
		{ label: "失败", value: stats.failed, tone: "text-red-400" },
	];
	return (
		<motion.div
			initial={{ opacity: 0, y: -4 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.35, ease: easeOut, delay: 0.05 }}
			className="hidden items-center gap-3 rounded-full border border-border/40 bg-card/30 px-3 py-1.5 text-[11px] backdrop-blur-sm sm:flex"
		>
			{items.map((it, idx) => (
				<div key={it.label} className="flex items-center gap-1.5">
					{idx > 0 && <span className="h-3 w-px bg-border/50" />}
					<span className="text-muted-foreground/60">{it.label}</span>
					<span className={`tabular-nums text-[12px] font-semibold leading-none ${it.tone}`}>{it.value}</span>
				</div>
			))}
		</motion.div>
	);
}

function EmptyState({ onNew }: { onNew: () => void }): JSX.Element {
	return (
		<motion.div
			className="flex flex-1 flex-col items-center justify-center gap-5 text-center"
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.5, ease: easeOut }}
		>
			<motion.div
				className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-inset ring-primary/20"
				animate={{ y: [0, -6, 0] }}
				transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
			>
				<span className="absolute inset-0 rounded-3xl bg-primary/10 blur-2xl" />
				<span className="icon-[mdi--format-list-bulleted] relative text-4xl text-primary/80" />
			</motion.div>
			<div className="space-y-1.5">
				<p className="text-[15px] font-semibold text-foreground">暂无批量任务</p>
				<p className="max-w-xs text-[12px] text-muted-foreground/60">
					创建批量任务，让 AI 自动处理多个文件夹
				</p>
			</div>
			<motion.button
				type="button"
				onClick={onNew}
				whileHover={{ scale: 1.04, y: -1 }}
				whileTap={{ scale: 0.96 }}
				className="mt-2 flex items-center gap-1.5 rounded-full bg-gradient-to-br from-primary to-primary/85 px-5 py-2 text-[13px] font-medium text-primary-foreground shadow-[0_10px_30px_-12px_var(--primary)]"
			>
				<span className="icon-[mdi--plus] text-[15px]" />
				创建第一个项目
			</motion.button>
		</motion.div>
	);
}

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAtomValue, useAtom, useSetAtom } from "jotai";
import { motion } from "motion/react";
import {
	batchProjectsAtom,
	batchProjectDialogOpenAtom,
	pageHeaderTitleHiddenAtom,
	type BatchProject,
} from "@shared/store/atoms";
import { Button } from "@shared/components/ui/button";
import { useBatchTasks } from "../hooks/useBatchTasks";
import { BatchTaskList } from "./BatchTaskList";
import { BatchProjectDialog } from "./BatchProjectDialog";

const easeOut = [0.22, 1, 0.36, 1] as const;

export function BatchTasksPage(): JSX.Element {
	const { t } = useTranslation("batch-tasks");
	const projects = useAtomValue(batchProjectsAtom);
	const [dialogProject, setDialogProject] = useAtom(batchProjectDialogOpenAtom);
	const setHeaderTitleHidden = useSetAtom(pageHeaderTitleHiddenAtom);
	const { refreshProjects } = useBatchTasks();

	const [dialogOpen, setDialogOpen] = useState(false);

	useEffect(() => {
		refreshProjects();
	}, [refreshProjects]);

	// 批量任务页不显示顶栏左上角标题（页面内已有大号标题）。
	useEffect(() => {
		setHeaderTitleHidden(true);
		return () => setHeaderTitleHidden(false);
	}, [setHeaderTitleHidden]);

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
			<div className="drag-region h-6 shrink-0" />

			{/* ─── Header ─── */}
			<div className="relative shrink-0 px-8 pb-4">
				<div className="flex items-end justify-between gap-4">
					<motion.div
						initial={{ opacity: 0, y: -8 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.5, ease: easeOut }}
					>
						<h1 className="bg-gradient-to-br from-foreground via-foreground to-foreground/70 bg-clip-text text-[26px] font-bold leading-tight tracking-tight text-transparent">
							{t("page.title")}
						</h1>
						<p className="mt-1 text-[12px] text-muted-foreground/60">
							{t("page.subtitle")}
						</p>
					</motion.div>

					<div className="flex items-center gap-3">
						{stats.total > 0 && <CompactStats stats={stats} />}
						<Button type="button" variant="primary" onClick={handleNewProject}>
							<span className="icon-[mdi--plus] text-[15px]" />
							{t("page.newProject")}
						</Button>
					</div>
				</div>
			</div>

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
	const { t } = useTranslation("batch-tasks");
	const items: { label: string; value: number; tone: string }[] = [
		{ label: t("stats.total"), value: stats.total, tone: "text-muted-foreground" },
		{ label: t("stats.running"), value: stats.running, tone: "text-emerald-400" },
		{ label: t("stats.completed"), value: stats.completed, tone: "text-emerald-400" },
		{ label: t("stats.failed"), value: stats.failed, tone: "text-red-400" },
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
	const { t } = useTranslation("batch-tasks");
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
				<p className="text-[15px] font-semibold text-foreground">{t("empty.title")}</p>
				<p className="max-w-xs text-[12px] text-muted-foreground/60">
					{t("empty.desc")}
				</p>
			</div>
			<Button type="button" variant="primary" onClick={onNew} className="mt-2">
				<span className="icon-[mdi--plus] text-[15px]" />
				{t("empty.action")}
			</Button>
		</motion.div>
	);
}

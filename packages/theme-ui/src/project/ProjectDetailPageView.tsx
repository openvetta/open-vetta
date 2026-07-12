import { AnimatePresence, motion } from "motion/react";
import type { JSX, ReactNode, RefObject } from "react";

const easeOut = [0.22, 1, 0.36, 1] as const;

export type ProjectDetailSaveStatus = "idle" | "saving" | "saved" | "error";

export interface ProjectDetailPageViewLabels {
	bindWorkflow: string;
	showInFolderTitle: string;
	showInFolder: string;
	exportTitle: string;
	export: string;
	newSession: string;
	closeActivityPanel: string;
	openActivityPanel: string;
	persona: string;
	unsavedChanges: string;
	saved: string;
	saveFailed: string;
	save: string;
	editorPlaceholder: string;
	agentsMdHint: string;
	quickSave: string;
	saveShortcut: string;
}

export interface ProjectDetailPageViewProps {
	activityOpen: boolean;
	/** Host ActivityPanel. */
	activityPanel: ReactNode;
	/** Host BatchQueueStatus section body (already wrapped or raw). */
	batchSection: ReactNode | null;
	/** Host WorkflowBindDialog. */
	bindDialog: ReactNode | null;
	content: string;
	createdAtLabel: string | null;
	cwd: string;
	displayName: string;
	editorFocused: boolean;
	exportable: boolean;
	/** Host FlowingWorkflow section. */
	flowingSection: ReactNode | null;
	isDirty: boolean;
	labels: ProjectDetailPageViewLabels;
	loading: boolean;
	onBindWorkflow: () => void;
	onContentChange: (value: string) => void;
	onEditorBlur: () => void;
	onEditorFocus: () => void;
	onExport: () => void;
	onNewSession: () => void;
	onSave: () => void;
	onShowInFolder: () => void;
	onToggleActivity: () => void;
	projectTypeLabel: string | null;
	saveStatus: ProjectDetailSaveStatus;
	sessionCountLabel: string;
	showBindWorkflow: boolean;
	taskCountLabel: string | null;
	textareaRef: RefObject<HTMLTextAreaElement | null>;
	/** Host WorkflowProgress section. */
	workflowProgressSection: ReactNode | null;
}

export function ProjectDetailPageView({
	activityOpen,
	activityPanel,
	batchSection,
	bindDialog,
	content,
	createdAtLabel,
	cwd,
	displayName,
	editorFocused,
	exportable,
	flowingSection,
	isDirty,
	labels,
	loading,
	onBindWorkflow,
	onContentChange,
	onEditorBlur,
	onEditorFocus,
	onExport,
	onNewSession,
	onSave,
	onShowInFolder,
	onToggleActivity,
	projectTypeLabel,
	saveStatus,
	sessionCountLabel,
	showBindWorkflow,
	taskCountLabel,
	textareaRef,
	workflowProgressSection,
}: ProjectDetailPageViewProps): JSX.Element {
	return (
		<div className="flex h-full w-full flex-col overflow-hidden">
			<div className="drag-region h-12 shrink-0" />
			<div className="flex min-h-0 flex-1">
				<div className="relative flex min-w-0 flex-1 flex-col">
					<div className="relative shrink-0 px-10 pt-0 pb-5">
						<motion.div
							className="mb-3 flex items-center justify-between"
							initial={{ opacity: 0, y: -8 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.5, ease: easeOut }}
						>
							<div className="flex items-center gap-2.5">
								<AnimatePresence mode="popLayout">
									{projectTypeLabel && (
										<motion.span
											key={projectTypeLabel}
											initial={{ opacity: 0, scale: 0.85, y: -4 }}
											animate={{ opacity: 1, scale: 1, y: 0 }}
											exit={{ opacity: 0, scale: 0.85, y: -4 }}
											transition={{ type: "spring", stiffness: 380, damping: 26 }}
											className="relative inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary"
										>
											<span className="relative flex h-1.5 w-1.5">
												<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
												<span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
											</span>
											{projectTypeLabel}
										</motion.span>
									)}
								</AnimatePresence>
								{showBindWorkflow && (
									<motion.div
										initial={{ opacity: 0, x: -6 }}
										animate={{ opacity: 1, x: 0 }}
										transition={{ delay: 0.15, duration: 0.4, ease: easeOut }}
									>
										<button
											type="button"
											className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-muted-foreground/60 hover:bg-primary/8 hover:text-primary"
											onClick={onBindWorkflow}
										>
											<span className="icon-[mdi--sitemap-outline] text-xs" />
											<span className="text-[10px]">{labels.bindWorkflow}</span>
										</button>
									</motion.div>
								)}
							</div>
							<motion.div
								className="flex items-center gap-2"
								initial="hidden"
								animate="show"
								variants={{
									hidden: {},
									show: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
								}}
							>
								<ActionButton onClick={onShowInFolder} title={labels.showInFolderTitle}>
									<span className="icon-[solar--folder-open-linear] h-3.5 w-3.5" />
									<span className="text-[12px]">{labels.showInFolder}</span>
								</ActionButton>
								{exportable && (
									<ActionButton onClick={onExport} title={labels.exportTitle}>
										<span className="icon-[solar--export-linear] h-3.5 w-3.5" />
										<span className="text-[12px]">{labels.export}</span>
									</ActionButton>
								)}
								<motion.div
									variants={{
										hidden: { opacity: 0, y: -6, scale: 0.96 },
										show: { opacity: 1, y: 0, scale: 1 },
									}}
									transition={{ type: "spring", stiffness: 380, damping: 26 }}
									whileHover={{ scale: 1.04, y: -1 }}
									whileTap={{ scale: 0.96 }}
								>
									<button
										type="button"
										onClick={onNewSession}
										className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-transparent bg-primary px-2.5 text-sm font-medium whitespace-nowrap text-primary-foreground transition-all outline-none select-none hover:bg-primary/90"
									>
										<span className="icon-[solar--add-circle-linear] h-4 w-4" />
										<span className="text-[12px] font-medium">{labels.newSession}</span>
									</button>
								</motion.div>
								<motion.div
									variants={{
										hidden: { opacity: 0, y: -6, scale: 0.96 },
										show: { opacity: 1, y: 0, scale: 1 },
									}}
									transition={{ type: "spring", stiffness: 380, damping: 26 }}
									whileHover={{ scale: 1.08 }}
									whileTap={{ scale: 0.92 }}
								>
									<button
										type="button"
										title={activityOpen ? labels.closeActivityPanel : labels.openActivityPanel}
										onClick={onToggleActivity}
										className={`inline-flex h-7 w-7 items-center justify-center rounded-md ${
											activityOpen
												? "bg-secondary text-secondary-foreground"
												: "text-muted-foreground hover:bg-accent hover:text-foreground"
										}`}
									>
										<span className="icon-[solar--sidebar-minimalistic-linear] -scale-x-100 text-[14px]" />
									</button>
								</motion.div>
							</motion.div>
						</motion.div>

						<motion.h1
							className="mb-1.5 bg-gradient-to-br from-foreground via-foreground to-foreground/70 bg-clip-text text-[30px] font-bold leading-[1.1] tracking-tight text-transparent"
							initial={{ opacity: 0, y: 14 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.6, delay: 0.1, ease: easeOut }}
						>
							{displayName}
						</motion.h1>
						<motion.p
							className="mb-4 flex items-center gap-1.5 truncate font-mono text-[11px] text-muted-foreground/50"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							transition={{ duration: 0.5, delay: 0.25 }}
						>
							<span className="icon-[mdi--folder-outline] h-3 w-3 opacity-60" />
							{cwd}
						</motion.p>

						<motion.div
							className="flex flex-wrap items-center gap-2"
							initial="hidden"
							animate="show"
							variants={{
								hidden: {},
								show: { transition: { staggerChildren: 0.07, delayChildren: 0.3 } },
							}}
						>
							<StatPill icon="icon-[mdi--chat-outline]" value={sessionCountLabel} />
							{createdAtLabel && (
								<StatPill icon="icon-[mdi--calendar-outline]" value={createdAtLabel} />
							)}
							{taskCountLabel && (
								<StatPill icon="icon-[mdi--layers-outline]" value={taskCountLabel} />
							)}
						</motion.div>
					</div>

					<div className="relative mx-10 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />

					<div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
						{batchSection}
						{flowingSection}
						{workflowProgressSection}

						<motion.div
							className="flex min-h-[340px] flex-1 flex-col px-10 py-6"
							initial={{ opacity: 0, y: 16 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.6, delay: 0.45, ease: easeOut }}
						>
							<div className="mb-4 flex items-center justify-between">
								<div className="flex items-center gap-2.5">
									<motion.div
										className="relative flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-inset ring-primary/20"
										whileHover={{ rotate: -6, scale: 1.08 }}
										transition={{ type: "spring", stiffness: 320, damping: 18 }}
									>
										<span className="icon-[mdi--file-document-edit-outline] h-3.5 w-3.5 text-primary" />
									</motion.div>
									<h2 className="text-[13px] font-semibold tracking-tight text-foreground">
										{labels.persona}
									</h2>
									<AnimatePresence>
										{isDirty && (
											<motion.span
												key="dirty"
												initial={{ opacity: 0, scale: 0 }}
												animate={{ opacity: 1, scale: 1 }}
												exit={{ opacity: 0, scale: 0 }}
												className="relative flex h-1.5 w-1.5"
												title={labels.unsavedChanges}
											>
												<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-70" />
												<span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
											</motion.span>
										)}
									</AnimatePresence>
								</div>
								<div className="flex items-center gap-2.5">
									<AnimatePresence mode="popLayout">
										{saveStatus === "saved" && (
											<motion.span
												key="saved"
												initial={{ opacity: 0, x: 6 }}
												animate={{ opacity: 1, x: 0 }}
												exit={{ opacity: 0, x: 6 }}
												className="flex items-center gap-1 text-[12px] font-medium text-emerald-400/90"
											>
												<span className="icon-[mdi--check-circle] h-3.5 w-3.5" />
												{labels.saved}
											</motion.span>
										)}
										{saveStatus === "error" && (
											<motion.span
												key="error"
												initial={{ opacity: 0, x: 6 }}
												animate={{ opacity: 1, x: 0 }}
												exit={{ opacity: 0, x: 6 }}
												className="flex items-center gap-1 text-[12px] font-medium text-destructive"
											>
												<span className="icon-[mdi--alert-circle-outline] h-3.5 w-3.5" />
												{labels.saveFailed}
											</motion.span>
										)}
									</AnimatePresence>
									<motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
										<button
											type="button"
											className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full border border-border/50 px-2.5 text-sm font-medium transition-all duration-200 hover:border-primary/40 hover:text-primary disabled:opacity-40"
											onClick={onSave}
											disabled={!isDirty || saveStatus === "saving"}
										>
											{saveStatus === "saving" ? (
												<span className="icon-[mdi--loading] h-3.5 w-3.5 animate-spin" />
											) : (
												<span className="icon-[mdi--content-save-outline] h-3.5 w-3.5" />
											)}
											{labels.save}
										</button>
									</motion.div>
								</div>
							</div>

							{loading ? (
								<div className="flex flex-1 items-center justify-center">
									<motion.span
										className="icon-[mdi--loading] h-5 w-5 text-primary/60"
										animate={{ rotate: 360 }}
										transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
									/>
								</div>
							) : (
								<motion.div
									className="group relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/40 bg-card/40 backdrop-blur-sm"
									animate={{
										borderColor: editorFocused
											? "color-mix(in oklab, var(--primary) 45%, transparent)"
											: "color-mix(in oklab, var(--border) 50%, transparent)",
									}}
									transition={{ duration: 0.35, ease: easeOut }}
								>
									<motion.div
										className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent"
										initial={{ opacity: 0, scaleX: 0.5 }}
										animate={{
											opacity: editorFocused ? 1 : 0.25,
											scaleX: editorFocused ? 1 : 0.6,
										}}
										transition={{ duration: 0.4, ease: easeOut }}
									/>
									<textarea
										ref={textareaRef}
										value={content}
										onChange={(e) => onContentChange(e.target.value)}
										onFocus={onEditorFocus}
										onBlur={onEditorBlur}
										placeholder={labels.editorPlaceholder}
										spellCheck={false}
										className="min-h-0 flex-1 resize-none bg-transparent px-6 py-5 font-mono text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground/30 focus:outline-none"
									/>
								</motion.div>
							)}

							<p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
								<span className="icon-[mdi--information-outline] h-3 w-3 opacity-60" />
								{labels.agentsMdHint}
								<kbd className="ml-1 rounded-md border border-border/40 bg-accent/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/70 shadow-sm">
									{labels.saveShortcut}
								</kbd>
								<span>{labels.quickSave}</span>
							</p>
						</motion.div>
					</div>
				</div>
				{activityPanel}
			</div>
			{bindDialog}
		</div>
	);
}

function ActionButton({
	children,
	onClick,
	title,
}: {
	children: React.ReactNode;
	onClick: () => void;
	title?: string;
}): JSX.Element {
	return (
		<motion.div
			variants={{
				hidden: { opacity: 0, y: -6, scale: 0.96 },
				show: { opacity: 1, y: 0, scale: 1 },
			}}
			transition={{ type: "spring", stiffness: 380, damping: 26 }}
			whileHover={{ scale: 1.04, y: -1 }}
			whileTap={{ scale: 0.96 }}
		>
			<button
				type="button"
				onClick={onClick}
				title={title}
				className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 text-sm font-medium text-foreground transition-all hover:bg-accent"
			>
				{children}
			</button>
		</motion.div>
	);
}

function StatPill({ icon, value }: { icon: string; value: string }): JSX.Element {
	return (
		<motion.div
			variants={{
				hidden: { opacity: 0, y: 8, scale: 0.94 },
				show: { opacity: 1, y: 0, scale: 1 },
			}}
			transition={{ type: "spring", stiffness: 320, damping: 24 }}
			whileHover={{ y: -2, scale: 1.03 }}
			className="group flex items-center gap-1.5 rounded-full border border-border/40 bg-card/40 px-3 py-1.5 text-[12px] text-muted-foreground/80 backdrop-blur-sm transition-colors duration-200 hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
		>
			<span className={`${icon} h-3.5 w-3.5 opacity-60 transition-opacity group-hover:opacity-100`} />
			<span>{value}</span>
		</motion.div>
	);
}

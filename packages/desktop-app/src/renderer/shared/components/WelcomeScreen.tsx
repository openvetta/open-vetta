import { useCallback, useEffect, useRef, useState } from "react";
import { useAtom, useSetAtom } from "jotai";
import { AnimatePresence, motion } from "motion/react";
import type { SkillInfo } from "@preload/api";
import { inputValueAtom, selectedSkillAtom } from "@shared/store/atoms";
import { useProjects } from "@domains/project/hooks/useProjects";
import { useSessionManager } from "@domains/chat/hooks/useSessionManager";

const SPRING = { type: "spring" as const, stiffness: 460, damping: 32 };

function makeProjectName(text: string): string {
	const trimmed = text.trim().replace(/[\\/:*?"<>|]/g, "").slice(0, 16);
	const stamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 12);
	return trimmed ? `${trimmed}-${stamp}` : `新项目-${stamp}`;
}

export function WelcomeScreen(): JSX.Element {
	const [mounted, setMounted] = useState(false);
	const [text, setText] = useState("");
	const [selectedSkill, setSelectedSkill] = useAtom(selectedSkillAtom);
	const setInputValue = useSetAtom(inputValueAtom);
	const [skills, setSkills] = useState<SkillInfo[]>([]);
	const [creating, setCreating] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const { createProject } = useProjects();
	const { openSession } = useSessionManager();

	useEffect(() => {
		const timer = setTimeout(() => setMounted(true), 30);
		return () => clearTimeout(timer);
	}, []);

	useEffect(() => {
		void window.vetta.skills.list().then(setSkills);
	}, []);

	const scenes = skills.filter((s) => s.type === "scene");

	const resize = useCallback(() => {
		const el = textareaRef.current;
		if (!el) return;
		el.style.height = "0";
		el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
	}, []);

	useEffect(resize, [text, resize]);

	const canSend = text.trim().length > 0 && !creating;

	const handleSend = useCallback(async () => {
		if (!canSend) return;
		setCreating(true);
		try {
			// Pre-populate the chat input so the new ChatView shows the text
			// (and the selected skill capsule) the moment it mounts.
			setInputValue(text);
			const name = makeProjectName(text);
			const cwd = await createProject(name);
			await openSession(cwd);
		} finally {
			setCreating(false);
		}
	}, [canSend, text, createProject, openSession, setInputValue]);

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
		if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
			e.preventDefault();
			void handleSend();
		}
	};

	const handleSelectScene = useCallback(
		(skill: SkillInfo) => {
			setSelectedSkill({ name: skill.name, type: skill.type });
			textareaRef.current?.focus();
		},
		[setSelectedSkill],
	);

	return (
		<div className="relative flex h-full flex-1 flex-col overflow-hidden bg-background">
			{/* Drag region */}
			<div className="drag-region absolute inset-x-0 top-0 z-10 h-12" />

			{/* Ambient glow */}
			<div className="pointer-events-none absolute inset-0">
				<div
					className="absolute left-1/2 top-[40%] h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.08]"
					style={{
						background: "radial-gradient(circle, var(--primary) 0%, transparent 70%)",
					}}
				/>
				<div
					className="absolute left-1/2 top-[35%] h-[280px] w-[280px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.06]"
					style={{
						background: "radial-gradient(circle, var(--primary) 0%, transparent 60%)",
					}}
				/>
			</div>

			<div className="no-drag relative flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-10">
				<motion.div
					initial={{ opacity: 0, y: 12 }}
					animate={{ opacity: mounted ? 1 : 0, y: mounted ? 0 : 12 }}
					transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
					className="flex w-full max-w-2xl flex-col items-center"
				>
					{/* Hero */}
					<div className="relative mb-5">
						<div
							className="absolute -inset-4 rounded-[24px] opacity-50"
							style={{
								background:
									"radial-gradient(circle, color-mix(in srgb, var(--primary) 45%, transparent) 0%, transparent 70%)",
								filter: "blur(14px)",
							}}
						/>
						<div
							className="relative flex h-[68px] w-[68px] items-center justify-center rounded-[18px] bg-primary text-primary-foreground"
							style={{
								boxShadow:
									"0 8px 32px -8px color-mix(in srgb, var(--primary) 60%, transparent)",
							}}
						>
							<span className="icon-[mdi--robot-outline] h-9 w-9" />
						</div>
					</div>

					<h1 className="text-[24px] font-semibold tracking-[-0.03em] text-foreground">
						开启一个新项目
					</h1>
					<p className="mt-1.5 text-[13px] text-muted-foreground/70">
						告诉我你想做什么，我会自动为你创建项目并开始
					</p>

					{/* Mini AI Input card */}
					<motion.div
						initial={{ opacity: 0, y: 8 }}
						animate={{ opacity: mounted ? 1 : 0, y: mounted ? 0 : 8 }}
						transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.08 }}
						className="mt-7 w-full rounded-[20px] border border-primary/20 bg-card shadow-[0_8px_30px_-12px_color-mix(in_srgb,var(--primary)_25%,transparent)]"
					>
						{/* Selected scene capsule */}
						<AnimatePresence initial={false}>
							{selectedSkill && (
								<motion.div
									initial={{ height: 0, opacity: 0 }}
									animate={{ height: "auto", opacity: 1 }}
									exit={{ height: 0, opacity: 0 }}
									transition={{ duration: 0.18 }}
									className="overflow-hidden"
								>
									<div className="px-4 pt-3">
										<motion.button
											type="button"
											onClick={() => setSelectedSkill(null)}
											initial={{ scale: 0.85, opacity: 0 }}
											animate={{ scale: 1, opacity: 1 }}
											exit={{ scale: 0.85, opacity: 0 }}
											transition={SPRING}
											className="flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary"
											title="点击移除"
										>
											<span
												className={`${
													selectedSkill.type === "scene"
														? "icon-[mdi--movie-open-outline]"
														: "icon-[mdi--puzzle-outline]"
												} h-3 w-3`}
											/>
											<span className="max-w-[160px] truncate">{selectedSkill.name}</span>
											<span className="icon-[mdi--close] h-3 w-3 opacity-60" />
										</motion.button>
									</div>
								</motion.div>
							)}
						</AnimatePresence>

						<div className="px-4 pt-3 pb-1">
							<textarea
								ref={textareaRef}
								rows={1}
								autoFocus
								value={text}
								onChange={(e) => setText(e.target.value)}
								onKeyDown={handleKeyDown}
								placeholder="想让 Vetta 帮你做点什么？"
								className="w-full resize-none bg-transparent text-[14px] leading-[1.6] text-foreground outline-none placeholder:text-muted-foreground/50"
								style={{ minHeight: 28, maxHeight: 180 }}
							/>
						</div>

						<div className="flex items-center justify-between gap-2 px-3 pb-2.5">
							<div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
								<span className="icon-[mdi--folder-plus-outline] h-3.5 w-3.5" />
								<span>发送后将自动创建新项目</span>
							</div>
							<motion.button
								type="button"
								onClick={() => void handleSend()}
								disabled={!canSend}
								whileHover={canSend ? { scale: 1.05, y: -1 } : undefined}
								whileTap={canSend ? { scale: 0.94 } : undefined}
								transition={SPRING}
								className="flex h-8 w-8 items-center justify-center rounded-full transition-shadow disabled:cursor-not-allowed"
								style={{
									background: canSend
										? "var(--primary)"
										: "color-mix(in srgb, var(--muted-foreground) 18%, transparent)",
									color: canSend ? "var(--primary-foreground)" : "var(--muted-foreground)",
									boxShadow: canSend
										? "0 6px 18px -6px color-mix(in srgb, var(--primary) 70%, transparent)"
										: "none",
								}}
								title="发送 (⏎)"
							>
								{creating ? (
									<span className="icon-[mdi--loading] h-4 w-4 animate-spin" />
								) : (
									<span className="icon-[mdi--arrow-up] h-4 w-4" />
								)}
							</motion.button>
						</div>
					</motion.div>

					{/* Scenes grid */}
					{scenes.length > 0 && (
						<motion.div
							initial={{ opacity: 0, y: 8 }}
							animate={{ opacity: mounted ? 1 : 0, y: mounted ? 0 : 8 }}
							transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.16 }}
							className="mt-8 w-full"
						>
							<div className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
								<span className="icon-[mdi--movie-open-outline] h-3.5 w-3.5" />
								场景 · 快速开始
							</div>
							<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
								{scenes.map((s, idx) => {
									const active = selectedSkill?.name === s.name && selectedSkill?.type === "scene";
									return (
										<motion.button
											key={s.name}
											type="button"
											onClick={() => handleSelectScene(s)}
											initial={{ opacity: 0, y: 8 }}
											animate={{ opacity: 1, y: 0 }}
											transition={{
												duration: 0.35,
												ease: [0.16, 1, 0.3, 1],
												delay: 0.22 + idx * 0.04,
											}}
											whileHover={{ y: -2 }}
											whileTap={{ scale: 0.98 }}
											className={`group flex items-start gap-3 rounded-2xl border p-3 text-left transition-colors ${
												active
													? "border-primary bg-primary/10"
													: "border-border bg-card hover:border-primary/40 hover:bg-primary/5"
											}`}
										>
											<div
												className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors ${
													active
														? "bg-primary text-primary-foreground"
														: "bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground"
												}`}
											>
												<span className="icon-[mdi--movie-open-outline] h-4 w-4" />
											</div>
											<div className="min-w-0 flex-1">
												<div className="truncate text-[13px] font-medium text-foreground">
													{s.alias || s.name}
												</div>
												{s.description && (
													<div className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground/70">
														{s.description}
													</div>
												)}
											</div>
											{active && (
												<span className="icon-[mdi--check-circle] h-4 w-4 shrink-0 text-primary" />
											)}
										</motion.button>
									);
								})}
							</div>
						</motion.div>
					)}
				</motion.div>
			</div>
		</div>
	);
}

import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { AnimatePresence, motion } from "motion/react";
import { useParams } from "@tanstack/react-router";
import type { SkillInfo } from "@preload/api";
import {
	activeSessionAtom,
	attachedImagesAtom,
	authUserAtom,
	contextUsageAtom,
	inputValueAtom,
	mentionedFilesAtom,
	pageHeaderTitleAtom,
	projectsAtom,
	selectedSkillAtom,
} from "@shared/store/atoms";
import { BotAvatar } from "@shared/components/BotAvatar";
import { pathBasename } from "@shared/lib/utils";
import { InputBar } from "./InputBar";
import { SessionDropZone } from "./SessionDropZone";
import { useSessionManager } from "../hooks/useSessionManager";

const SPRING = { type: "spring" as const, stiffness: 460, damping: 32 };
const SCENE_PAGE_SIZE = 3;
const easeOut = [0.16, 1, 0.3, 1] as const;

function scheduleIdle(callback: () => void, timeout: number): () => void {
	let cancelled = false;
	const run = () => {
		if (!cancelled) callback();
	};
	if ("requestIdleCallback" in window) {
		const id = window.requestIdleCallback(run, { timeout });
		return () => {
			cancelled = true;
			window.cancelIdleCallback(id);
		};
	}
	const id = globalThis.setTimeout(run, timeout);
	return () => {
		cancelled = true;
		globalThis.clearTimeout(id);
	};
}

export function NewSessionPage(): JSX.Element {
	const { cwd } = useParams({ strict: false }) as { cwd: string };
	const decodedCwd = decodeURIComponent(cwd);

	const [renderHero, setRenderHero] = useState(false);
	const [mounted, setMounted] = useState(false);
	const [avatarAutoplay, setAvatarAutoplay] = useState(false);
	const [selectedSkill, setSelectedSkill] = useAtom(selectedSkillAtom);
	const [skills, setSkills] = useState<SkillInfo[]>([]);
	const setInputValue = useSetAtom(inputValueAtom);
	const setAttachedImages = useSetAtom(attachedImagesAtom);
	const setMentionedFiles = useSetAtom(mentionedFilesAtom);
	const setHeaderTitle = useSetAtom(pageHeaderTitleAtom);
	const setContextUsage = useSetAtom(contextUsageAtom);
	const setActiveSession = useSetAtom(activeSessionAtom);
	const authUser = useAtomValue(authUserAtom);
	const projects = useAtomValue(projectsAtom);
	const { openSession, sendMessage, abortMessage } = useSessionManager();

	const project = projects.find((p) => p.cwd === decodedCwd);
	const displayName = project?.name ?? pathBasename(decodedCwd);

	// 进入页面时清空上下文输入态，避免从别处带过来未发的内容。
	useEffect(() => {
		setInputValue("");
		setSelectedSkill(null);
		setMentionedFiles([]);
		setAttachedImages([]);
		// 清掉上一个会话残留的上下文用量，避免 ContextRing 显示旧会话的百分比。
		setContextUsage(null);
		// 清掉 activeSession，避免 InputBar 的 todo 抽屉等仍读取旧会话状态。
		setActiveSession(null);
	}, [decodedCwd, setInputValue, setSelectedSkill, setMentionedFiles, setAttachedImages, setContextUsage, setActiveSession]);

	// 顶栏标题：项目名 · 新会话
	useEffect(() => {
		setHeaderTitle(`${displayName} · 新会话`);
		return () => setHeaderTitle(null);
	}, [displayName, setHeaderTitle]);

	useEffect(() => {
		setRenderHero(false);
		setMounted(false);
		setAvatarAutoplay(false);
		return scheduleIdle(() => {
			startTransition(() => setRenderHero(true));
		}, 160);
	}, [decodedCwd]);

	useEffect(() => {
		if (!renderHero) return;
		const mountTimer = window.setTimeout(() => {
			startTransition(() => setMounted(true));
		}, 30);
		const autoplayTimer = window.setTimeout(() => {
			startTransition(() => setAvatarAutoplay(true));
		}, 300);
		return () => {
			window.clearTimeout(mountTimer);
			window.clearTimeout(autoplayTimer);
		};
	}, [renderHero]);

	useEffect(() => {
		let cancelled = false;
		const cancelIdle = scheduleIdle(() => {
			void window.vetta.skills.list().then((nextSkills) => {
				if (cancelled) return;
				startTransition(() => setSkills(nextSkills));
			});
		}, 240);
		return () => {
			cancelled = true;
			cancelIdle();
		};
	}, []);

	const scenes = useMemo(() => skills.filter((s) => s.type === "scene"), [skills]);
	const skillBadges = useMemo(() => skills.filter((s) => s.type === "skill"), [skills]);

	const handleSelectScene = useCallback(
		(skill: SkillInfo) => {
			setSelectedSkill({ name: skill.name, alias: skill.alias, type: skill.type });
		},
		[setSelectedSkill],
	);

	const handleSelectSkill = useCallback(
		(skill: SkillInfo) => {
			const isSelected = selectedSkill?.name === skill.name && selectedSkill?.type === skill.type;
			setSelectedSkill(
				isSelected ? null : { name: skill.name, alias: skill.alias, type: skill.type },
			);
		},
		[selectedSkill, setSelectedSkill],
	);

	// 发送：先创建/打开会话（openSession 内部会 navigate('/')），再触发 sendMessage。
	// sendMessage 现在从 activeSessionRef 读取 session，因此 await 链可以串起来。
	const handleSend = useCallback(async () => {
		await openSession(decodedCwd);
		await sendMessage();
	}, [decodedCwd, openSession, sendMessage]);

	const greetingTitle = authUser?.nickname
		? `你好，${authUser.nickname}`
		: "今天怎么样？";

	return (
		<SessionDropZone
			cwdOverride={decodedCwd}
			className="relative flex h-full flex-1 flex-col overflow-hidden bg-background"
		>
			{/* Primary grid texture, faded toward edges */}
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0"
				style={{
					backgroundImage:
						"linear-gradient(to right, color-mix(in srgb, var(--primary) 7%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--primary) 7%, transparent) 1px, transparent 1px)",
					backgroundSize: "32px 32px",
					backgroundPosition: "center center",
					maskImage:
						"radial-gradient(ellipse 70% 60% at 50% 45%, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.6) 50%, transparent 100%)",
					WebkitMaskImage:
						"radial-gradient(ellipse 70% 60% at 50% 45%, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.6) 50%, transparent 100%)",
				}}
			/>

			{/* Ambient glow */}
			<div className="pointer-events-none absolute inset-0">
				<div
					className="absolute left-1/2 top-[30%] h-[440px] w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.1]"
					style={{
						background: "radial-gradient(circle, var(--primary) 0%, transparent 70%)",
					}}
				/>
			</div>

			{/* Scrollable upper area: hero + scenes + skill badges.
			    用 absolute 填满整个容器，使 hero 的居中点固定为视口中心，
			    InputBar 长高时不会再"顶起" hero。 */}
			<div className="no-drag absolute inset-0 flex flex-col items-center overflow-y-auto px-6 pb-48 pt-6">
				{renderHero && (
					<motion.div
						initial={{ opacity: 0, y: 12 }}
						animate={{ opacity: mounted ? 1 : 0, y: mounted ? 0 : 12 }}
						transition={{ duration: 0.5, ease: easeOut }}
						className="my-auto flex w-full max-w-3xl flex-col items-center"
					>
						<BotAvatar size="lg" autoplay={avatarAutoplay} />
						<motion.h1
							initial={{ opacity: 0, y: 8 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.5, delay: 0.1, ease: easeOut }}
							className="mt-4 bg-gradient-to-br from-foreground via-foreground to-foreground/70 bg-clip-text text-[24px] font-semibold tracking-[-0.02em] text-transparent"
						>
							{greetingTitle}
						</motion.h1>
						<motion.p
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							transition={{ duration: 0.5, delay: 0.2 }}
							className="mt-1 text-[12px] text-muted-foreground/70"
						>
							我可以帮助你处理工作，有什么我可以帮你的吗？
						</motion.p>

						{scenes.length > 0 && (
							<SceneCarousel
								scenes={scenes}
								selected={selectedSkill}
								onSelect={handleSelectScene}
							/>
						)}

						{skillBadges.length > 0 && (
							<motion.div
								initial={{ opacity: 0, y: 8 }}
								animate={{ opacity: mounted ? 1 : 0, y: mounted ? 0 : 8 }}
								transition={{ duration: 0.5, delay: 0.3, ease: easeOut }}
								className="mt-4 flex w-full flex-col items-center"
							>
								<div className="flex flex-wrap items-center justify-center gap-1.5">
									{skillBadges.map((s, idx) => {
										const active =
											selectedSkill?.name === s.name && selectedSkill?.type === "skill";
										return (
											<motion.button
												key={s.name}
												type="button"
												onClick={() => handleSelectSkill(s)}
												initial={{ opacity: 0, y: 6, scale: 0.95 }}
												animate={{ opacity: 1, y: 0, scale: 1 }}
												transition={{
													type: "spring",
													stiffness: 360,
													damping: 26,
													delay: 0.32 + idx * 0.03,
												}}
												whileHover={{ y: -2, scale: 1.04 }}
												whileTap={{ scale: 0.96 }}
												className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${
													active
														? "border-primary/50 bg-primary/15 text-primary"
														: "border-border/60 bg-card/40 text-muted-foreground hover:border-primary/30 hover:bg-primary/8 hover:text-primary"
												}`}
												title={s.description || s.name}
											>
												<span className="icon-[mdi--puzzle-outline] h-3 w-3" />
												{s.alias || s.name}
											</motion.button>
										);
									})}
								</div>
							</motion.div>
						)}
					</motion.div>
				)}
			</div>

			{/* Global InputBar — 与 ChatView 共用同一个组件。
			    绝对定位浮在底部，避免长高时把上方 hero 顶起。 */}
			<div className="absolute inset-x-0 bottom-0 z-10">
				<InputBar
					onSend={handleSend}
					onAbort={abortMessage}
					cwdOverride={decodedCwd}
				/>
			</div>
		</SessionDropZone>
	);
}

interface SceneCarouselProps {
	scenes: SkillInfo[];
	selected: { name: string; type: "skill" | "scene" } | null;
	onSelect: (s: SkillInfo) => void;
}

function SceneCarousel({ scenes, selected, onSelect }: SceneCarouselProps): JSX.Element {
	const [page, setPage] = useState(0);
	const totalPages = Math.max(1, Math.ceil(scenes.length / SCENE_PAGE_SIZE));
	const safePage = Math.min(page, totalPages - 1);
	const visible = scenes.slice(
		safePage * SCENE_PAGE_SIZE,
		safePage * SCENE_PAGE_SIZE + SCENE_PAGE_SIZE,
	);
	const canPrev = safePage > 0;
	const canNext = safePage < totalPages - 1;

	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.5, delay: 0.25, ease: easeOut }}
			className="group relative mt-6 w-full"
		>
			{totalPages > 1 && (
				<div className="mb-3 flex items-center justify-end gap-1">
					{Array.from({ length: totalPages }).map((_, i) => (
						<button
							key={i}
							type="button"
							onClick={() => setPage(i)}
							className={`h-1 rounded-full transition-all ${
								i === safePage ? "w-4 bg-primary" : "w-1 bg-muted-foreground/30 hover:bg-muted-foreground/60"
							}`}
							aria-label={`第 ${i + 1} 页`}
						/>
					))}
				</div>
			)}

			<div className="relative">
				<AnimatePresence mode="wait" initial={false}>
					<motion.div
						key={safePage}
						initial={{ opacity: 0, x: 16 }}
						animate={{ opacity: 1, x: 0 }}
						exit={{ opacity: 0, x: -16 }}
						transition={{ duration: 0.25, ease: easeOut }}
						className="flex flex-wrap justify-center gap-3"
					>
						{visible.map((s) => {
							const active = selected?.name === s.name && selected?.type === "scene";
							return (
								<motion.button
									key={s.name}
									type="button"
									onClick={() => onSelect(s)}
									whileHover={{ y: -3 }}
									whileTap={{ scale: 0.98 }}
									transition={SPRING}
									className={`relative flex w-full flex-col items-start gap-2 overflow-hidden rounded-2xl border p-4 text-left transition-colors sm:w-[calc(50%-6px)] lg:w-[calc(33.333%-8px)] ${
										active
											? "border-primary/60 bg-card shadow-[0_12px_30px_-18px_var(--primary)]"
											: "border-border/60 bg-card hover:border-primary/40"
									}`}
								>
									<div
										className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
											active
												? "bg-primary text-primary-foreground"
												: "bg-primary/10 text-primary"
										}`}
									>
										<span className="icon-[mdi--movie-open-outline] h-4 w-4" />
									</div>
									<div className="min-w-0 w-full">
										<div className="truncate text-[13px] font-semibold text-foreground">
											{s.alias || s.name}
										</div>
										{s.description && (
											<div className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground/70">
												{s.description}
											</div>
										)}
									</div>
									{active && (
										<span className="icon-[mdi--check-circle] absolute right-3 top-3 h-4 w-4 text-primary" />
									)}
								</motion.button>
							);
						})}
					</motion.div>
				</AnimatePresence>

				{canPrev && (
					<motion.button
						type="button"
						onClick={() => setPage((p) => Math.max(0, p - 1))}
						initial={{ opacity: 0, x: 4 }}
						whileHover={{ scale: 1.08 }}
						whileTap={{ scale: 0.92 }}
						className="absolute -left-3 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100 hover:border-primary/40 hover:text-primary"
						title="上一页"
					>
						<span className="icon-[mdi--chevron-left] h-4 w-4" />
					</motion.button>
				)}
				{canNext && (
					<motion.button
						type="button"
						onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
						initial={{ opacity: 0, x: -4 }}
						whileHover={{ scale: 1.08 }}
						whileTap={{ scale: 0.92 }}
						className="absolute -right-3 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100 hover:border-primary/40 hover:text-primary"
						title="下一页"
					>
						<span className="icon-[mdi--chevron-right] h-4 w-4" />
					</motion.button>
				)}
			</div>
		</motion.div>
	);
}

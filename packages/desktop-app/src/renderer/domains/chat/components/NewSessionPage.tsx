import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { AnimatePresence, motion } from "motion/react";
import { useParams } from "@tanstack/react-router";
import type { InstalledSkill, SkillInfo } from "@preload/api";
import {
	activeSessionAtom,
	attachedImagesAtom,
	authTokenAtom,
	activeInputActionIdsAtom,
	authUserAtom,
	contextUsageAtom,
	editImageAttachmentAtom,
	inputValueAtom,
	mentionedFilesAtom,
	pageHeaderTitleAtom,
	pendingEditImageIdAtom,
	projectsAtom,
	selectedSkillAtom,
	sessionExecutionModeAtom,
} from "@shared/store/atoms";
import type { MarketSkillInfo } from "@shared/lib/api";
import { downloadSkill, fetchMarketSkills } from "@shared/lib/api";
import { BotAvatar } from "@shared/components/BotAvatar";
import { pathBasename } from "@shared/lib/utils";
import { InputBar } from "./InputBar";
import { SessionDropZone } from "./SessionDropZone";
import { useSessionManager } from "../hooks/useSessionManager";

const SPRING = { type: "spring" as const, stiffness: 460, damping: 32 };
const SCENE_PAGE_SIZE = 6;
const easeOut = [0.16, 1, 0.3, 1] as const;

// 场景三态：active=已安装并启用（可直接 attach）；disabled=已安装但被禁用（点击仅启用）；
// uninstalled=未安装（点击下载安装）。
type SceneState = "active" | "disabled" | "uninstalled";
type SceneActionState = "idle" | "loading" | "error";

interface SceneItem {
	name: string;
	alias?: string;
	description: string;
	state: SceneState;
	version?: string;
	downloadCount?: number;
}

const SCENE_STATE_RANK: Record<SceneState, number> = { active: 0, disabled: 1, uninstalled: 2 };

// 引导词分组：一组对应一个启用且声明了非空 guidingWords 的插件，组标题取插件 name。
interface GuidingGroup {
	id: string;
	name: string;
	words: string[];
}
// 展示限额（非数据截断）：同时最多 2 组、每组最多 3 词；超出则轮播。
const GUIDING_GROUP_PAGE = 2;
const GUIDING_WORD_PAGE = 3;
const GUIDING_GROUP_INTERVAL = 24000;
const GUIDING_WORD_INTERVAL = 6000;
// 引导词轮播缓动：柔和线性收尾，避免生硬切换。
const guidingEase = [0.22, 1, 0.36, 1] as const;

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
	const [marketScenes, setMarketScenes] = useState<MarketSkillInfo[]>([]);
	const [manifest, setManifest] = useState<Record<string, InstalledSkill>>({});
	const [guidingGroups, setGuidingGroups] = useState<GuidingGroup[]>([]);
	const [sceneActions, setSceneActions] = useState<Record<string, SceneActionState>>({});
	// 记录最近一次安装/启用的 Promise，发送时 await 它，保证落盘先于 session.create。
	const installRef = useRef<Promise<void> | null>(null);
	const setInputValue = useSetAtom(inputValueAtom);
	const setAttachedImages = useSetAtom(attachedImagesAtom);
	const setMentionedFiles = useSetAtom(mentionedFilesAtom);
	const setHeaderTitle = useSetAtom(pageHeaderTitleAtom);
	const setContextUsage = useSetAtom(contextUsageAtom);
	const setActiveSession = useSetAtom(activeSessionAtom);
	const setEditImageAttachment = useSetAtom(editImageAttachmentAtom);
	const setPendingEditImageId = useSetAtom(pendingEditImageIdAtom);
	const setActiveInputActionIds = useSetAtom(activeInputActionIdsAtom);
	const authUser = useAtomValue(authUserAtom);
	const token = useAtomValue(authTokenAtom);
	const projects = useAtomValue(projectsAtom);
	const executionMode = useAtomValue(sessionExecutionModeAtom);
	const { openSession, sendMessage, abortMessage } = useSessionManager();

	const project = projects.find((p) => p.cwd === decodedCwd);
	const displayName = project?.name ?? pathBasename(decodedCwd);

	// 进入页面时清空上下文输入态，避免从别处带过来未发的内容。
	useEffect(() => {
		setInputValue("");
		setSelectedSkill(null);
		setMentionedFiles([]);
		setAttachedImages([]);
		// 释放一次性的图像编辑 attach，避免别处选中的编辑目标带进新会话。
		setEditImageAttachment(null);
		setPendingEditImageId(null);
		// 清空所有 active 的 input-action（如「图像生成」），回到默认输入态。
		setActiveInputActionIds(new Set());
		// 清掉上一个会话残留的上下文用量，避免 ContextRing 显示旧会话的百分比。
		setContextUsage(null);
		// 清掉 activeSession，避免 InputBar 的 todo 抽屉等仍读取旧会话状态。
		setActiveSession(null);
	}, [
		decodedCwd,
		setInputValue,
		setSelectedSkill,
		setMentionedFiles,
		setAttachedImages,
		setEditImageAttachment,
		setPendingEditImageId,
		setActiveInputActionIds,
		setContextUsage,
		setActiveSession,
	]);

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

	// 拉取本地已启用技能/场景 + 市场场景目录 + 安装清单。
	// 市场拉取失败 / 未登录 / 离线时静默降级为仅本地，绝不阻断首屏。
	const loadResources = useCallback(async () => {
		const localList = await window.vetta.skills.list(decodedCwd);
		setSkills(localList);
		// 引导词来自插件（plugin.json），与 skills/scenes 是两套数据源，且不依赖登录态。
		try {
			const plugins = await window.vetta.plugins.list();
			setGuidingGroups(
				plugins
					.filter((p) => p.enabled && (p.guidingWords?.length ?? 0) > 0)
					.map((p) => ({ id: p.id, name: p.name, words: p.guidingWords ?? [] })),
			);
		} catch {
			setGuidingGroups([]);
		}
		if (!token) {
			setMarketScenes([]);
			setManifest({});
			return;
		}
		try {
			const [market, mani] = await Promise.all([
				fetchMarketSkills(token),
				window.vetta.skills.getMarketManifest(),
			]);
			setMarketScenes(market.filter((s) => s.type === "scene"));
			setManifest(mani);
		} catch {
			setMarketScenes([]);
			setManifest({});
		}
	}, [token, decodedCwd]);

	useEffect(() => {
		return scheduleIdle(() => {
			startTransition(() => {
				void loadResources();
			});
		}, 240);
	}, [loadResources]);

	const scenes = useMemo<SceneItem[]>(() => {
		const map = new Map<string, SceneItem>();
		// 本地 skills.list() 返回的 scene 必然是「已安装且启用」，直接 active。
		// 同时覆盖非市场的 custom/user 场景，让它们照常展示为可用。
		for (const s of skills) {
			if (s.type !== "scene") continue;
			map.set(s.name, { name: s.name, alias: s.alias, description: s.description, state: "active" });
		}
		for (const ms of marketScenes) {
			if (map.has(ms.name)) continue;
			const local = manifest[ms.name];
			const state: SceneState = local ? (local.enabled ? "active" : "disabled") : "uninstalled";
			map.set(ms.name, {
				name: ms.name,
				alias: ms.alias,
				description: ms.description,
				state,
				version: ms.version,
				downloadCount: ms.download_count,
			});
		}
		// 已装优先排序；sort 稳定，同态内保持插入序。
		return Array.from(map.values()).sort(
			(a, b) => SCENE_STATE_RANK[a.state] - SCENE_STATE_RANK[b.state],
		);
	}, [skills, marketScenes, manifest]);

	const skillBadges = useMemo(() => skills.filter((s) => s.type === "skill"), [skills]);

	const setSceneAction = useCallback((name: string, state: SceneActionState) => {
		setSceneActions((prev) => ({ ...prev, [name]: state }));
	}, []);

	// active → 直接 attach；disabled → toggle 启用后 attach；uninstalled → 下载安装后 attach。
	// 安装/启用全程同步：成功落盘 + 刷新本地列表后才 setSelectedSkill。
	const handleSceneClick = useCallback(
		(item: SceneItem) => {
			if (item.state === "active") {
				setSelectedSkill({ name: item.name, alias: item.alias, type: "scene" });
				return;
			}
			if (sceneActions[item.name] === "loading") return;
			const run = (async () => {
				setSceneAction(item.name, "loading");
				try {
					if (item.state === "uninstalled") {
						if (!token) throw new Error("未登录，无法安装场景");
						const buffer = await downloadSkill(token, item.name);
						await window.vetta.skills.installFromMarket(item.name, buffer, "scene", {
							alias: item.alias,
							marketDescription: item.description,
							version: item.version,
						});
					} else {
						// disabled：已落盘，仅切换启用，无需重新下载。
						await window.vetta.skills.toggle(item.name);
					}
					await loadResources();
					setSelectedSkill({ name: item.name, alias: item.alias, type: "scene" });
					setSceneAction(item.name, "idle");
				} catch (err) {
					console.error("场景安装失败:", err);
					setSceneAction(item.name, "error");
					window.setTimeout(() => setSceneAction(item.name, "idle"), 2200);
				}
			})();
			installRef.current = run;
		},
		[sceneActions, token, loadResources, setSceneAction, setSelectedSkill],
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
		// 若有正在进行的场景安装，先 await 其落盘，保证 scene 文件先于 session.create 写入，
		// 否则新 session 扫盘时读不到刚点的场景。
		if (installRef.current) {
			try {
				await installRef.current;
			} catch {
				// 安装失败已在点击处处理，这里照常发送（不带场景）。
			}
		}
		// 欢迎页选中的执行模式（沙盒受限/完全访问）必须随会话创建一起传给后端，
		// 否则 session.create 会落到默认 full-access，再被 getState 回填覆盖。
		await openSession(decodedCwd, undefined, executionMode);
		await sendMessage();
	}, [decodedCwd, executionMode, openSession, sendMessage]);

	// 点击引导词 = 以该文本为 overrideText 立即发起一轮：openSession → sendMessage(word)。
	// 用 override 传值而非先 setInputValue，避开 atom 异步更新导致 sendMessage 读到旧值。
	const handleGuidingWord = useCallback(
		async (word: string) => {
			if (installRef.current) {
				try {
					await installRef.current;
				} catch {
					// 安装失败已在点击处处理，照常发送。
				}
			}
			await openSession(decodedCwd, undefined, executionMode);
			await sendMessage(word);
		},
		[decodedCwd, executionMode, openSession, sendMessage],
	);

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
						className="my-auto flex w-full max-w-4xl flex-col items-center"
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
								actions={sceneActions}
								onSceneClick={handleSceneClick}
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

						{guidingGroups.length > 0 && (
							<GuidingWords groups={guidingGroups} mounted={mounted} onPick={handleGuidingWord} />
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
	scenes: SceneItem[];
	selected: { name: string; type: "skill" | "scene" } | null;
	actions: Record<string, SceneActionState>;
	onSceneClick: (s: SceneItem) => void;
}

function SceneCarousel({ scenes, selected, actions, onSceneClick }: SceneCarouselProps): JSX.Element {
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
						className="grid grid-cols-2 gap-2 sm:grid-cols-3"
					>
						{visible.map((s) => {
							const action = actions[s.name] ?? "idle";
							const isMuted = s.state !== "active";
							const selectedActive =
								s.state === "active" && selected?.name === s.name && selected?.type === "scene";
							return (
								<motion.button
									key={s.name}
									type="button"
									disabled={action === "loading"}
									onClick={() => onSceneClick(s)}
									whileHover={{ y: -2 }}
									whileTap={{ scale: 0.98 }}
									transition={SPRING}
									title={s.state === "uninstalled" ? "点击安装并使用" : s.description || s.name}
									className={`relative flex items-start gap-2 overflow-hidden rounded-xl border p-2.5 text-left transition-colors disabled:cursor-wait ${
										selectedActive
											? "border-primary/60 bg-card shadow-[0_10px_24px_-18px_var(--primary)]"
											: isMuted
												? "border-dashed border-border/50 bg-card/60 hover:border-primary/40"
												: "border-border/60 bg-card hover:border-primary/40"
									}`}
								>
									<div
										className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${
											selectedActive
												? "bg-primary text-primary-foreground"
												: isMuted
													? "bg-accent/50 text-muted-foreground/70"
													: "bg-primary/10 text-primary"
										}`}
									>
										<span className="icon-[mdi--movie-open-outline] h-3.5 w-3.5" />
									</div>
									<div className="min-w-0 flex-1">
										<div
											className={`truncate text-[12px] font-semibold ${
												isMuted ? "text-muted-foreground" : "text-foreground"
											}`}
										>
											{s.alias || s.name}
										</div>
										{s.description && (
											<div className="mt-0.5 line-clamp-1 text-[10px] leading-relaxed text-muted-foreground/70">
												{s.description}
											</div>
										)}
										{(s.version || (s.downloadCount ?? 0) > 0) && (
											<div className="mt-1 flex items-center gap-1.5 text-[10px] tabular-nums text-muted-foreground/60">
												{s.version && (
													<span className="inline-flex h-4 items-center rounded-full bg-accent/50 px-1.5 font-medium">
														v{s.version}
													</span>
												)}
												{(s.downloadCount ?? 0) > 0 && (
													<span className="inline-flex h-4 items-center gap-0.5 rounded-full bg-accent/50 px-1.5 font-medium">
														<span className="icon-[mdi--download] h-2.5 w-2.5" />
														{s.downloadCount}
													</span>
												)}
											</div>
										)}
									</div>
									{action === "loading" ? (
										<span className="icon-[mdi--loading] absolute right-2 top-2 h-3.5 w-3.5 animate-spin text-primary" />
									) : action === "error" ? (
										<span className="icon-[mdi--alert-circle] absolute right-2 top-2 h-3.5 w-3.5 text-destructive" />
									) : isMuted ? (
										<span className="icon-[mdi--download] absolute right-2 top-2 h-3.5 w-3.5 text-muted-foreground/60" />
									) : selectedActive ? (
										<span className="icon-[mdi--check-circle] absolute right-2 top-2 h-3.5 w-3.5 text-primary" />
									) : null}
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

interface GuidingWordsProps {
	groups: GuidingGroup[];
	mounted: boolean;
	onPick: (word: string) => void;
}

// 引导词分组区：按插件分组，组标题=插件 name。展示限额靠轮播实现（非数据截断）：
// 组数 >2 时组级 24s 轮播切批；某组词数 >3 时该组词级 6s 轮播切页；未超出则静态。
// 每组恒显示 min(词数, 3) 行（超出轮播、绝不撑高列）；单个词过长则换行完整展示，不省略。
function GuidingWords({ groups, mounted, onPick }: GuidingWordsProps): JSX.Element {
	const [groupTick, setGroupTick] = useState(0);
	const [wordTick, setWordTick] = useState(0);
	const needGroupRotate = groups.length > GUIDING_GROUP_PAGE;
	const needWordRotate = groups.some((g) => g.words.length > GUIDING_WORD_PAGE);

	useEffect(() => {
		if (!needGroupRotate) return;
		const id = window.setInterval(() => setGroupTick((t) => t + 1), GUIDING_GROUP_INTERVAL);
		return () => window.clearInterval(id);
	}, [needGroupRotate]);

	useEffect(() => {
		if (!needWordRotate) return;
		const id = window.setInterval(() => setWordTick((t) => t + 1), GUIDING_WORD_INTERVAL);
		return () => window.clearInterval(id);
	}, [needWordRotate]);

	const groupPages = Math.max(1, Math.ceil(groups.length / GUIDING_GROUP_PAGE));
	const gp = groupTick % groupPages;
	const visibleGroups = groups.slice(gp * GUIDING_GROUP_PAGE, gp * GUIDING_GROUP_PAGE + GUIDING_GROUP_PAGE);

	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: mounted ? 1 : 0, y: mounted ? 0 : 8 }}
			transition={{ duration: 0.5, delay: 0.35, ease: easeOut }}
			className="mt-5 grid w-full grid-cols-[repeat(2,minmax(0,320px))] items-start justify-center gap-x-10 gap-y-5"
		>
			{visibleGroups.map((group) => {
				const wordPages = Math.max(1, Math.ceil(group.words.length / GUIDING_WORD_PAGE));
				const wp = wordTick % wordPages;
				// 滑动窗口分页：每屏恒为 slotCount 条（满屏），末屏起点对齐到末尾，
				// 不足整屏时从上一屏借词补全（如 5 词 max 4：第二屏 [1..4] 借 3 个，而非只剩 [4]）。
				const slotCount = Math.min(group.words.length, GUIDING_WORD_PAGE);
				const start = Math.min(wp * GUIDING_WORD_PAGE, group.words.length - slotCount);
				const pageWords = group.words.slice(start, start + slotCount);
				const padRows = slotCount - pageWords.length;
				return (
					<div key={group.id} className="flex w-full min-w-0 flex-col gap-1.5">
						<div className="truncate px-0.5 text-[14px] font-semibold text-foreground/80" title={group.name}>
							{group.name}
						</div>
						{/* 不用 AnimatePresence mode="wait"：那会先卸载旧页留一帧空容器导致塌高。
						    slotCount 恒定 + key 切换让 React 同一次提交内替换，无空帧。
						    pl-2.5 让整条树状引导线相对顶部 name 缩进；切页时子项逐行级联淡入，灵动丝滑。 */}
						<motion.div
							key={wp}
							initial="initial"
							animate="animate"
							variants={{ animate: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } } }}
							className="flex flex-col pl-2.5"
						>
							{pageWords.map((word, idx) => {
								// 树状引导线：竖脊 + 每行横向支线；最后一行竖脊收口为圆角拐弯（elbow）。
								const isLast = idx === pageWords.length - 1;
								return (
									<motion.button
										key={`${wp}-${idx}-${word}`}
										type="button"
										onClick={() => onPick(word)}
										variants={{
											initial: { opacity: 0, x: -6 },
											animate: { opacity: 1, x: 0 },
										}}
										transition={{ duration: 0.55, ease: guidingEase }}
										whileTap={{ scale: 0.98 }}
										title={word}
										className={`relative flex min-h-8 items-start py-1.5 pl-[18px] text-left text-[14px] leading-relaxed text-muted-foreground transition-colors hover:text-primary before:absolute before:left-0 before:border-l before:border-muted-foreground/30 before:content-[''] ${
											isLast
												? "before:top-0 before:h-4 before:w-[12px] before:rounded-bl-[7px] before:border-b"
												: "before:inset-y-0 before:w-0 after:absolute after:left-0 after:top-4 after:w-[12px] after:border-t after:border-muted-foreground/30 after:content-['']"
										}`}
									>
										<span className="break-words">{word}</span>
									</motion.button>
								);
							})}
							{Array.from({ length: padRows }, (_, i) => (
								<div key={`${wp}-ph-${i}`} aria-hidden className="h-8" />
							))}
						</motion.div>
					</div>
				);
			})}
		</motion.div>
	);
}

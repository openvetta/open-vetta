import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { motion } from "motion/react";
import { useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { InstalledSkill, SkillInfo } from "@preload/api";
import type { PluginLocales } from "@vetta/plugin-sdk";
import { usePluginI18n } from "../../plugins/runtime/plugin-i18n";
import {
	activeSessionAtom,
	activeToolNamesAtom,
	attachedImagesAtom,
	authTokenAtom,
	activeInputActionIdsAtom,
	authUserAtom,
	contextUsageAtom,
	currentScenarioAtom,
	editImageAttachmentAtom,
	inputValueAtom,
	lastActiveSessionAtom,
	mentionedFilesAtom,
	pageHeaderTitleHiddenAtom,
	pendingEditImageIdAtom,
	selectedSkillAtom,
	sessionExecutionModeAtom,
} from "@shared/store/atoms";
import type { MarketSkillInfo } from "@shared/lib/api";
import { downloadSkill, fetchMarketSkills } from "@shared/lib/api";
import { BotAvatar } from "@shared/components/BotAvatar";
import { GuideBadgeSwiper } from "./GuideBadgeSwiper";
import { InputBar } from "./InputBar";
import { SessionDropZone } from "./SessionDropZone";
import { useSessionManager } from "../hooks/useSessionManager";

const SPRING = { type: "spring" as const, stiffness: 460, damping: 32 };
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
	defaultLocale: string;
	locales: PluginLocales;
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

// 矮窗口阈值：低于此高度时隐藏底部引导词区，并把整体下移（减小底部留白）。
const SHORT_VIEWPORT = 720;

function useShortViewport(threshold = SHORT_VIEWPORT): boolean {
	const [short, setShort] = useState(() => window.innerHeight < threshold);
	useEffect(() => {
		const onResize = (): void => setShort(window.innerHeight < threshold);
		onResize();
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, [threshold]);
	return short;
}

export function NewSessionPage(): JSX.Element {
	const { t } = useTranslation("chat");
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
	const setHeaderTitleHidden = useSetAtom(pageHeaderTitleHiddenAtom);
	const setContextUsage = useSetAtom(contextUsageAtom);
	const setActiveSession = useSetAtom(activeSessionAtom);
	const setLastActiveSession = useSetAtom(lastActiveSessionAtom);
	const setEditImageAttachment = useSetAtom(editImageAttachmentAtom);
	const setPendingEditImageId = useSetAtom(pendingEditImageIdAtom);
	const setActiveInputActionIds = useSetAtom(activeInputActionIdsAtom);
	const setCurrentScenario = useSetAtom(currentScenarioAtom);
	const setActiveToolNames = useSetAtom(activeToolNamesAtom);
	const authUser = useAtomValue(authUserAtom);
	const token = useAtomValue(authTokenAtom);
	const executionMode = useAtomValue(sessionExecutionModeAtom);
	const { openSession, sendMessage, abortMessage } = useSessionManager();
	const isShort = useShortViewport();

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
		// 重置输入栏 action 的两道可见性闸门，避免继承上个会话（如批量任务）的隐藏态：
		// 1) 对话场景置为新建普通对话的默认 "conversation"（与 session.create 落库一致），
		//    否则残留 "batch" 会让 fail-closed 过滤把默认 action 全部隐藏。
		// 2) 激活工具集置 null（未知 → 按 scope 默认显示），否则残留批量会话的工具集
		//    不含 generate_image，会让 requiresActiveTool 闸门继续隐藏「图像生成」。
		setCurrentScenario("conversation");
		setActiveToolNames(null);
		// 清掉上一个会话残留的上下文用量，避免 ContextRing 显示旧会话的百分比。
		setContextUsage(null);
		// 清掉 activeSession，避免 InputBar 的 todo 抽屉等仍读取旧会话状态。
		setActiveSession(null);
		// 用户主动进入新会话页后，不应在后续刷新/回到根路由时恢复旧会话。
		setLastActiveSession(null);
	}, [
		decodedCwd,
		setInputValue,
		setSelectedSkill,
		setMentionedFiles,
		setAttachedImages,
		setEditImageAttachment,
		setPendingEditImageId,
		setActiveInputActionIds,
		setCurrentScenario,
		setActiveToolNames,
		setContextUsage,
		setActiveSession,
		setLastActiveSession,
	]);

	// 本页隐藏顶栏标题（左上角 label）。
	useEffect(() => {
		setHeaderTitleHidden(true);
		return () => setHeaderTitleHidden(false);
	}, [setHeaderTitleHidden]);

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
					.map((p) => ({
						id: p.id,
						name: p.name,
						words: p.guidingWords ?? [],
						defaultLocale: p.defaultLocale,
						locales: p.locales,
					})),
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
		? t("newSession.greetingTitle", { nickname: authUser.nickname })
		: t("newSession.greetingDefault");

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

			{/* 整页垂直居中：单一滚动容器内 min-h-full + justify-center，内容始终居中
			    （hero → 技能胶囊 → 输入框 → 引导词），无论窗口多大都在中间。
			    InputBar 变高时整列变高、保持居中；内容超出视口则可滚动。整列与输入框同宽（max-w-2xl）。 */}
			<div className="no-drag relative z-[1] flex flex-1 flex-col overflow-y-auto">
				<div className="flex min-h-full w-full flex-col items-center justify-center px-6 py-6">
					{renderHero && (
						<motion.div
							initial={{ opacity: 0, y: 12 }}
							animate={{ opacity: mounted ? 1 : 0, y: mounted ? 0 : 12 }}
							transition={{ duration: 0.5, ease: easeOut }}
							className="mb-3 flex w-full max-w-2xl flex-col items-start"
						>
							{/* 欢迎语上方的引导 badge 轮播 */}
							<GuideBadgeSwiper mounted={mounted} />

							{/* 标题/副标题在左、BotAvatar 在最右，同一行左右对齐 */}
							<div className="flex w-full items-center justify-between gap-4">
								<div className="flex min-w-0 flex-col">
									<motion.h1
										initial={{ opacity: 0, y: 8 }}
										animate={{ opacity: 1, y: 0 }}
										transition={{ duration: 0.5, delay: 0.1, ease: easeOut }}
										className="bg-gradient-to-br from-primary via-primary to-primary/30 bg-clip-text text-[24px] font-semibold tracking-[-0.02em] text-transparent"
									>
										{greetingTitle}
									</motion.h1>
									<motion.p
										initial={{ opacity: 0 }}
										animate={{ opacity: 1 }}
										transition={{ duration: 0.5, delay: 0.2 }}
										className="mt-1 text-[12px] text-muted-foreground/70"
									>
										{t("newSession.subtitle")}
									</motion.p>
								</div>
								<BotAvatar size="lg" autoplay={avatarAutoplay} />
							</div>

							{scenes.length > 0 && (
								<SceneCarousel
									scenes={scenes}
									selected={selectedSkill}
									actions={sceneActions}
									onSceneClick={handleSceneClick}
								/>
							)}
						</motion.div>
					)}

					{skillBadges.length > 0 && (
						<div className="mx-auto w-full max-w-2xl px-2 sm:px-4">
							<SkillBadgeRow
								skills={skillBadges}
								selected={selectedSkill}
								onSelect={handleSelectSkill}
							/>
						</div>
					)}

					<div className="w-full">
						<InputBar
							onSend={handleSend}
							onAbort={abortMessage}
							cwdOverride={decodedCwd}
						/>
					</div>

					{!isShort && guidingGroups.length > 0 && (
						<div className="mx-auto w-full max-w-2xl px-2 sm:px-4">
							<GuidingWords groups={guidingGroups} mounted={mounted} onPick={handleGuidingWord} />
						</div>
					)}
				</div>
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

// 场景卡片：横向滚动单行，每屏 3 张（宽度 = (100%-2*gap)/3），超出靠滚动 + 悬浮箭头手动翻动。
// 宽度跟随外层左对齐列（max-w-2xl），不再单独居中。
function SceneCarousel({ scenes, selected, actions, onSceneClick }: SceneCarouselProps): JSX.Element {
	const { t } = useTranslation("chat");
	const scrollRef = useRef<HTMLDivElement>(null);
	const [canPrev, setCanPrev] = useState(false);
	const [canNext, setCanNext] = useState(false);

	const updateEdges = useCallback(() => {
		const el = scrollRef.current;
		if (!el) return;
		setCanPrev(el.scrollLeft > 1);
		setCanNext(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
	}, []);

	useEffect(() => {
		updateEdges();
		const el = scrollRef.current;
		if (!el) return;
		const ro = new ResizeObserver(updateEdges);
		ro.observe(el);
		return () => ro.disconnect();
	}, [updateEdges, scenes.length]);

	// 翻动一屏（3 张卡 + 间隙），与可视宽度对齐。
	const scrollByView = useCallback((dir: -1 | 1) => {
		const el = scrollRef.current;
		if (!el) return;
		el.scrollBy({ left: dir * el.clientWidth, behavior: "smooth" });
	}, []);

	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.5, delay: 0.25, ease: easeOut }}
			className="group relative mt-6 w-full"
		>
			<div
				ref={scrollRef}
				onScroll={updateEdges}
				className="no-scrollbar flex snap-x snap-mandatory gap-2 overflow-x-auto py-1"
			>
				{scenes.map((s) => {
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
							title={s.state === "uninstalled" ? t("newSession.sceneInstallPrompt") : s.description || s.name}
							className={`relative flex w-[calc((100%-1rem)/3)] shrink-0 snap-start items-start gap-2.5 overflow-hidden rounded-xl border p-3 text-left transition-colors disabled:cursor-wait ${
								selectedActive
									? "border-primary/60 bg-card shadow-[0_10px_24px_-18px_var(--primary)]"
									: isMuted
										? "border-dashed border-border/50 bg-card/60 hover:border-primary/40"
										: "border-border/60 bg-card hover:border-primary/40"
							}`}
						>
							<div className="min-w-0 flex-1">
								<div
									className={`truncate text-[13px] font-semibold ${
										isMuted ? "text-muted-foreground" : "text-foreground"
									}`}
								>
									{s.alias || s.name}
								</div>
								{s.description && (
									<div className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground/70">
										{s.description}
									</div>
								)}
								{(s.version || (s.downloadCount ?? 0) > 0) && (
									<div className="mt-1.5 flex items-center gap-1.5 text-[10px] tabular-nums text-muted-foreground/60">
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
								<span className="icon-[mdi--loading] h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
							) : action === "error" ? (
								<span className="icon-[mdi--alert-circle] h-3.5 w-3.5 shrink-0 text-destructive" />
							) : isMuted ? (
								<span className="icon-[mdi--download] h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
							) : selectedActive ? (
								<span className="icon-[mdi--check-circle] h-3.5 w-3.5 shrink-0 text-primary" />
							) : null}
						</motion.button>
					);
				})}
			</div>

			{canPrev && (
				<>
					<div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-background to-transparent" />
					<motion.button
						type="button"
						onClick={() => scrollByView(-1)}
						whileHover={{ scale: 1.08 }}
						whileTap={{ scale: 0.92 }}
						className="absolute -left-3 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100 hover:border-primary/40 hover:text-primary"
						title={t("newSession.sceneCarouselPrev")}
					>
						<span className="icon-[mdi--chevron-left] h-4 w-4" />
					</motion.button>
				</>
			)}
			{canNext && (
				<>
					<div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent" />
					<motion.button
						type="button"
						onClick={() => scrollByView(1)}
						whileHover={{ scale: 1.08 }}
						whileTap={{ scale: 0.92 }}
						className="absolute -right-3 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100 hover:border-primary/40 hover:text-primary"
						title={t("newSession.sceneCarouselNext")}
					>
						<span className="icon-[mdi--chevron-right] h-4 w-4" />
					</motion.button>
				</>
			)}
		</motion.div>
	);
}

interface SkillBadgeRowProps {
	skills: SkillInfo[];
	selected: { name: string; type: "skill" | "scene" } | null;
	onSelect: (s: SkillInfo) => void;
}

// 技能胶囊单行展示：横向滚动，超出时两端浮出箭头手动翻动（每次滚动约 80% 视宽）。
// 不加入场动画：该行固定在输入框上方，逐个弹入会干扰输入体验。
function SkillBadgeRow({ skills, selected, onSelect }: SkillBadgeRowProps): JSX.Element {
	const { t } = useTranslation("chat");
	const scrollRef = useRef<HTMLDivElement>(null);
	const [canPrev, setCanPrev] = useState(false);
	const [canNext, setCanNext] = useState(false);

	const updateEdges = useCallback(() => {
		const el = scrollRef.current;
		if (!el) return;
		setCanPrev(el.scrollLeft > 1);
		setCanNext(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
	}, []);

	useEffect(() => {
		updateEdges();
		const el = scrollRef.current;
		if (!el) return;
		const ro = new ResizeObserver(updateEdges);
		ro.observe(el);
		return () => ro.disconnect();
	}, [updateEdges, skills.length]);

	const scrollBy = useCallback((dir: -1 | 1) => {
		const el = scrollRef.current;
		if (!el) return;
		el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
	}, []);

	return (
		<div className="group relative mt-4 w-full">
			<div
				ref={scrollRef}
				onScroll={updateEdges}
				className="no-scrollbar flex items-center gap-1.5 overflow-x-auto px-1 py-1"
			>
				{skills.map((s) => {
					const active = selected?.name === s.name && selected?.type === "skill";
					return (
						<motion.button
							key={s.name}
							type="button"
							onClick={() => onSelect(s)}
							whileHover={{ y: -2, scale: 1.04 }}
							whileTap={{ scale: 0.96 }}
							// 背景必须不透明：胶囊行固定悬浮在输入框上方、压住可滚动内容，
							// 半透明会让背后内容穿透。用 color-mix 把主色调入 --card（不透明底），保留原有色调。
							className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${
								active
									? "border-primary/50 bg-[color-mix(in_srgb,var(--primary)_15%,var(--card))] text-primary"
									: "border-border/60 bg-card text-muted-foreground hover:border-primary/30 hover:bg-[color-mix(in_srgb,var(--primary)_8%,var(--card))] hover:text-primary"
							}`}
							title={s.description || s.name}
						>
							<span className="icon-[mdi--puzzle-outline] h-3 w-3" />
							{s.alias || s.name}
						</motion.button>
					);
				})}
			</div>

			{/* 两端渐隐 + 浮出箭头，提示可横向翻动 */}
			{canPrev && (
				<>
					<div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-background to-transparent" />
					<motion.button
						type="button"
						onClick={() => scrollBy(-1)}
						whileHover={{ scale: 1.08 }}
						whileTap={{ scale: 0.92 }}
						className="absolute -left-3 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100 hover:border-primary/40 hover:text-primary"
						title={t("newSession.skillScrollLeft")}
					>
						<span className="icon-[mdi--chevron-left] h-4 w-4" />
					</motion.button>
				</>
			)}
			{canNext && (
				<>
					<div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent" />
					<motion.button
						type="button"
						onClick={() => scrollBy(1)}
						whileHover={{ scale: 1.08 }}
						whileTap={{ scale: 0.92 }}
						className="absolute -right-3 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100 hover:border-primary/40 hover:text-primary"
						title={t("newSession.skillScrollRight")}
					>
						<span className="icon-[mdi--chevron-right] h-4 w-4" />
					</motion.button>
				</>
			)}
		</div>
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
	const tr = usePluginI18n();
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
			// 跟随外层左对齐列（max-w-2xl）；单组占左半、双组左右等分，整体左对齐。
			className="mt-5 grid w-full grid-cols-2 items-start gap-x-10"
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
				const groupName = tr(group, group.name);
				return (
					<div key={group.id} className="flex w-full min-w-0 flex-col gap-1.5">
						<div className="truncate px-0.5 text-[12px] font-semibold text-foreground/80" title={groupName}>
							{groupName}
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
								const wordText = tr(group, word);
								return (
									<motion.button
										key={`${wp}-${idx}-${word}`}
										type="button"
										onClick={() => onPick(wordText)}
										variants={{
											initial: { opacity: 0, x: -6 },
											animate: { opacity: 1, x: 0 },
										}}
										transition={{ duration: 0.55, ease: guidingEase }}
										whileTap={{ scale: 0.98 }}
										title={wordText}
										className={`relative flex min-h-8 items-start py-1.5 pl-[18px] text-left text-[12px] leading-relaxed text-muted-foreground transition-colors hover:text-primary before:absolute before:left-0 before:border-l before:border-muted-foreground/30 before:content-[''] ${
											isLast
												? "before:top-0 before:h-4 before:w-[12px] before:rounded-bl-[7px] before:border-b"
												: "before:inset-y-0 before:w-0 after:absolute after:left-0 after:top-4 after:w-[12px] after:border-t after:border-muted-foreground/30 after:content-['']"
										}`}
									>
										<span className="break-words">{wordText}</span>
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

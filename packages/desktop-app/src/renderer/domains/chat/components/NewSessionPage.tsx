import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { SkillInfo } from "@preload/api";
import {
	activeInputActionIdsAtom,
	activeSessionAtom,
	activeToolNamesAtom,
	attachedImagesAtom,
	authTokenAtom,
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
import { downloadSkill } from "@shared/lib/api";
import { cn } from "@shared/lib/utils";
import { useThemeSurface } from "@vetta/theme-sdk/appearance";
import { GuidingWords } from "./new-session/GuidingWords";
import { NewSessionBackground } from "./new-session/NewSessionBackground";
import { NewSessionHero } from "./new-session/NewSessionHero";
import { SkillBadgeRow } from "./new-session/SkillBadgeRow";
import type { SceneActionState, SceneItem } from "./new-session/types";
import { useNewSessionResources } from "./new-session/useNewSessionResources";
import { useShortViewport } from "./new-session/useShortViewport";
import { InputBar } from "./InputBar";
import { SessionDropZone } from "./SessionDropZone";
import { useSessionManager } from "../hooks/useSessionManager";

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
	const { t } = useTranslation("chat");
	const surface = useThemeSurface("chat.newSessionPage");
	const { cwd } = useParams({ strict: false }) as { cwd: string };
	const decodedCwd = decodeURIComponent(cwd);

	const [renderHero, setRenderHero] = useState(false);
	const [mounted, setMounted] = useState(false);
	const [avatarAutoplay, setAvatarAutoplay] = useState(false);
	const [selectedSkill, setSelectedSkill] = useAtom(selectedSkillAtom);
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
	const { guidingGroups, loadResources, scenes, skillBadges } = useNewSessionResources(decodedCwd, token);

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

	useEffect(() => {
		return scheduleIdle(() => {
			startTransition(() => {
				void loadResources();
			});
		}, 240);
	}, [loadResources]);

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

	const waitForInstall = useCallback(async () => {
		if (!installRef.current) return;
		try {
			await installRef.current;
		} catch {
			// 安装失败已在点击处处理，这里照常发送（不带场景）。
		}
	}, []);

	// 发送：先创建/打开会话（openSession 内部会 navigate('/')），再触发 sendMessage。
	// sendMessage 现在从 activeSessionRef 读取 session，因此 await 链可以串起来。
	const handleSend = useCallback(async () => {
		// 若有正在进行的场景安装，先 await 其落盘，保证 scene 文件先于 session.create 写入，
		// 否则新 session 扫盘时读不到刚点的场景。
		await waitForInstall();
		// 欢迎页选中的执行模式（沙盒受限/完全访问）必须随会话创建一起传给后端，
		// 否则 session.create 会落到默认 full-access，再被 getState 回填覆盖。
		await openSession(decodedCwd, undefined, executionMode);
		await sendMessage();
	}, [decodedCwd, executionMode, openSession, sendMessage, waitForInstall]);

	// 点击引导词 = 以该文本为 overrideText 立即发起一轮：openSession → sendMessage(word)。
	// 用 override 传值而非先 setInputValue，避开 atom 异步更新导致 sendMessage 读到旧值。
	const handleGuidingWord = useCallback(
		async (word: string) => {
			await waitForInstall();
			await openSession(decodedCwd, undefined, executionMode);
			await sendMessage(word);
		},
		[decodedCwd, executionMode, openSession, sendMessage, waitForInstall],
	);

	const greetingTitle = authUser?.nickname
		? t("newSession.greetingTitle", { nickname: authUser.nickname })
		: t("newSession.greetingDefault");

	return (
		<SessionDropZone
			cwdOverride={decodedCwd}
			className={cn(
				"relative flex h-full flex-1 flex-col overflow-hidden bg-background",
				surface?.rootClassName,
			)}
		>
			<NewSessionBackground />

			{/* 整页垂直居中：单一滚动容器内 min-h-full + justify-center，内容始终居中
			    （hero → 技能胶囊 → 输入框 → 引导词），无论窗口多大都在中间。
			    InputBar 变高时整列变高、保持居中；内容超出视口则可滚动。整列与输入框同宽（max-w-2xl）。 */}
			<div className="no-drag relative z-[1] flex flex-1 flex-col overflow-y-auto">
				<div className="flex min-h-full w-full flex-col items-center justify-center px-6 py-6">
					{renderHero && (
						<NewSessionHero
							avatarAutoplay={avatarAutoplay}
							greetingTitle={greetingTitle}
							mounted={mounted}
							onSceneClick={handleSceneClick}
							sceneActions={sceneActions}
							scenes={scenes}
							selectedSkill={selectedSkill}
							subtitle={t("newSession.subtitle")}
						/>
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

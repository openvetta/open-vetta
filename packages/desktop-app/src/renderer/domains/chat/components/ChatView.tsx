import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAtomValue, useAtom, useSetAtom } from "jotai";
import {
	activeSessionAtom,
	authUserAtom,
	chatMessagesAtom,
	isStreamingAtom,
	activityPanelOpenAtom,
	flowingSendDialogOpenAtom,
	workflowInstanceAtom,
	workflowCompleteDialogOpenAtom,
	pageHeaderTitleAtom,
	pageHeaderRightSlotAtom,
	inlineFilePreviewContextReadonlyAtom,
	closeInlineFilePreviewAtom,
	defaultConversationCwdAtom,
	getProjectDisplayName,
	sessionDisplayLabel,
	sessionsMapAtom,
	activeInputActionIdsAtom,
	editImageAttachmentAtom,
	knowledgeRetrievalActiveAtom,
	pendingEditImageIdAtom,
} from "@shared/store/atoms";
import { Button } from "@shared/components/ui/button";
import { ChatExportHost } from "./ChatExportHost";
import { MessageList } from "./MessageList";
import { InputBar } from "./InputBar";
import { BackgroundTasksBadge } from "./BackgroundTasksBadge";
import { SandboxGrantsBadge } from "./SandboxGrantsBadge";
import { ActivityPanel } from "@domains/activity-panel/components/ActivityPanel";

interface ChatViewProps {
	onSend: (overrideText?: string) => Promise<void>;
	onAbort: () => Promise<void>;
	onSendQueued: (runtimeId: string, id: string) => Promise<void>;
}

export function ChatView({ onSend, onAbort, onSendQueued }: ChatViewProps): JSX.Element {
	const { t } = useTranslation("chat");
	const activeSession = useAtomValue(activeSessionAtom);
	const messages = useAtomValue(chatMessagesAtom);
	const isStreaming = useAtomValue(isStreamingAtom);
	const [panelOpen, setPanelOpen] = useAtom(activityPanelOpenAtom);
	const setFlowingSendOpen = useSetAtom(flowingSendDialogOpenAtom);
	const setWorkflowCompleteOpen = useSetAtom(workflowCompleteDialogOpenAtom);
	const workflowInstance = useAtomValue(workflowInstanceAtom);
	const authUser = useAtomValue(authUserAtom);
	const setHeaderTitle = useSetAtom(pageHeaderTitleAtom);
	const setHeaderRightSlot = useSetAtom(pageHeaderRightSlotAtom);
	const inlinePreviewCtx = useAtomValue(inlineFilePreviewContextReadonlyAtom);
	const inlinePreviewActive = inlinePreviewCtx !== null;
	const closeInlinePreview = useSetAtom(closeInlineFilePreviewAtom);
	const defaultCwd = useAtomValue(defaultConversationCwdAtom);
	const sessionsMap = useAtomValue(sessionsMapAtom);
	const setEditImageAttachment = useSetAtom(editImageAttachmentAtom);
	const setPendingEditImageId = useSetAtom(pendingEditImageIdAtom);
	const setActiveInputActionIds = useSetAtom(activeInputActionIdsAtom);
	const setKnowledgeRetrievalActive = useSetAtom(knowledgeRetrievalActiveAtom);

	// 切换会话时释放一次性的图像编辑 attach，避免在 A 会话选中的编辑目标串到 B 会话
	// （图像服务按全局 id 解析源图，stale id 会被照常注入并编辑错图）。
	// 同时清空所有 active 的 input-action（如「图像生成」），让每个会话都从默认输入
	// 态开始——否则在 A 会话点过编辑/开过开关，切到 B 会话仍是 active。
	//
	// 仅在「已有会话 → 另一个已有会话」时清空：用 ref 记录上一个 runtimeId，跳过首次
	// 挂载 / 从无会话（null）进入会话的场景。否则从 NewSessionPage 开「图像生成」开关
	// 发送时，openSession 会先 setActiveSession+navigate 让本组件全新挂载，本 effect
	// 抢在 sendMessage 读取 activeInputActionIds 之前就把它清空，导致开关失效、且该轮
	// 拿不到 imageMode（生图工具不可用）。
	const prevRuntimeIdRef = useRef<string | undefined>(undefined);
	useEffect(() => {
		const prev = prevRuntimeIdRef.current;
		const curr = activeSession?.runtimeId;
		prevRuntimeIdRef.current = curr;
		if (prev == null || prev === curr) return;
		setEditImageAttachment(null);
		setPendingEditImageId(null);
		setActiveInputActionIds(new Set());
		setKnowledgeRetrievalActive(false);
	}, [
		activeSession?.runtimeId,
		setEditImageAttachment,
		setPendingEditImageId,
		setActiveInputActionIds,
		setKnowledgeRetrievalActive,
	]);

	// 窗口置顶（钉在屏幕上）状态，初始与主进程真实状态同步
	const [pinned, setPinned] = useState(false);
	const [exporting, setExporting] = useState(false);
	useEffect(() => {
		void window.vetta.window.isAlwaysOnTop().then(setPinned);
	}, []);
	const handleTogglePin = useCallback(async () => {
		const next = await window.vetta.window.toggleAlwaysOnTop();
		setPinned(next);
	}, []);
	const handleExportFinished = useCallback(() => setExporting(false), []);

	const handleTogglePanel = useCallback(() => {
		// When in inline preview mode, the "hide panel" button should also close
		// the inline preview, otherwise the panel would still render via flex-1.
		if (inlinePreviewActive) {
			closeInlinePreview();
			setPanelOpen(false);
			return;
		}
		setPanelOpen((o) => !o);
	}, [inlinePreviewActive, closeInlinePreview, setPanelOpen]);

	// 判断是否在最后环节且当前用户是该环节成员
	const isLastStage =
		workflowInstance != null &&
		workflowInstance.status === "active" &&
		authUser != null &&
		workflowInstance.current_stage === workflowInstance.stages.length - 1 &&
		workflowInstance.stages[workflowInstance.current_stage]?.member_ids.includes(authUser.id);

	// Push session name into the global page header —— 跟随 sidebar 的 session 标签
	// （name || firstMessage || id），保证与首轮自动重命名后的侧边栏名称一致。
	// 找不到对应 SessionInfo 时（如刚创建尚未入 map）回退到项目展示名。
	const sessionTitle = useMemo(() => {
		if (!activeSession) return null;
		for (const list of sessionsMap.values()) {
			const found = list.find((s) => s.path === activeSession.sessionPath);
			if (found) return sessionDisplayLabel(found);
		}
		return getProjectDisplayName(activeSession.cwd, defaultCwd);
	}, [activeSession, sessionsMap, defaultCwd]);
	useEffect(() => {
		setHeaderTitle(sessionTitle);
		return () => setHeaderTitle(null);
	}, [sessionTitle, setHeaderTitle]);

	// Push right-side actions into the global page header
	const rightSlot = useMemo(
		() => (
			<>
				<BackgroundTasksBadge />
				<SandboxGrantsBadge />
				<Button
					size="icon-xs"
					variant="ghost"
					title={t("chatView.exportButton.title")}
					disabled={messages.length === 0 || isStreaming || exporting}
					onClick={() => setExporting(true)}
				>
					<span
						className={
							exporting
								? "icon-[mdi--loading] animate-spin text-[14px]"
								: "icon-[solar--square-share-line-linear] text-[14px]"
						}
					/>
				</Button>
				{isLastStage ? (
					<Button
						size="sm"
						className="rounded-full bg-emerald-600 hover:bg-emerald-700"
						onClick={() => setWorkflowCompleteOpen(true)}
					>
						<span className="icon-[solar--check-circle-linear] text-[14px]" />
						<span>{t("chatView.completeButton.label")}</span>
					</Button>
				) : null}
				{/* 流转/文件转发入口暂时隐藏
				<Button
					size="icon-xs"
					variant="ghost"
					title="文件转发"
					onClick={() => setFlowingSendOpen(true)}
				>
					<span className="icon-[solar--transfer-horizontal-linear] text-[14px]" />
				</Button>
				*/}
				<Button
					size="icon-xs"
					variant="ghost"
					title={pinned ? t("chatView.pinButton.pinned") : t("chatView.pinButton.unpinned")}
					onClick={handleTogglePin}
					className={pinned ? "bg-accent text-foreground" : ""}
				>
					<span
						className={`${pinned ? "icon-[solar--pin-bold]" : "icon-[solar--pin-linear]"} text-[14px]`}
					/>
				</Button>
				<Button
					size="icon-xs"
					variant="ghost"
					title={panelOpen ? t("chatView.panelButton.open") : t("chatView.panelButton.closed")}
					onClick={handleTogglePanel}
					className={panelOpen ? "bg-accent text-foreground" : ""}
				>
					<span className="icon-[solar--sidebar-minimalistic-linear] -scale-x-100 text-[14px]" />
				</Button>
			</>
		),
		[
			isLastStage,
			isStreaming,
			messages.length,
			panelOpen,
			pinned,
			exporting,
			setFlowingSendOpen,
			setWorkflowCompleteOpen,
			handleTogglePanel,
			handleTogglePin,
		],
	);
	useEffect(() => {
		setHeaderRightSlot(rightSlot);
		return () => setHeaderRightSlot(null);
	}, [rightSlot, setHeaderRightSlot]);

	return (
		<div className="flex h-full min-w-0 flex-1 flex-col bg-background">
			{exporting && (
				<ChatExportHost
					messages={messages}
					title={sessionTitle ?? t("chatView.defaultSessionTitle")}
					onFinished={handleExportFinished}
				/>
			)}
			<div className="flex flex-1 gap-2 overflow-hidden">
				{/* Chat messages + input — 始终 flex-1，文件预览只是把活动面板拉宽来挤压它 */}
				<div className="flex min-w-0 flex-1 flex-col">
					{/* 不再渲染空态占位：Welcome→Chat 的过渡瞬间 messages 可能短暂为空，
					    占位图会"一闪而过"，体验比直接留白更差。空 list 由 MessageList 自身处理。 */}
					<MessageList
						messages={messages}
						isStreaming={isStreaming}
						sessionId={activeSession?.sessionPath ?? null}
						onSend={onSend}
						onAbort={onAbort}
					/>
					<InputBar onSend={onSend} onAbort={onAbort} onSendQueued={onSendQueued} />
				</div>

				{/* Activity panel — embedded with bg + rounded corners */}
				<ActivityPanel />
			</div>
		</div>
	);
}

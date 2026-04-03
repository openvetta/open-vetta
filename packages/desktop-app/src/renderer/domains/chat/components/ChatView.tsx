import { useAtomValue, useAtom, useSetAtom } from "jotai";
import { activeSessionAtom, authUserAtom, chatMessagesAtom, isStreamingAtom, activityPanelOpenAtom, flowingSendDialogOpenAtom, workflowInstanceAtom, workflowCompleteDialogOpenAtom } from "@shared/store/atoms";
import { Button } from "@shared/components/ui/button";
import { pathBasename } from "@shared/lib/utils";
import { MessageList } from "./MessageList";
import { InputBar } from "./InputBar";
import { ActivityPanel } from "@domains/activity-panel/components/ActivityPanel";

function projectName(cwd: string): string {
	return pathBasename(cwd);
}

interface ChatViewProps {
	onSend: () => Promise<void>;
	onAbort: () => Promise<void>;
}

export function ChatView({ onSend, onAbort }: ChatViewProps): JSX.Element {
	const activeSession = useAtomValue(activeSessionAtom);
	const messages = useAtomValue(chatMessagesAtom);
	const isStreaming = useAtomValue(isStreamingAtom);
	const [panelOpen, setPanelOpen] = useAtom(activityPanelOpenAtom);
	const setFlowingSendOpen = useSetAtom(flowingSendDialogOpenAtom);
	const setWorkflowCompleteOpen = useSetAtom(workflowCompleteDialogOpenAtom);
	const workflowInstance = useAtomValue(workflowInstanceAtom);
	const authUser = useAtomValue(authUserAtom);

	// 判断是否在最后环节且当前用户是该环节成员
	const isLastStage =
		workflowInstance != null &&
		workflowInstance.status === "active" &&
		authUser != null &&
		workflowInstance.current_stage === workflowInstance.stages.length - 1 &&
		workflowInstance.stages[workflowInstance.current_stage]?.member_ids.includes(authUser.id);

	return (
		<div className="flex h-full min-w-0 flex-1 flex-col bg-background">
			{/* Title bar — shared across chat and activity panel */}
			<div
				className="drag-region pointer-events-none shrink-0"
				style={{
					paddingTop: 20,
					paddingBottom: 8,
					paddingLeft: 16,
					paddingRight: 16,
				}}
			>
				<div className="pointer-events-auto no-drag flex items-center justify-between">
					<div className="truncate text-[14px] font-semibold text-foreground">
						{activeSession ? projectName(activeSession.cwd) : "Session"}
					</div>

					<div className="flex items-center gap-1">
						{isStreaming && (
							<div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
								<span className="h-[5px] w-[5px] animate-pulse rounded-full bg-muted-foreground/50" />
								Thinking...
							</div>
						)}
						{isLastStage ? (
							<Button
								size="sm"
								className="rounded-full bg-emerald-600 hover:bg-emerald-700"
								onClick={() => setWorkflowCompleteOpen(true)}
							>
								<span className="icon-[mdi--check-circle-outline] text-[14px]" />
								<span>完成</span>
							</Button>
						) : (
							<Button
								size="sm"
								className="rounded-full"
								onClick={() => setFlowingSendOpen(true)}
							>
								<span className="icon-[mdi--swap-horizontal] text-[14px]" />
								<span>内容流转</span>
							</Button>
						)}
						<Button
							size="icon-xs"
							variant="ghost"
							title={panelOpen ? "关闭活动面板" : "打开活动面板"}
							onClick={() => setPanelOpen((o) => !o)}
							className={panelOpen ? "bg-accent text-foreground" : ""}
						>
							<span className="icon-[mdi--dock-right] text-[14px]" />
						</Button>
					</div>
				</div>
			</div>

			{/* Content area below title bar */}
			<div className="flex flex-1 gap-2 overflow-hidden">
				{/* Chat messages + input */}
				<div className="flex min-w-0 flex-1 flex-col">
					{messages.length === 0 ? (
						<div className="flex flex-1 flex-col items-center justify-center gap-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted">
								<span className="icon-[mdi--chat-outline] h-5 w-5 text-muted-foreground/50" />
							</div>
							<p className="text-[13px] text-muted-foreground/50">
								No messages yet. Say something!
							</p>
						</div>
					) : (
						<MessageList messages={messages} isStreaming={isStreaming} />
					)}
					<InputBar onSend={onSend} onAbort={onAbort} />
				</div>

				{/* Activity panel — embedded with bg + rounded corners */}
				<ActivityPanel />
			</div>
		</div>
	);
}

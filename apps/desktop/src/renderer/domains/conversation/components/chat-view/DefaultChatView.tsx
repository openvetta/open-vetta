import { ActivityPanel, CurrentScenarioActivityPanel } from "@domains/activity-panel/components/ActivityPanel";
import { BottomPanelHost } from "@domains/bottom-panel/components/BottomPanelHost";
import { useChatBackground } from "@shared/hooks/useChatBackground";
import { cn } from "@shared/lib/utils";
import { PerfSendProfiler } from "@shared/lib/perf-send";
import type { ChatConversationItem } from "@shared/store/atoms";
import { CHAT_BACKGROUND_COMPONENTS } from "@shared/theme/chat-background";
import type { ActivityWorkspace } from "@shared/workspace/activity-workspace";
import type { WorkSurfaceScope } from "@shared/workspace/work-surface";
import type { ConversationParticipantViewModel } from "@shared/conversation";
import type { ActivityTabId } from "@domains/activity-panel/registry/types";
import type { ConversationScenario } from "@vetta-org/plugin-sdk";
import { memo, type ReactNode } from "react";
import { ChatExportHost } from "../ChatExportHost";

export interface DefaultChatViewProps {
	readonly children: ReactNode;
	/** 消息流上方的常驻条（Team 的成员胶囊条就住在这里）。 */
	readonly subHeader?: ReactNode;
	readonly messages: readonly ChatConversationItem[];
	readonly workspace: ActivityWorkspace;
	readonly workSurface: WorkSurfaceScope | null;
	readonly rootClassName?: string;
	readonly exportState?: {
		readonly title: string;
		readonly onFinished: () => void;
		readonly participants?: readonly ConversationParticipantViewModel[];
	};
	readonly activity?: {
		readonly enablePluginTabs?: boolean;
		readonly enabledBuiltinTabs?: readonly ActivityTabId[];
		/** Hosts that do not drive the global scenario atom (Team) pass their own scenario. */
		readonly pluginScenario?: ConversationScenario;
	};
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
	return left === right || (left.length === right.length && left.every((id, index) => id === right[index]));
}

function sameOptionalIds(left?: readonly string[], right?: readonly string[]): boolean {
	if (!left || !right) return left === right;
	return sameIds(left, right);
}

function sameActivity(
	left: DefaultChatViewProps["activity"],
	right: DefaultChatViewProps["activity"],
): boolean {
	if (left === right) return true;
	if (!left || !right) return false;
	return left.enablePluginTabs === right.enablePluginTabs &&
		left.pluginScenario === right.pluginScenario &&
		sameOptionalIds(left.enabledBuiltinTabs, right.enabledBuiltinTabs);
}

const ActivityColumn = memo(
	function ActivityColumn({ workspace, activity }: Pick<DefaultChatViewProps, "workspace" | "activity">) {
		return activity ? (
			<ActivityPanel
				workspace={workspace}
				enablePluginTabs={activity.enablePluginTabs}
				enabledBuiltinTabs={activity.enabledBuiltinTabs}
				pluginScenario={activity.pluginScenario}
			/>
		) : (
			<CurrentScenarioActivityPanel workspace={workspace} />
		);
	},
	(previous, next) =>
		previous.workspace.id === next.workspace.id &&
		previous.workspace.cwd === next.workspace.cwd &&
		sameIds(previous.workspace.runtimeIds, next.workspace.runtimeIds) &&
		sameActivity(previous.activity, next.activity),
);

export function DefaultChatView({
	children,
	subHeader,
	messages,
	workspace,
	workSurface,
	rootClassName,
	exportState,
	activity,
}: DefaultChatViewProps): JSX.Element {
	const { backgroundId } = useChatBackground();
	const Backdrop = CHAT_BACKGROUND_COMPONENTS[backgroundId];

	return (
		<PerfSendProfiler id="ChatView(total)">
			<div className={cn("relative flex h-full min-w-0 flex-1 flex-col bg-background", rootClassName)}>
				{exportState ? (
					<ChatExportHost
						messages={messages}
						title={exportState.title}
						participants={exportState.participants}
						onFinished={exportState.onFinished}
					/>
				) : null}
				{/* 墙纸在最底层，内容整行 `relative` 盖在它上面——纹路只是背景，不参与命中与布局。 */}
				{Backdrop ? <Backdrop /> : null}
				{/*
				 * 沉浸式顶栏（main[data-header-overlay]）浮在整个内容区上：整行先让出顶栏高度，
				 * 活动面板才不会被顶栏压住；消息列再用负 margin 抵回去，让消息流的渐隐能铺到顶栏下面。
				 */}
				<div className="relative flex min-h-0 flex-1 gap-2 overflow-visible [[data-header-overlay=true]_&]:pt-11">
					{/*
					 * 用 clip + clip-margin 代替 overflow-hidden：活动面板收起时底部面板要铺到
					 * 窗口边缘，右边得越过这一行的 gap-2 再加 AppFrame 的 p-2（共 16px），
					 * 而消息流本身仍然需要被裁住。
					 */}
					<div className="relative isolate flex min-h-0 min-w-0 flex-1 flex-col overflow-clip [overflow-clip-margin:16px] [[data-header-overlay=true]_&]:-mt-11">
						{/*
						 * 只压消息列这一段的纹路：卡片和正文几乎没有自带底色，图案直接怼在文字后面会糊。
						 * 压暗层用的是同一个 --background，颜色上看不出来，只把底下的线条降到四成左右；
						 * 右缘再渐隐掉，避免在活动面板交界处留下一条竖向硬边。
						 * `-z-10` + `isolate`：垫在内容下面，但仍然盖住根节点那层墙纸。
						 */}
						<div
							aria-hidden
							className="pointer-events-none absolute inset-0 -z-10 bg-background/60"
							style={{
								maskImage:
									"linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,1) calc(100% - 64px), rgba(0,0,0,0) 100%)",
								WebkitMaskImage:
									"linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,1) calc(100% - 64px), rgba(0,0,0,0) 100%)",
							}}
						/>
						{subHeader}
						{children}
						{/*
						 * 底部面板住在消息列内部，宽度跟着消息列走、不伸到活动面板下方：
						 * 活动面板是与消息流并列的一列，横穿它的底边会把两列看成一块。
						 */}
						<BottomPanelHost scope={workSurface} />
					</div>
					<ActivityColumn workspace={workspace} activity={activity} />
				</div>
			</div>
		</PerfSendProfiler>
	);
}

export function ChatComposer({ children }: { children: ReactNode }) {
	return (
		<div className="relative shrink-0">
			<PerfSendProfiler id="InputBar">{children}</PerfSendProfiler>
		</div>
	);
}

export function ChatError({ children }: { children?: ReactNode }) {
	return children ? (
		<div
			className="mx-auto mb-2 w-full max-w-2xl rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive"
			role="alert"
		>
			{children}
		</div>
	) : null;
}

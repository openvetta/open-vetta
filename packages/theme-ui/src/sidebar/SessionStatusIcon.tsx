import type { JSX } from "react";
import { cn } from "@vetta-org/ui/utils";

export interface SessionStatusIconProps {
	active: boolean;
	running: boolean;
	scheduled: boolean;
	/**
	 * 会话正等着用户处理（提问 / 审批 / 询问 / 授权）。优先于其它状态：
	 * 「在转」说明 agent 还在干活，「停住 + 问号」才说明它在等人，两者同时出现会互相盖住信息。
	 */
	waiting?: boolean;
}

export function SessionStatusIcon({
	active,
	running,
	scheduled,
	waiting = false,
}: SessionStatusIconProps): JSX.Element {
	if (waiting) {
		return (
			<span
				data-session-leading-icon="true"
				data-session-waiting="true"
				className="icon-[solar--question-circle-bold] h-3.5 w-3.5 shrink-0 text-amber-500 motion-safe:animate-pulse"
			/>
		);
	}
	if (running) {
		return (
			<span
				data-session-leading-icon="true"
				className={cn(
					"project-running-icon icon-[solar--refresh-linear] h-3.5 w-3.5 shrink-0 animate-spin",
					active ? "text-primary" : "text-muted-foreground",
				)}
			/>
		);
	}
	if (scheduled) {
		return (
			<span
				data-session-leading-icon="true"
				className="icon-[solar--clock-circle-linear] h-3.5 w-3.5 shrink-0 text-primary/80"
			/>
		);
	}
	return (
		<span
			data-session-leading-icon="true"
			className={cn(
				"icon-[solar--chat-round-line-linear] h-3.5 w-3.5 shrink-0",
				active ? "text-foreground/70" : "text-muted-foreground/50",
			)}
		/>
	);
}

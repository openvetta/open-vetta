import type { BuiltinNotificationSoundId } from "../../shared/notification-preferences.js";

// ─── System notifications ───
/** 点击系统通知后主进程下发的路由意图（按 type 分流，见 CONTEXT.md「通知类型」）。 */
export type NotificationNavigatePayload =
	| {
			type: "agent-turn-complete" | "agent-question-pending";
			sessionPath: string;
			cwd: string;
	  }
	| { type: "remote-settings" };

export interface NotificationSoundPayload {
	soundId: BuiltinNotificationSoundId;
	volume: number;
}

export interface DesktopNotificationApi {
	/** 上报聊天页当前所在 session path；离开聊天页传 null。主进程据此 + 窗口聚焦态做抑制判定。 */
	setForegroundSession(sessionPath: string | null): Promise<void>;
	/** 用户点击系统通知时触发，渲染端按 payload.type 路由。返回取消订阅函数。 */
	onNavigate(handler: (payload: NotificationNavigatePayload) => void): () => void;
	/**
	 * 需要用户回来看的会话（跑完还没打开、或在等用户处理），与 Dock 角标同一份；打开该会话即移出。
	 * 只存内存，重启清空。
	 */
	listAttentionSessions(): Promise<string[]>;
	onAttentionSessionsChanged(handler: (sessionPaths: string[]) => void): () => void;
	/** 主进程完成策略判定后发送的内置提示音命令。 */
	onSound(handler: (payload: NotificationSoundPayload) => void): () => void;
}

import type { ShowToastInput } from "@shared/store/toast-atoms";

/** 主进程在一个可用模型都没有时建会话的报错原文(runtime-desktop backend-pool)。 */
const NO_AVAILABLE_MODEL = "requires at least one available model";

const OPEN_FAILURE_TOAST_MS = 8000;

export function isNoAvailableModelError(message: string): boolean {
	return message.includes(NO_AVAILABLE_MODEL);
}

export type SessionOpenFailureTextKey =
	| "chat:sessionOpenFailed.title"
	| "chat:sessionOpenFailed.noModel"
	| "chat:sessionOpenFailed.openModelSettings";

export interface SessionOpenFailureToastOptions {
	readonly message: string;
	readonly t: (key: SessionOpenFailureTextKey) => string;
	readonly openModelSettings: () => void;
}

/**
 * 打开会话失败后给用户的提示。
 *
 * 失败时会话流里追加的错误会随退回欢迎页一起清掉,用户只觉得「点了没反应」(openvetta/open-vetta#91),
 * 所以改用跨页面留存的 toast 说清原因;没有可用模型时附一个去模型设置的入口。
 */
export function sessionOpenFailureToast({
	message,
	t,
	openModelSettings,
}: SessionOpenFailureToastOptions): ShowToastInput {
	if (isNoAvailableModelError(message)) {
		return {
			variant: "error",
			title: t("chat:sessionOpenFailed.title"),
			message: t("chat:sessionOpenFailed.noModel"),
			durationMs: OPEN_FAILURE_TOAST_MS,
			action: { label: t("chat:sessionOpenFailed.openModelSettings"), onClick: openModelSettings },
		};
	}
	return {
		variant: "error",
		title: t("chat:sessionOpenFailed.title"),
		message,
		durationMs: OPEN_FAILURE_TOAST_MS,
	};
}

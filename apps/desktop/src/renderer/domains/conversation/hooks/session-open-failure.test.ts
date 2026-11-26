import { describe, expect, it } from "vitest";
import { isNoAvailableModelError, sessionOpenFailureToast } from "./session-open-failure";

const t = (key: string) => key;
// 主进程经 IPC 抛回来的原样报错。
const NO_MODEL_IPC_ERROR =
	"Error invoking remote method 'vetta:session:create': Error: Desktop Runtime requires at least one available model";

describe("打开会话失败的提示", () => {
	it("认出没有可用模型的报错,别的报错不算", () => {
		expect(isNoAvailableModelError(NO_MODEL_IPC_ERROR)).toBe(true);
		expect(isNoAvailableModelError("Session is managed by Agent Team.")).toBe(false);
	});

	it("没有可用模型时说人话,并给一个去模型设置的入口", () => {
		let settingsOpened = 0;
		const toast = sessionOpenFailureToast({
			message: NO_MODEL_IPC_ERROR,
			t,
			openModelSettings: () => {
				settingsOpened += 1;
			},
		});

		expect(toast).toMatchObject({
			variant: "error",
			title: "chat:sessionOpenFailed.title",
			message: "chat:sessionOpenFailed.noModel",
			action: { label: "chat:sessionOpenFailed.openModelSettings" },
		});
		toast.action?.onClick();
		expect(settingsOpened).toBe(1);
	});

	it("其它失败照实给出原因,不带设置入口", () => {
		const toast = sessionOpenFailureToast({ message: "Session file is corrupted", t, openModelSettings: () => {} });

		expect(toast).toMatchObject({ variant: "error", message: "Session file is corrupted" });
		expect(toast.action).toBeUndefined();
	});

	it("提示停留得足够久,不会在退回欢迎页的同时一闪而过", () => {
		const toast = sessionOpenFailureToast({ message: "x", t, openModelSettings: () => {} });
		expect(toast.durationMs).toBeGreaterThanOrEqual(6000);
	});
});

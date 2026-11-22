import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "../../shared/notification-preferences.js";

const mocks = vi.hoisted(() => {
	class Notification {
		static instances: Notification[] = [];
		static isSupported = vi.fn(() => true);
		readonly options: Record<string, unknown>;
		on = vi.fn();
		show = vi.fn();
		close = vi.fn();
		constructor(options: Record<string, unknown>) {
			this.options = options;
			Notification.instances.push(this);
		}
	}
	return {
		Notification,
		readConfigSync: vi.fn(),
		isFocused: vi.fn(() => false),
		send: vi.fn(),
		dock: { label: "", bounces: 0 },
	};
});

vi.mock("electron", () => ({
	Notification: mocks.Notification,
	app: {
		dock: {
			setBadge: (label: string) => {
				mocks.dock.label = label;
			},
			bounce: () => {
				mocks.dock.bounces += 1;
			},
		},
	},
}));
vi.mock("../ipc/fs.js", () => ({ readConfigSync: mocks.readConfigSync }));
vi.mock("../i18n/index.js", () => ({ mainT: (key: string) => key }));
vi.mock("../window-manager.js", () => ({
	getMainWindow: () => ({ isFocused: mocks.isFocused }),
	iconPath: { win32: "icon", darwin: "icon", linux: "icon" },
	showMainWindow: vi.fn(),
}));

const service = await import("./notification-service.js");

beforeEach(() => {
	mocks.Notification.instances.length = 0;
	mocks.send.mockReset();
	mocks.isFocused.mockReturnValue(false);
	mocks.readConfigSync.mockReturnValue({
		notificationsEnabled: true,
		notificationPreferences: {
			...DEFAULT_NOTIFICATION_PREFERENCES,
			events: {
				...DEFAULT_NOTIFICATION_PREFERENCES.events,
				completed: { systemEnabled: true, soundId: "soft-chime" },
			},
		},
	});
	service.setNotificationWebContents({ isDestroyed: () => false, send: mocks.send } as never);
	service.setForegroundSessionPath(null);
});

describe("agent notification delivery", () => {
	it("uses a silent system banner and independently dispatches the configured sound", async () => {
		await service.notify({
			type: "agent-turn-complete",
			sessionPath: "missing-session.jsonl",
			cwd: "C:/project",
			outcome: "completed",
		});

		expect(mocks.send).toHaveBeenCalledWith(service.NOTIFICATION_SOUND_CHANNEL, {
			soundId: "soft-chime",
			volume: 60,
		});
		expect(mocks.Notification.instances).toHaveLength(1);
		expect(mocks.Notification.instances[0]?.options.silent).toBe(true);
		expect(mocks.Notification.instances[0]?.show).toHaveBeenCalled();
	});

	it("can play a sound when the system banner is globally disabled", async () => {
		mocks.readConfigSync.mockReturnValue({
			notificationsEnabled: false,
			notificationPreferences: {
				...DEFAULT_NOTIFICATION_PREFERENCES,
				events: {
					...DEFAULT_NOTIFICATION_PREFERENCES.events,
					completed: { systemEnabled: true, soundId: "single-bell" },
				},
			},
		});
		await service.notify({
			type: "agent-turn-complete",
			sessionPath: "missing-session.jsonl",
			cwd: "C:/project",
			outcome: "completed",
		});
		expect(mocks.send).toHaveBeenCalled();
		expect(mocks.Notification.instances).toHaveLength(0);
	});
});

describe("Dock attention badge", () => {
	let svc: typeof service;

	beforeEach(async () => {
		// 计数是模块级状态，每个用例换一份新的服务实例。
		vi.resetModules();
		svc = await import("./notification-service.js");
		svc.setNotificationWebContents({ isDestroyed: () => false, send: mocks.send } as never);
		mocks.dock.label = "";
		mocks.dock.bounces = 0;
	});

	const complete = (sessionPath: string, outcome: "completed" | "error" = "completed") =>
		svc.notify({ type: "agent-turn-complete", sessionPath, cwd: "C:/project", outcome });
	const ask = (sessionPath: string) => svc.notify({ type: "agent-question-pending", sessionPath, cwd: "C:/project" });

	it("counts finished sessions while away and clears each one when it is opened", async () => {
		await complete("a.jsonl");
		await complete("b.jsonl", "error");
		expect(mocks.dock.label).toBe("2");
		expect(mocks.dock.bounces).toBe(0);

		// 用户切回 Vetta 并打开 a。
		mocks.isFocused.mockReturnValue(true);
		svc.handleMainWindowFocused();
		svc.setForegroundSessionPath("a.jsonl");
		expect(mocks.dock.label).toBe("1");

		svc.setForegroundSessionPath("b.jsonl");
		expect(mocks.dock.label).toBe("");
	});

	it("bounces for a pending question and clears it on open even if it is still unanswered", async () => {
		await ask("q.jsonl");
		expect(mocks.dock.label).toBe("1");
		expect(mocks.dock.bounces).toBe(1);

		// 同一会话随后又跑完：仍只算一个，也不再跳。
		await complete("q.jsonl");
		expect(mocks.dock).toEqual({ label: "1", bounces: 1 });

		mocks.isFocused.mockReturnValue(true);
		svc.setForegroundSessionPath("q.jsonl");
		expect(mocks.dock.label).toBe("");
	});

	it("does not count events in the session the user is focused on", async () => {
		mocks.isFocused.mockReturnValue(true);
		svc.setForegroundSessionPath("open.jsonl");
		await ask("open.jsonl");
		await complete("open.jsonl");

		expect(mocks.dock.label).toBe("");
		expect(mocks.dock.bounces).toBe(0);
	});

	it("counts the selected session while the window is in the background and clears it on refocus", async () => {
		svc.setForegroundSessionPath("current.jsonl");
		await complete("current.jsonl");
		expect(mocks.dock.label).toBe("1");

		mocks.isFocused.mockReturnValue(true);
		svc.handleMainWindowFocused();
		expect(mocks.dock.label).toBe("");
	});

	it("keeps counting when system banners are turned off", async () => {
		mocks.readConfigSync.mockReturnValue({
			notificationsEnabled: false,
			notificationPreferences: DEFAULT_NOTIFICATION_PREFERENCES,
		});
		await complete("a.jsonl");

		expect(mocks.Notification.instances).toHaveLength(0);
		expect(mocks.dock.label).toBe("1");
	});

	it("ignores remote-control notifications and forgets deleted sessions", async () => {
		await svc.notify({ type: "remote-device-connected", deviceName: "Phone" });
		expect(mocks.dock.label).toBe("");

		await complete("project/a.jsonl");
		expect(mocks.dock.label).toBe("1");
		svc.forgetDeletedSessionAttention((path) => path.startsWith("project/"));
		expect(mocks.dock.label).toBe("");
	});
});

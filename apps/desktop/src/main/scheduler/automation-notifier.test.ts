import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScheduledTask, TaskExecutionRecord } from "../../shared/automation.js";

const channels = vi.hoisted(() => ({
	clawTexts: [] as string[],
	clawFailure: undefined as { reason: string } | undefined,
	webhookTexts: [] as string[],
}));

vi.mock("../i18n/index.js", () => ({
	mainT: (key: string, values?: Record<string, unknown>) => (values ? `${key} ${JSON.stringify(values)}` : key),
}));
vi.mock("../im-host/index.js", () => ({
	getImHost: () => ({
		deliverAutomationResult: async (text: string) => {
			channels.clawTexts.push(text);
			return channels.clawFailure;
		},
	}),
}));
vi.mock("../webhook/index.js", () => ({
	getWebhookManager: () => ({
		broadcast: async (message: { text: string }) => {
			channels.webhookTexts.push(message.text);
			return [{ ok: true, name: "team" }];
		},
	}),
}));

import { notifyAutomationFinished } from "./automation-notifier.js";

function taskWith(patch: Partial<ScheduledTask>): ScheduledTask {
	return {
		id: "task-1",
		name: "晨间简报",
		prompt: "summarize",
		schedule: { kind: "daily", hour: 9, minute: 0 },
		runTarget: { mode: "new-session", projectCwd: "C:/conversation" },
		enabled: true,
		createdAt: 0,
		updatedAt: 0,
		lastRunAt: null,
		lastRunStatus: null,
		...patch,
	};
}

function recordWith(status: TaskExecutionRecord["status"], error?: string): TaskExecutionRecord {
	return {
		id: "record-1",
		taskId: "task-1",
		startedAt: 0,
		completedAt: 1_000,
		status,
		prompt: "summarize",
		responsePreview: "",
		durationMs: 1_000,
		...(error ? { error } : {}),
	};
}

beforeEach(() => {
	channels.clawTexts.length = 0;
	channels.webhookTexts.length = 0;
	channels.clawFailure = undefined;
});

describe("自动化结果发送到 Claw", () => {
	it("成功时发送回复，失败时发送错误", async () => {
		await notifyAutomationFinished(taskWith({ notifyClaw: true }), recordWith("success"), "三件事");
		await notifyAutomationFinished(taskWith({ notifyClaw: true }), recordWith("failed", "model timeout"), "");

		expect(channels.clawTexts).toHaveLength(2);
		expect(channels.clawTexts[0]).toMatch(/^automation:notify\.claw\.message\.success .*"reply":"三件事"/);
		expect(channels.clawTexts[1]).toMatch(/^automation:notify\.claw\.message\.failed .*"error":"model timeout"/);
	});

	it("中止或未开启时不发送", async () => {
		await expect(
			notifyAutomationFinished(taskWith({ notifyClaw: true }), recordWith("aborted"), ""),
		).resolves.toBeUndefined();
		await expect(notifyAutomationFinished(taskWith({}), recordWith("success"), "")).resolves.toBeUndefined();
		expect(channels.clawTexts).toEqual([]);
	});

	it("Claw 收到完整的长回复，webhook 仍截断到 3000 字", async () => {
		const longReply = "长".repeat(5_000);
		const task = taskWith({
			notifyClaw: true,
			notification: { webhookIds: ["team"], when: "always", template: "{{reply}}" },
		});

		await notifyAutomationFinished(task, recordWith("success"), longReply);

		expect(channels.clawTexts[0]).toContain(longReply);
		expect(channels.webhookTexts[0]).toBe(`${"长".repeat(3_000)}…`);
	});

	it("Claw 发送失败记入通知错误，webhook 照常发送", async () => {
		channels.clawFailure = { reason: "no_chat" };
		const task = taskWith({
			notifyClaw: true,
			notification: { webhookIds: ["team"], when: "always", template: "{{name}}" },
		});

		await expect(notifyAutomationFinished(task, recordWith("success"), "ok")).resolves.toBe(
			'automation:notify.claw.no_chat {"detail":""}',
		);
		expect(channels.webhookTexts).toEqual(["晨间简报"]);
	});
});

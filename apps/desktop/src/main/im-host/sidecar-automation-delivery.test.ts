import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SidecarHooks } from "./sidecar-manager.js";

type FakeChild = EventEmitter & { stdin: PassThrough; stdout: PassThrough; stderr: PassThrough };

const spawnedChildren: FakeChild[] = [];

vi.mock("node:child_process", () => ({
	spawn: () => {
		const child = new EventEmitter() as FakeChild & Record<string, unknown>;
		const stdin = new PassThrough();
		child.pid = 4321;
		child.stdout = new PassThrough();
		child.stderr = new PassThrough();
		child.stdin = stdin;
		child.kill = () => {
			setImmediate(() => child.emit("exit", 0, null));
			return true;
		};
		stdin.on("finish", () => setImmediate(() => child.emit("exit", 0, null)));
		child.exitCode = null;
		spawnedChildren.push(child);
		return child;
	},
}));

const { SidecarManager } = await import("./sidecar-manager.js");

function emitFromSidecar(child: FakeChild, event: Record<string, unknown>): void {
	child.stdout.write(`${JSON.stringify(event)}\n`);
}

/** Collects the frames the manager writes to the sidecar's stdin. */
function framesWrittenTo(child: FakeChild): Array<Record<string, unknown>> {
	const frames: Array<Record<string, unknown>> = [];
	child.stdin.on("data", (chunk: Buffer) => {
		for (const line of chunk.toString("utf-8").split("\n")) {
			if (line.trim()) frames.push(JSON.parse(line) as Record<string, unknown>);
		}
	});
	return frames;
}

async function startedManager(
	readyCapabilities: string[] | undefined,
	automationDeliveryTimeoutMs = 5_000,
	hooks: SidecarHooks = {},
) {
	const manager = new SidecarManager({
		readyTimeoutMs: 5_000,
		shutdownGraceMs: 50,
		backoffMs: [60_000],
		automationDeliveryTimeoutMs,
		hooks,
	});
	await manager.start({ binaryPath: "/tmp/im-gateway", conversationCwd: "/tmp/conversation", state: [] });
	const child = spawnedChildren.at(-1) as FakeChild;
	const frames = framesWrittenTo(child);
	const ready = new Promise<void>((resolve) => child.stdout.once("data", () => setImmediate(resolve)));
	emitFromSidecar(child, { type: "ready", version: "test", transport: "stub", capabilities: readyCapabilities });
	await ready;
	return { manager, child, frames };
}

async function waitForDeliveryFrame(frames: Array<Record<string, unknown>>): Promise<Record<string, unknown>> {
	await vi.waitFor(() => expect(frames.some((frame) => frame.type === "automation_delivery")).toBe(true));
	return frames.find((frame) => frame.type === "automation_delivery") as Record<string, unknown>;
}

afterEach(() => {
	spawnedChildren.length = 0;
});

describe("自动化结果投递到 Claw", () => {
	it("按 requestId 收到成功回执后结束等待", async () => {
		const { manager, child, frames } = await startedManager(["automation_delivery"]);

		const delivery = manager.deliverAutomationResult("chat-1", "晨间简报已完成");
		const request = await waitForDeliveryFrame(frames);
		expect(request).toMatchObject({ chatId: "chat-1", text: "晨间简报已完成" });
		emitFromSidecar(child, { type: "automation_delivery_result", requestId: request.requestId, ok: true });

		await expect(delivery).resolves.toBeUndefined();
		await manager.stop();
	});

	it("区分还没有可发送的聊天和渠道发送失败", async () => {
		const { manager, child, frames } = await startedManager(["automation_delivery"]);

		const noChat = manager.deliverAutomationResult("chat-1", "first");
		const noChatRequest = await waitForDeliveryFrame(frames);
		emitFromSidecar(child, {
			type: "automation_delivery_result",
			requestId: noChatRequest.requestId,
			ok: false,
			code: "no_chat",
			error: "no chat to deliver to",
		});
		await expect(noChat).resolves.toEqual({ reason: "no_chat", detail: "no chat to deliver to" });

		frames.length = 0;
		const sendFailed = manager.deliverAutomationResult("chat-1", "second");
		const sendFailedRequest = await waitForDeliveryFrame(frames);
		emitFromSidecar(child, {
			type: "automation_delivery_result",
			requestId: sendFailedRequest.requestId,
			ok: false,
			error: "quota exhausted",
		});
		await expect(sendFailed).resolves.toEqual({ reason: "send_failed", detail: "quota exhausted" });
		await manager.stop();
	});

	it("旧版网关没有声明能力时不发送新帧", async () => {
		const { manager, frames } = await startedManager(undefined);

		await expect(manager.deliverAutomationResult("chat-1", "text")).resolves.toEqual({ reason: "unsupported" });
		expect(frames.some((frame) => frame.type === "automation_delivery")).toBe(false);
		await manager.stop();
	});

	it("网关没有回执或进程退出时标记为未确认", async () => {
		const timedOut = await startedManager(["automation_delivery"], 20);
		await expect(timedOut.manager.deliverAutomationResult("chat-1", "text")).resolves.toEqual({
			reason: "unconfirmed",
		});
		await timedOut.manager.stop();

		const exited = await startedManager(["automation_delivery"]);
		const delivery = exited.manager.deliverAutomationResult("chat-1", "text");
		await waitForDeliveryFrame(exited.frames);
		exited.child.emit("exit", 1, null);
		await expect(delivery).resolves.toEqual({ reason: "unconfirmed" });
		await exited.manager.stop();
	});

	it("把网关提议的接收对话交给宿主", async () => {
		const proposals: unknown[] = [];
		const { manager, child } = await startedManager(["automation_delivery"], 5_000, {
			onDeliveryChat: (event) => proposals.push(event),
		});

		emitFromSidecar(child, { type: "delivery_chat", chatId: "dm-1", userId: "u1", explicit: false });
		await vi.waitFor(() => expect(proposals).toHaveLength(1));
		expect(proposals[0]).toMatchObject({ chatId: "dm-1", userId: "u1", explicit: false });
		await manager.stop();
	});

	it("网关未运行时直接返回离线", async () => {
		const manager = new SidecarManager();
		await expect(manager.deliverAutomationResult("chat-1", "text")).resolves.toEqual({ reason: "offline" });
	});
});

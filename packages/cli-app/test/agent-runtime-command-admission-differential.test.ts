import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	type AgentRpcExecutable,
	type AgentRpcFixture,
	type AgentRpcProcess,
	buildAgentRpcExecutable,
	createAgentRpcFixture,
	readSessionFile,
	startAgentRpc,
	type TestAgentRuntimeBackend,
} from "./support/agent-rpc-test-process.js";
import { startOpenAiResponsesTestServer, textResponseEvents } from "./support/openai-responses-test-server.js";

const BACKENDS = ["legacy", "greenfield-im"] as const satisfies readonly TestAgentRuntimeBackend[];
let executable: AgentRpcExecutable;

beforeAll(async () => {
	executable = await buildAgentRpcExecutable();
});

afterAll(async () => {
	await executable.dispose();
});

describe("Agent Runtime RPC command admission differential", () => {
	it("preserves idle new_session and prompt ordering", async () => {
		const observations = {} as Record<TestAgentRuntimeBackend, IdleAdmissionObservation>;
		for (const backend of BACKENDS) observations[backend] = await runIdleTransitionThenPrompt(backend);

		expect(observations.legacy).toEqual({
			outcome: "completed",
			providerRequestCount: 1,
			queuedPromptReachedProvider: true,
			sourceOwnershipReleased: true,
			targetOwnershipHeld: true,
			identityChanged: true,
		});
		expect(observations["greenfield-im"]).toEqual(observations.legacy);
	}, 30_000);

	it("keeps a prompt received during active-turn new_session off the released source session", async () => {
		const observations = {} as Record<TestAgentRuntimeBackend, AdmissionObservation>;
		for (const backend of BACKENDS) observations[backend] = await runTransitionThenPrompt(backend);

		expect([
			{
				outcome: "failed",
				providerRequestClosed: true,
				providerRequestCount: 1,
				queuedPromptReachedProvider: false,
				sourceOwnershipReleased: true,
				targetOwnershipHeld: true,
				identityChanged: true,
			},
			completedAdmissionObservation(),
		]).toContainEqual(observations.legacy);
		expect(observations["greenfield-im"]).toEqual(completedAdmissionObservation());
	}, 30_000);

	it("keeps abort scoped to the source turn while new_session is pending", async () => {
		const observations = {} as Record<TestAgentRuntimeBackend, AbortDuringTransitionObservation>;
		for (const backend of BACKENDS) observations[backend] = await runTransitionThenAbort(backend);

		expect(observations.legacy).toEqual({
			providerRequestClosed: true,
			providerRequestCount: 1,
			terminalKinds: [],
			sourceOwnershipReleased: true,
			targetOwnershipHeld: true,
			identityChanged: true,
		});
		expect(observations["greenfield-im"]).toEqual(observations.legacy);
	}, 30_000);

	it("finishes an accepted session transition before transport cleanup", async () => {
		const observations = {} as Record<TestAgentRuntimeBackend, TransitionShutdownObservation>;
		for (const backend of BACKENDS) observations[backend] = await runTransitionThenClose(backend);

		expect(observations.legacy).toEqual({
			exitCode: 0,
			providerRequestClosed: true,
			providerRequestCount: 1,
			transitionResponseCount: 1,
			ownershipLockCount: 0,
		});
		expect(observations["greenfield-im"]).toEqual(observations.legacy);
	}, 30_000);

	it("honors an asynchronous Extension shutdown request exactly once", async () => {
		const observations = {} as Record<TestAgentRuntimeBackend, ExtensionShutdownObservation>;
		for (const backend of BACKENDS) observations[backend] = await runExtensionShutdown(backend);

		expect(observations.legacy).toEqual({
			exitCode: 0,
			promptResponseCount: 1,
			audit: ["handler-before", "handler-after", "session-shutdown"],
			ownershipLockCount: 0,
		});
		expect(observations["greenfield-im"]).toEqual(observations.legacy);
	}, 30_000);
});

interface AdmissionObservation {
	readonly outcome: "completed" | "failed";
	readonly providerRequestClosed: boolean;
	readonly providerRequestCount: number;
	readonly queuedPromptReachedProvider: boolean;
	readonly sourceOwnershipReleased: boolean;
	readonly targetOwnershipHeld: boolean;
	readonly identityChanged: boolean;
}

interface IdleAdmissionObservation {
	readonly outcome: "completed" | "failed";
	readonly providerRequestCount: number;
	readonly queuedPromptReachedProvider: boolean;
	readonly sourceOwnershipReleased: boolean;
	readonly targetOwnershipHeld: boolean;
	readonly identityChanged: boolean;
}

interface AbortDuringTransitionObservation {
	readonly providerRequestClosed: boolean;
	readonly providerRequestCount: number;
	readonly terminalKinds: readonly string[];
	readonly sourceOwnershipReleased: boolean;
	readonly targetOwnershipHeld: boolean;
	readonly identityChanged: boolean;
}

interface TransitionShutdownObservation {
	readonly exitCode: number;
	readonly providerRequestClosed: boolean;
	readonly providerRequestCount: number;
	readonly transitionResponseCount: number;
	readonly ownershipLockCount: number;
}

interface ExtensionShutdownObservation {
	readonly exitCode: number;
	readonly promptResponseCount: number;
	readonly audit: readonly string[];
	readonly ownershipLockCount: number;
}

async function runIdleTransitionThenPrompt(backend: TestAgentRuntimeBackend): Promise<IdleAdmissionObservation> {
	let fixture: AgentRpcFixture | undefined;
	let process: AgentRpcProcess | undefined;
	const queuedPrompt = `queued-after-idle-transition-${backend}`;
	const server = await startOpenAiResponsesTestServer(() => ({
		kind: "events",
		events: textResponseEvents("idle queued prompt completed"),
	}));
	try {
		fixture = await createAgentRpcFixture({ baseUrl: server.baseUrl });
		process = startAgentRpc(executable, fixture, { backend });
		const sourcePath = readSessionFile(await process.request("idle-admission-source-state", "get_state"));

		const concurrentMark = process.mark();
		process.send({ id: "idle-admission-new-session", type: "new_session" });
		process.send({ id: "idle-admission-queued-prompt", type: "prompt", message: queuedPrompt });
		await process.waitFor(
			(frame) =>
				frame.type === "response" && frame.id === "idle-admission-new-session" && frame.command === "new_session",
			concurrentMark,
			5_000,
		);
		await process.waitFor(
			(frame) =>
				frame.type === "response" &&
				frame.id === "idle-admission-queued-prompt" &&
				frame.command === "prompt" &&
				frame.success === true,
			concurrentMark,
			5_000,
		);
		const terminal = await process.waitFor(
			(frame) =>
				frame.type === "agent_end" ||
				(frame.type === "response" &&
					frame.id === "idle-admission-queued-prompt" &&
					frame.command === "prompt" &&
					frame.success === false),
			concurrentMark,
			5_000,
		);
		const targetPath = readSessionFile(await process.request("idle-admission-target-state", "get_state"));

		return {
			outcome: terminal.type === "agent_end" ? "completed" : "failed",
			providerRequestCount: server.requests.length,
			queuedPromptReachedProvider: server.requests.some((request) => request.rawBody.includes(queuedPrompt)),
			sourceOwnershipReleased: !existsSync(ownershipPath(backend, sourcePath)),
			targetOwnershipHeld: existsSync(ownershipPath(backend, targetPath)),
			identityChanged: targetPath !== sourcePath,
		};
	} finally {
		await process?.close();
		await fixture?.dispose();
		await server.dispose();
	}
}

async function runTransitionThenPrompt(backend: TestAgentRuntimeBackend): Promise<AdmissionObservation> {
	let fixture: AgentRpcFixture | undefined;
	let process: AgentRpcProcess | undefined;
	const queuedPrompt = `queued-after-transition-${backend}`;
	const server = await startOpenAiResponsesTestServer((_request, index) => {
		if (index === 0) return { kind: "hold", events: textResponseEvents("partial-before-admission").slice(0, 3) };
		return { kind: "events", events: textResponseEvents("queued prompt completed") };
	});
	try {
		fixture = await createAgentRpcFixture({ baseUrl: server.baseUrl });
		process = startAgentRpc(executable, fixture, { backend });
		const sourcePath = readSessionFile(await process.request("admission-source-state", "get_state"));

		const heldMark = process.mark();
		await process.request("admission-held-prompt", "prompt", { message: "Hold before admission transition" });
		await process.waitFor((frame) => frame.type === "message_update", heldMark);
		const concurrentMark = process.mark();
		process.send({ id: "admission-new-session", type: "new_session" });
		process.send({ id: "admission-queued-prompt", type: "prompt", message: queuedPrompt });
		await process.waitFor(
			(frame) =>
				frame.type === "response" && frame.id === "admission-new-session" && frame.command === "new_session",
			concurrentMark,
			5_000,
		);
		await process.waitFor(
			(frame) =>
				frame.type === "response" &&
				frame.id === "admission-queued-prompt" &&
				frame.command === "prompt" &&
				frame.success === true,
			concurrentMark,
			5_000,
		);
		await server.waitForHeldRequestClosed(5_000);
		const terminal = await process.waitFor(
			(frame) =>
				frame.type === "agent_end" ||
				(frame.type === "response" &&
					frame.id === "admission-queued-prompt" &&
					frame.command === "prompt" &&
					frame.success === false),
			concurrentMark,
			5_000,
		);
		const targetPath = readSessionFile(await process.request("admission-target-state", "get_state"));

		return {
			outcome: terminal.type === "agent_end" ? "completed" : "failed",
			providerRequestClosed: true,
			providerRequestCount: server.requests.length,
			queuedPromptReachedProvider: server.requests.some((request) => request.rawBody.includes(queuedPrompt)),
			sourceOwnershipReleased: !existsSync(ownershipPath(backend, sourcePath)),
			targetOwnershipHeld: existsSync(ownershipPath(backend, targetPath)),
			identityChanged: targetPath !== sourcePath,
		};
	} finally {
		await process?.close();
		await fixture?.dispose();
		await server.dispose();
	}
}

async function runTransitionThenAbort(backend: TestAgentRuntimeBackend): Promise<AbortDuringTransitionObservation> {
	let fixture: AgentRpcFixture | undefined;
	let process: AgentRpcProcess | undefined;
	const server = await startOpenAiResponsesTestServer(() => ({
		kind: "hold",
		events: textResponseEvents("partial-before-transition-abort").slice(0, 3),
	}));
	try {
		fixture = await createAgentRpcFixture({ baseUrl: server.baseUrl });
		process = startAgentRpc(executable, fixture, { backend });
		const sourcePath = readSessionFile(await process.request("abort-source-state", "get_state"));

		const heldMark = process.mark();
		await process.request("abort-held-prompt", "prompt", { message: "Hold before transition abort" });
		await process.waitFor((frame) => frame.type === "message_update", heldMark);
		const concurrentMark = process.mark();
		process.send({ id: "abort-new-session", type: "new_session" });
		process.send({ id: "abort-source-turn", type: "abort" });
		await process.waitFor(
			(frame) => frame.type === "response" && frame.id === "abort-new-session" && frame.command === "new_session",
			concurrentMark,
			5_000,
		);
		await process.waitFor(
			(frame) => frame.type === "response" && frame.id === "abort-source-turn" && frame.command === "abort",
			concurrentMark,
			5_000,
		);
		await server.waitForHeldRequestClosed(5_000);
		const targetPath = readSessionFile(await process.request("abort-target-state", "get_state"));

		return {
			providerRequestClosed: true,
			providerRequestCount: server.requests.length,
			terminalKinds: process
				.framesSince(heldMark)
				.flatMap((frame) => (frame.type === "agent_end" ? ["agent_end"] : [])),
			sourceOwnershipReleased: !existsSync(ownershipPath(backend, sourcePath)),
			targetOwnershipHeld: existsSync(ownershipPath(backend, targetPath)),
			identityChanged: targetPath !== sourcePath,
		};
	} finally {
		await process?.close();
		await fixture?.dispose();
		await server.dispose();
	}
}

async function runTransitionThenClose(backend: TestAgentRuntimeBackend): Promise<TransitionShutdownObservation> {
	let fixture: AgentRpcFixture | undefined;
	let process: AgentRpcProcess | undefined;
	const server = await startOpenAiResponsesTestServer(() => ({
		kind: "hold",
		events: textResponseEvents("partial-before-transition-close").slice(0, 3),
	}));
	try {
		fixture = await createAgentRpcFixture({ baseUrl: server.baseUrl });
		process = startAgentRpc(executable, fixture, { backend });
		await process.request("close-source-state", "get_state");

		const heldMark = process.mark();
		await process.request("close-held-prompt", "prompt", { message: "Hold before transition close" });
		await process.waitFor((frame) => frame.type === "message_update", heldMark);
		process.send({ id: "close-new-session", type: "new_session" });
		const exitCode = await process.close();
		await server.waitForHeldRequestClosed(5_000);
		const conversationEntries = await readdir(fixture.conversationDir);

		return {
			exitCode,
			providerRequestClosed: true,
			providerRequestCount: server.requests.length,
			transitionResponseCount: process.frames.filter(
				(frame) => frame.type === "response" && frame.id === "close-new-session" && frame.command === "new_session",
			).length,
			ownershipLockCount: conversationEntries.filter(
				(name) => name.endsWith(".lock") || name.endsWith(".owner.lock"),
			).length,
		};
	} finally {
		await process?.close();
		await fixture?.dispose();
		await server.dispose();
	}
}

async function runExtensionShutdown(backend: TestAgentRuntimeBackend): Promise<ExtensionShutdownObservation> {
	let fixture: AgentRpcFixture | undefined;
	let process: AgentRpcProcess | undefined;
	try {
		fixture = await createAgentRpcFixture();
		const auditPath = `${fixture.root}/${backend}-extension-shutdown.txt`;
		const extensionPath = `${fixture.root}/${backend}-extension-shutdown.ts`;
		await writeFile(
			extensionPath,
			`import { appendFileSync } from "node:fs";
			export default function(extension) {
				extension.registerCommand("async-shutdown", {
					handler: async (_args, ctx) => {
						appendFileSync(${JSON.stringify(auditPath)}, "handler-before\\n", "utf8");
						await Promise.resolve();
						ctx.shutdown();
						appendFileSync(${JSON.stringify(auditPath)}, "handler-after\\n", "utf8");
					},
				});
				extension.on("session_shutdown", async () => {
					appendFileSync(${JSON.stringify(auditPath)}, "session-shutdown\\n", "utf8");
				});
			}`,
			"utf8",
		);
		process = startAgentRpc(executable, fixture, { backend, extraArgs: ["--extension", extensionPath] });
		await process.request("extension-shutdown-state", "get_state");

		const commandMark = process.mark();
		process.send({ id: "extension-shutdown-command", type: "prompt", message: "/async-shutdown" });
		const exitCode = await process.waitForExit();
		const conversationEntries = await readdir(fixture.conversationDir);
		const audit = (await readFile(auditPath, "utf8")).trim().split("\n");

		return {
			exitCode,
			promptResponseCount: process
				.framesSince(commandMark)
				.filter(
					(frame) =>
						frame.type === "response" && frame.id === "extension-shutdown-command" && frame.command === "prompt",
				).length,
			audit,
			ownershipLockCount: conversationEntries.filter(
				(name) => name.endsWith(".lock") || name.endsWith(".owner.lock"),
			).length,
		};
	} finally {
		await process?.close();
		await fixture?.dispose();
	}
}

function ownershipPath(backend: TestAgentRuntimeBackend, sessionPath: string): string {
	return backend === "legacy" ? `${sessionPath}.lock` : `${sessionPath}.owner.lock`;
}

function completedAdmissionObservation(): AdmissionObservation {
	return {
		outcome: "completed",
		providerRequestClosed: true,
		providerRequestCount: 2,
		queuedPromptReachedProvider: true,
		sourceOwnershipReleased: true,
		targetOwnershipHeld: true,
		identityChanged: true,
	};
}

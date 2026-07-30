import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	type AgentRpcExecutable,
	type AgentRpcFixture,
	type AgentRpcProcess,
	buildAgentRpcExecutable,
	createAgentRpcFixture,
	type RpcFrame,
	readSessionFile,
	type StartAgentRpcOptions,
	startAgentRpc,
	type TestAgentRuntimeBackend,
} from "./support/agent-rpc-test-process.js";
import {
	type OpenAiResponsesTestServer,
	type ProviderRequest,
	startOpenAiResponsesTestServer,
	textResponseEvents,
	toolCallResponseEvents,
} from "./support/openai-responses-test-server.js";

const BACKENDS = ["legacy", "greenfield-im"] as const satisfies readonly TestAgentRuntimeBackend[];
let executable: AgentRpcExecutable;

beforeAll(async () => {
	executable = await buildAgentRpcExecutable();
});

afterAll(async () => {
	await executable.dispose();
});

describe("Agent Runtime Provider differential", () => {
	it("preserves the exact Provider request body and ordered tool surface", async () => {
		const observations = await runForBackends(
			async ({ process, server, fixture }) => {
				const mark = process.mark();
				await process.request("prompt-provider-frame", "prompt", {
					message: "Capture the exact Provider request frame",
				});
				await process.waitFor((frame) => frame.type === "agent_end", mark);
				expect(server.requests).toHaveLength(1);
				const request = server.requests[0];
				if (!request) throw new Error("Expected one Provider request");
				return observableProviderRequest(request.body, fixture);
			},
			() => ({ kind: "events", events: textResponseEvents("Provider frame captured.") }),
		);

		expect(providerToolNames(observations["greenfield-im"])).toEqual(providerToolNames(observations.legacy));
		expect(observations["greenfield-im"]).toEqual(observations.legacy);
	}, 30_000);

	it("preserves the IM-consumed streaming text contract", async () => {
		const observations = await runForBackends(
			async ({ process, server }) => {
				const mark = process.mark();
				await expect(process.request("prompt-text", "prompt", { message: "Say hello" })).resolves.toMatchObject({
					type: "response",
					command: "prompt",
					success: true,
				});
				await process.waitFor((frame) => frame.type === "agent_end", mark);
				expect(server.requests).toHaveLength(1);
				return observeFrames(process.framesSince(mark));
			},
			() => ({ kind: "events", events: textResponseEvents("Hello from fixture.") }),
		);

		expect(observations.legacy).toEqual({
			lifecycle: ["agent_start", "turn_start", "turn_end", "agent_end"],
			textDelta: "Hello from fixture.",
			finalText: "Hello from fixture.",
			tools: [],
			sessionPathChanges: [],
		});
		expect(observations["greenfield-im"]).toEqual(observations.legacy);
	});

	it("preserves Tool Call, Tool Result and second model-call behavior", async () => {
		const observations = await runForBackends(
			async ({ process, server, fixture }) => {
				const sourcePath = join(fixture.workspace, "message.txt");
				await writeFile(sourcePath, "tool fixture content", "utf8");
				const mark = process.mark();
				await process.request("prompt-tool", "prompt", { message: "Read message.txt" });
				await process.waitFor((frame) => frame.type === "agent_end", mark);

				expect(
					server.requests,
					JSON.stringify({ frames: process.framesSince(mark), stderr: process.stderr, requests: server.requests }),
				).toHaveLength(2);
				expect(JSON.stringify(server.requests[1]?.body.input)).toContain("tool fixture content");
				return observeFrames(process.framesSince(mark));
			},
			(_request, index, fixture) =>
				index === 0
					? {
							kind: "events",
							events: toolCallResponseEvents("read", {
								path: join(fixture.workspace, "message.txt"),
							}),
						}
					: { kind: "events", events: textResponseEvents("The file was read.") },
		);

		expect(observations.legacy).toMatchObject({
			lifecycle: ["agent_start", "turn_start", "turn_end", "turn_start", "turn_end", "agent_end"],
			finalText: "The file was read.",
			tools: [{ name: "read", isError: false }],
		});
		expect(observations["greenfield-im"]).toEqual(observations.legacy);
	});

	it("preserves in-flight abort behavior and closes the Provider request", async () => {
		const observations = await runForBackends(
			async ({ process, server }) => {
				const mark = process.mark();
				await process.request("prompt-abort", "prompt", { message: "Stream until aborted" });
				await process.waitFor((frame) => frame.type === "message_update", mark);
				await expect(process.request("abort-active", "abort")).resolves.toMatchObject({
					type: "response",
					command: "abort",
					success: true,
				});
				await process.waitFor((frame) => frame.type === "agent_end", mark);
				await server.waitForHeldRequestClosed();
				return observeFrames(process.framesSince(mark));
			},
			() => ({
				kind: "hold",
				events: textResponseEvents("partial").slice(0, 3),
			}),
		);

		expect(observations.legacy.lifecycle.at(0)).toBe("agent_start");
		expect(observations.legacy.lifecycle.at(-1)).toBe("agent_end");
		expect(observations.legacy.textDelta).toBe("partial");
		expect(observations["greenfield-im"]).toEqual(observations.legacy);
	});

	it("preserves the attachment Host Bridge round trip", async () => {
		const observations = await runForBackends(
			async ({ process, server, fixture }) => {
				const attachmentPath = join(fixture.workspace, "artifact.txt");
				await writeFile(attachmentPath, "attachment", "utf8");
				const mark = process.mark();
				await process.request("prompt-attachment", "prompt", { message: "Send artifact.txt" });
				const hostRequest = await process.waitFor((frame) => frame.type === "host_request", mark);
				if (typeof hostRequest.id !== "string") throw new Error("Expected host_request id");
				process.send({
					type: "host_response",
					id: hostRequest.id,
					success: true,
					data: { messageId: "fixture-message-id" },
				});
				await process.waitFor((frame) => frame.type === "agent_end", mark);

				expect(server.requests).toHaveLength(2);
				expect(JSON.stringify(server.requests[1]?.body.input)).toContain("fixture-message-id");
				return observeFrames(process.framesSince(mark));
			},
			(_request, index, fixture) =>
				index === 0
					? {
							kind: "events",
							events: toolCallResponseEvents("im_send_attachment", {
								description: "Send the test artifact",
								path: join(fixture.workspace, "artifact.txt"),
								kind: "file",
							}),
						}
					: { kind: "events", events: textResponseEvents("Attachment sent.") },
		);

		expect(observations.legacy).toMatchObject({
			finalText: "Attachment sent.",
			tools: [{ name: "im_send_attachment", isError: false }],
		});
		expect(observations["greenfield-im"]).toEqual(observations.legacy);
	});

	it("preserves memory rollover identity, session path and ownership release", async () => {
		const observations = await runForBackends(
			async ({ backend, process, server }) => {
				const initialState = await process.request("state-before-rollover", "get_state");
				const sourcePath = readSessionFile(initialState);

				let mark = process.mark();
				await process.request("prompt-rollover-1", "prompt", { message: "First request" });
				await process.waitFor((frame) => frame.type === "agent_end", mark);

				mark = process.mark();
				await process.request("prompt-rollover-2", "prompt", { message: "Second request" });
				await process
					.waitFor((frame) => frame.type === "agent_end", mark, 10_000)
					.catch((error: unknown) => {
						throw new Error(
							JSON.stringify({
								backend,
								error: error instanceof Error ? error.message : String(error),
								frames: process.framesSince(mark),
								requests: describeProviderRequests(server),
							}),
						);
					});
				const pathChange = await process
					.waitFor((frame) => frame.type === "session_path_changed" && typeof frame.to === "string", mark, 5_000)
					.catch((error: unknown) => {
						throw new Error(
							JSON.stringify({
								backend,
								error: error instanceof Error ? error.message : String(error),
								frames: process.framesSince(mark),
								requests: describeProviderRequests(server),
							}),
						);
					});
				const targetPath = pathChange.to;
				if (typeof targetPath !== "string") throw new Error("Expected rollover target path");
				const finalState = await process.request("state-after-rollover", "get_state");

				expect(readSessionFile(finalState)).toBe(targetPath);
				expect(targetPath).not.toBe(sourcePath);
				expect(existsSync(sourcePath)).toBe(true);
				expect(existsSync(targetPath)).toBe(true);
				const targetLock = persistentSessionLockPath(backend, targetPath);
				expect(existsSync(targetLock)).toBe(true);

				await expect(process.close()).resolves.toBe(0);
				expect(existsSync(targetLock)).toBe(false);
				return {
					pathChangeCount: process.framesSince(mark).filter(({ type }) => type === "session_path_changed").length,
					stateFollowsTarget: readSessionFile(finalState) === targetPath,
					lockReleased: !existsSync(targetLock),
				};
			},
			({ body }) => {
				const requestText = JSON.stringify(body.input);
				if (requestText.includes("You maintain a concise long-term MEMORY")) {
					return { kind: "events", events: textResponseEvents("NONE") };
				}
				if (requestText.includes("You are a context summarization assistant")) {
					return {
						kind: "events",
						events: textResponseEvents("<summary>provider rollover summary</summary>"),
					};
				}
				if (requestText.includes("Second request")) {
					return {
						kind: "events",
						events: textResponseEvents("Second response.", { inputTokens: 5_999, outputTokens: 1 }),
					};
				}
				return {
					kind: "events",
					events: textResponseEvents("First response.", { inputTokens: 999, outputTokens: 1 }),
				};
			},
			(fixture) => ({
				extraArgs: ["--memory-mode", "--memory-file", join(fixture.workspace, "MEMORY.md")],
			}),
		);

		expect(observations.legacy).toEqual({
			pathChangeCount: 1,
			stateFollowsTarget: true,
			lockReleased: true,
		});
		expect(observations["greenfield-im"]).toEqual(observations.legacy);
	}, 30_000);
});

type ScenarioHandler = (
	request: Parameters<Parameters<typeof startOpenAiResponsesTestServer>[0]>[0],
	index: number,
	fixture: AgentRpcFixture,
) => ReturnType<Parameters<typeof startOpenAiResponsesTestServer>[0]>;

interface ScenarioContext {
	readonly backend: TestAgentRuntimeBackend;
	readonly fixture: AgentRpcFixture;
	readonly process: AgentRpcProcess;
	readonly server: OpenAiResponsesTestServer;
}

async function runForBackends<T>(
	run: (context: ScenarioContext) => Promise<T>,
	handler: ScenarioHandler,
	resolveStartOptions?: (fixture: AgentRpcFixture, backend: TestAgentRuntimeBackend) => StartAgentRpcOptions,
): Promise<Record<TestAgentRuntimeBackend, T>> {
	const observations = {} as Record<TestAgentRuntimeBackend, T>;
	for (const backend of BACKENDS) {
		let fixture: AgentRpcFixture | undefined;
		let process: AgentRpcProcess | undefined;
		let server: OpenAiResponsesTestServer | undefined;
		try {
			server = await startOpenAiResponsesTestServer((request, index) => {
				if (!fixture) throw new Error("Agent RPC fixture was not initialized");
				return handler(request, index, fixture);
			});
			fixture = await createAgentRpcFixture({ baseUrl: server.baseUrl });
			process = startAgentRpc(executable, fixture, {
				backend,
				...resolveStartOptions?.(fixture, backend),
			});
			observations[backend] = await run({ backend, fixture, process, server });
		} finally {
			await process?.close();
			await fixture?.dispose();
			await server?.dispose();
		}
	}
	return observations;
}

interface RuntimeObservation {
	readonly lifecycle: string[];
	readonly textDelta: string;
	readonly finalText: string;
	readonly tools: Array<{ readonly name: string; readonly isError: boolean }>;
	readonly sessionPathChanges: string[];
}

function observeFrames(frames: readonly RpcFrame[]): RuntimeObservation {
	const lifecycleTypes = new Set(["agent_start", "turn_start", "turn_end", "agent_end"]);
	const lifecycle: string[] = [];
	const tools: Array<{ name: string; isError: boolean }> = [];
	const sessionPathChanges: string[] = [];
	let textDelta = "";
	let finalText = "";

	for (const frame of frames) {
		if (lifecycleTypes.has(frame.type)) lifecycle.push(frame.type);
		if (frame.type === "message_update") {
			const assistantEvent = frame.assistantMessageEvent;
			if (
				typeof assistantEvent === "object" &&
				assistantEvent !== null &&
				Reflect.get(assistantEvent, "type") === "text_delta"
			) {
				const delta = Reflect.get(assistantEvent, "delta");
				if (typeof delta === "string") textDelta += delta;
			}
		}
		if (frame.type === "message_end") {
			const text = readAssistantText(frame.message);
			if (text) finalText = text;
		}
		if (frame.type === "tool_execution_end") {
			tools.push({
				name: typeof frame.toolName === "string" ? frame.toolName : "",
				isError: frame.isError === true,
			});
		}
		if (frame.type === "session_path_changed" && typeof frame.to === "string") {
			sessionPathChanges.push(frame.to);
		}
	}
	return { lifecycle, textDelta, finalText, tools, sessionPathChanges };
}

function readAssistantText(value: unknown): string {
	if (typeof value !== "object" || value === null || Reflect.get(value, "role") !== "assistant") return "";
	const content = Reflect.get(value, "content");
	if (!Array.isArray(content)) return "";
	return content
		.filter(
			(item): item is { readonly type: "text"; readonly text: string } =>
				typeof item === "object" &&
				item !== null &&
				Reflect.get(item, "type") === "text" &&
				typeof Reflect.get(item, "text") === "string",
		)
		.map(({ text }) => text)
		.join("\n");
}

function persistentSessionLockPath(backend: TestAgentRuntimeBackend, sessionPath: string): string {
	return backend === "legacy" ? `${sessionPath}.lock` : `${sessionPath}.owner.lock`;
}

function describeProviderRequests(server: OpenAiResponsesTestServer): readonly string[] {
	return server.requests.map(({ rawBody }) => {
		if (rawBody.includes("You maintain a concise long-term MEMORY")) return "memory-flush";
		if (rawBody.includes("You are a context summarization assistant")) return "compaction-summary";
		if (rawBody.includes("Second request")) return "second-turn";
		if (rawBody.includes("First request")) return "first-turn";
		return "other";
	});
}

function observableProviderRequest(body: ProviderRequest, fixture: AgentRpcFixture): Readonly<Record<string, unknown>> {
	const observation: Record<string, unknown> = { ...body };
	delete observation.prompt_cache_key;
	return normalizeProviderValue(observation, fixture) as Readonly<Record<string, unknown>>;
}

function normalizeProviderValue(value: unknown, fixture: AgentRpcFixture): unknown {
	if (typeof value === "string") {
		return value
			.replaceAll(fixture.root, "<fixture-root>")
			.replace(/^Current date and time: .*$/gm, "Current date and time: <turn-time>");
	}
	if (Array.isArray(value)) return value.map((entry) => normalizeProviderValue(entry, fixture));
	if (typeof value !== "object" || value === null) return value;
	return Object.fromEntries(
		Object.entries(value).map(([key, entry]) => [key, normalizeProviderValue(entry, fixture)]),
	);
}

function providerToolNames(body: Readonly<Record<string, unknown>>): string[] {
	if (!Array.isArray(body.tools)) return [];
	return body.tools.flatMap((tool) => {
		if (typeof tool !== "object" || tool === null) return [];
		const name = Reflect.get(tool, "name");
		return typeof name === "string" ? [name] : [];
	});
}

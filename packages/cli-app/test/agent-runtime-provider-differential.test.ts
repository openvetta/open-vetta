import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	type AgentRpcExecutable,
	type AgentRpcFixture,
	type AgentRpcProcess,
	buildAgentRpcExecutable,
	type CreateAgentRpcFixtureOptions,
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
	type ProviderRequestRecord,
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

	it("preserves Extension context identity, once-per-call execution and transient Tool Loop transforms", async () => {
		const observations = await runForBackends(
			async ({ process, server, fixture }) => {
				const sourcePath = join(fixture.workspace, "context-message.txt");
				await writeFile(sourcePath, "context tool fixture", "utf8");
				const mark = process.mark();
				await process.request("prompt-context-tool", "prompt", { message: "Read context-message.txt" });
				await process.waitFor((frame) => frame.type === "agent_end", mark);

				expect(server.requests).toHaveLength(2);
				const firstInput = JSON.stringify(server.requests[0]?.body.input);
				const secondInput = JSON.stringify(server.requests[1]?.body.input);
				const state = await process.request("state-after-context-tool", "get_state");
				const persistedSession = await readFile(readSessionFile(state), "utf8");
				return {
					inputs: server.requests.map(({ body }) => normalizeProviderValue(body.input, fixture)),
					firstHasCallOne: firstInput.includes("context-call:1"),
					firstHasCustomIdentity: firstInput.includes("custom:fixture-seed"),
					secondHasOnlyCallTwo: secondInput.includes("context-call:2") && !secondInput.includes("context-call:1"),
					transientTransformWasNotPersisted: !persistedSession.includes("context-fixture"),
				};
			},
			(_request, index, fixture) =>
				index === 0
					? {
							kind: "events",
							events: toolCallResponseEvents("read", {
								path: join(fixture.workspace, "context-message.txt"),
							}),
						}
					: { kind: "events", events: textResponseEvents("Context Tool Loop completed.") },
			async (fixture) => ({
				extraArgs: ["--extension", await writeContextDifferentialExtension(fixture)],
			}),
		);

		expect(observations.legacy).toMatchObject({
			firstHasCallOne: true,
			firstHasCustomIdentity: true,
			secondHasOnlyCallTwo: true,
			transientTransformWasNotPersisted: true,
		});
		expect(observations["greenfield-im"]).toEqual(observations.legacy);
	}, 30_000);

	it("preserves context-before-compaction order and restored context through a CLI process restart", async () => {
		const observations = await runForBackends(
			async ({ backend, process, server, fixture }) => {
				let mark = process.mark();
				await process.request("prompt-before-compaction", "prompt", {
					message: "initial-before-compaction",
				});
				await process.waitFor((frame) => frame.type === "agent_end", mark);

				mark = process.mark();
				await process.request("prompt-trigger-compaction", "prompt", {
					message: `trigger-context-compaction ${"x".repeat(5_000)}`,
				});
				await process.waitFor((frame) => frame.type === "agent_end", mark);
				const sessionState = await process.request("state-before-context-restart", "get_state");
				const sessionPath = readSessionFile(sessionState);
				const sessionContent = await readFile(sessionPath, "utf8");
				const compactionFirstKeptKind = describePersistedCompactionFirstKept(sessionContent);
				await process.close();

				const resumed = startAgentRpc(executable, fixture, {
					backend,
					extraArgs: [
						"--extension",
						join(fixture.root, "context-differential-extension.ts"),
						"--session",
						sessionPath,
					],
				});
				try {
					mark = resumed.mark();
					await resumed.request("prompt-after-context-restart", "prompt", {
						message: "after-context-restart",
					});
					await resumed.waitFor((frame) => frame.type === "agent_end", mark);
				} finally {
					await resumed.close();
				}

				const normalRequests = server.requests.filter((request) => !isContextSummarizationRequest(request));
				const compactedRequest = normalRequests.find(({ rawBody }) =>
					rawBody.includes("trigger-context-compaction"),
				);
				const resumedRequest = normalRequests.find(({ rawBody }) => rawBody.includes("after-context-restart"));
				const contextObservations = await readContextDifferentialObservations(fixture);
				return {
					inputs: normalRequests.map(({ body }) => normalizeProviderValue(body.input, fixture)),
					contextIdentities: contextObservations.map(({ identities }) => identities),
					contextObserved: contextObservations.map(({ observed }) => observed),
					agentRequestKinds: normalRequests.map(describeContextBoundaryRequest),
					compactionRequestCount: server.requests.length - normalRequests.length,
					compactionFirstKeptKind,
					contextCallCounts: contextObservations.map(({ call }) => call),
					contextObservedPreCompactionHistory:
						contextObservations[1]?.observed.includes("initial-before-compaction") === true,
					providerReceivedCompactionSummary:
						compactedRequest?.rawBody.includes("fixture compacted history") === true,
					resumedContextRestoredSummaryIdentity:
						contextObservations[2]?.identities.includes("compactionSummary") === true &&
						resumedRequest !== undefined,
				};
			},
			(request) => {
				const input = JSON.stringify(request.body.input);
				if (isContextSummarizationRequest(request)) {
					return {
						kind: "events",
						events: textResponseEvents("<summary>fixture compacted history</summary>"),
					};
				}
				if (input.includes("trigger-context-compaction") || input.includes("after-context-restart")) {
					return { kind: "events", events: textResponseEvents("Context boundary response.") };
				}
				if (input.includes("initial-before-compaction")) {
					return {
						kind: "events",
						events: textResponseEvents("Initial response."),
					};
				}
				return { kind: "events", events: textResponseEvents("Context boundary response.") };
			},
			async (fixture) => {
				await writeFile(
					join(fixture.agentDir, "settings.json"),
					JSON.stringify({
						compaction: { enabled: true, reserveTokens: 100, minFreePercent: 20, keepRecentTokens: 1 },
					}),
					"utf8",
				);
				return { extraArgs: ["--extension", await writeContextDifferentialExtension(fixture)] };
			},
			{ contextWindow: 1_000, maxTokens: 100 },
		);

		expect(observations.legacy).toMatchObject({
			agentRequestKinds: ["initial", "compacted", "resumed"],
			contextCallCounts: [1, 2, 1],
			contextObservedPreCompactionHistory: true,
			providerReceivedCompactionSummary: true,
			resumedContextRestoredSummaryIdentity: true,
		});
		expect(observations.legacy.compactionRequestCount).toBeGreaterThan(0);
		expect(observations["greenfield-im"].contextIdentities).toEqual(observations.legacy.contextIdentities);
		expect(observations["greenfield-im"]).toEqual(observations.legacy);
	}, 40_000);

	it("preserves dynamic image blocking at the final Provider boundary without rewriting history", async () => {
		const observations = await runForBackends(
			async ({ process, server, fixture }) => {
				let mark = process.mark();
				await process.request("prompt-image-visible", "prompt", {
					message: "first-image-visible",
					images: [TEST_IMAGE],
				});
				await process.waitFor((frame) => frame.type === "agent_end", mark);

				await writeImageSettings(fixture, true);
				mark = process.mark();
				await process.request("prompt-image-blocked", "prompt", {
					message: "second-image-blocked",
					images: [TEST_IMAGE],
				});
				await process.waitFor((frame) => frame.type === "agent_end", mark);

				expect(server.requests).toHaveLength(2);
				const firstInput = JSON.stringify(server.requests[0]?.body.input);
				const secondInput = JSON.stringify(server.requests[1]?.body.input);
				const state = await process.request("state-after-image-block", "get_state");
				const persistedSession = await readFile(readSessionFile(state), "utf8");
				return {
					inputs: server.requests.map(({ body }) => normalizeProviderValue(body.input, fixture)),
					firstProviderReceivedImage: firstInput.includes("input_image"),
					secondProviderBlockedAllImages:
						secondInput.includes("Image reading is disabled.") && !secondInput.includes("input_image"),
					historyRetainedImages: persistedSession.includes('"type":"image"'),
				};
			},
			(_request, index) => ({
				kind: "events",
				events: textResponseEvents(index === 0 ? "Visible image response." : "Blocked image response."),
			}),
			async (fixture) => {
				await writeImageSettings(fixture, false);
				return {};
			},
			{ modelInput: ["text", "image"] },
		);

		expect(observations.legacy).toMatchObject({
			firstProviderReceivedImage: true,
			secondProviderBlockedAllImages: true,
			historyRetainedImages: true,
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
	resolveStartOptions?: (
		fixture: AgentRpcFixture,
		backend: TestAgentRuntimeBackend,
	) => Promise<StartAgentRpcOptions> | StartAgentRpcOptions,
	fixtureOptions: CreateAgentRpcFixtureOptions = {},
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
			fixture = await createAgentRpcFixture({ ...fixtureOptions, baseUrl: server.baseUrl });
			process = startAgentRpc(executable, fixture, {
				backend,
				...(await resolveStartOptions?.(fixture, backend)),
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
		const fixtureDirectoryName = basename(fixture.root);
		const fixtureDirectoryIndex = value.toLowerCase().indexOf(fixtureDirectoryName.toLowerCase());
		const normalizedPath =
			fixtureDirectoryIndex >= 0
				? `<fixture-root>${value.slice(fixtureDirectoryIndex + fixtureDirectoryName.length)}`
				: value.replaceAll(fixture.root, "<fixture-root>");
		return normalizedPath.replace(/^Current date and time: .*$/gm, "Current date and time: <turn-time>");
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

const TEST_IMAGE = {
	type: "image",
	data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4ZQAAAAASUVORK5CYII=",
	mimeType: "image/png",
} as const;

async function writeContextDifferentialExtension(fixture: AgentRpcFixture): Promise<string> {
	const path = join(fixture.root, "context-differential-extension.ts");
	const observationPath = join(fixture.root, "context-differential-observations.jsonl");
	await writeFile(
		path,
		`import { appendFileSync } from "node:fs";
		const observationPath = ${JSON.stringify(observationPath)};
		export default function(extension) {
			let contextCalls = 0;
			extension.on("before_agent_start", async (event) => ({
				message: {
					customType: "fixture-seed",
					content: "seed:" + event.prompt,
					display: false,
				},
			}));
			extension.on("context", async (event) => {
				contextCalls += 1;
				const identities = event.messages.map((message) => {
					if (message.role === "custom") return "custom:" + message.customType;
					return message.role;
				});
				const observed = event.messages.flatMap((message) => {
					if (typeof message.content === "string") return [message.content];
					if (!Array.isArray(message.content)) return [];
					return message.content
						.filter((item) => item.type === "text")
						.map((item) => item.text);
				}).join("|");
				appendFileSync(observationPath, JSON.stringify({
					call: contextCalls,
					identities,
					observed,
				}) + "\\n", "utf8");
				return {
					messages: [
						...event.messages,
						{
							role: "custom",
							customType: "context-fixture",
							content: "context-call:" + contextCalls + ";identities:" + identities.join(",") + ";observed:" + observed,
							display: false,
							timestamp: contextCalls,
						},
					],
				};
			});
		}`,
		"utf8",
	);
	return path;
}

interface ContextDifferentialObservation {
	readonly call: number;
	readonly identities: readonly string[];
	readonly observed: string;
}

async function readContextDifferentialObservations(
	fixture: AgentRpcFixture,
): Promise<readonly ContextDifferentialObservation[]> {
	const content = await readFile(join(fixture.root, "context-differential-observations.jsonl"), "utf8");
	return content
		.trim()
		.split("\n")
		.map((line) => readContextDifferentialObservation(JSON.parse(line)));
}

function readContextDifferentialObservation(value: unknown): ContextDifferentialObservation {
	if (typeof value !== "object" || value === null) throw new Error("Invalid context observation");
	const call = Reflect.get(value, "call");
	const identities = Reflect.get(value, "identities");
	const observed = Reflect.get(value, "observed");
	if (
		typeof call !== "number" ||
		!Array.isArray(identities) ||
		!identities.every((identity) => typeof identity === "string") ||
		typeof observed !== "string"
	) {
		throw new Error("Invalid context observation payload");
	}
	return { call, identities, observed };
}

async function writeImageSettings(fixture: AgentRpcFixture, blockImages: boolean): Promise<void> {
	await writeFile(
		join(fixture.agentDir, "settings.json"),
		JSON.stringify({ images: { autoResize: false, maxRecentImages: 1, blockImages } }),
		"utf8",
	);
}

function describeContextBoundaryRequest(request: ProviderRequestRecord): string {
	const input = JSON.stringify(request.body.input);
	if (input.includes("after-context-restart")) return "resumed";
	if (input.includes("trigger-context-compaction")) return "compacted";
	if (input.includes("initial-before-compaction")) return "initial";
	return "other";
}

function isContextSummarizationRequest(request: ProviderRequestRecord): boolean {
	return !Array.isArray(request.body.tools) || request.body.tools.length === 0;
}

function describePersistedCompactionFirstKept(content: string): string {
	const records: unknown[] = content
		.trim()
		.split(/\r?\n/)
		.map((line) => JSON.parse(line));
	let firstKeptEntryId: string | undefined;
	for (const record of records) {
		if (!isRecord(record)) continue;
		if (record.type === "compaction" && typeof record.firstKeptEntryId === "string") {
			firstKeptEntryId = record.firstKeptEntryId;
		}
		if (!isRecord(record.event) || record.event.type !== "context.compacted") continue;
		const compaction = record.event.record;
		if (isRecord(compaction) && typeof compaction.firstKeptEntryId === "string") {
			firstKeptEntryId = compaction.firstKeptEntryId;
		}
	}
	if (!firstKeptEntryId) return "missing";
	for (const record of records) {
		if (!isRecord(record)) continue;
		if (record.id === firstKeptEntryId) return describePersistedEntry(record);
		if (!isRecord(record.documentEntry) || record.documentEntry.id !== firstKeptEntryId) continue;
		return isRecord(record.event) ? describePersistedEvent(record.event) : "unknown-event";
	}
	return "unknown-entry";
}

function describePersistedEntry(entry: Record<string, unknown>): string {
	if (entry.type === "message" && isRecord(entry.message) && typeof entry.message.role === "string") {
		return `message:${entry.message.role}`;
	}
	if (entry.type === "custom_message" && typeof entry.customType === "string") {
		return `context:${entry.customType}:${readPersistedText(entry.content)}`;
	}
	return typeof entry.type === "string" ? entry.type : "unknown-entry";
}

function describePersistedEvent(event: Record<string, unknown>): string {
	if (event.type === "message.appended" && isRecord(event.message) && typeof event.message.role === "string") {
		return `message:${event.message.role}`;
	}
	if (
		(event.type === "context.appended" || event.type === "context.recorded") &&
		isRecord(event.record) &&
		typeof event.record.type === "string"
	) {
		return `context:${event.record.type}:${readPersistedText(event.record.content)}`;
	}
	return typeof event.type === "string" ? event.type : "unknown-event";
}

function readPersistedText(value: unknown): string {
	if (typeof value === "string") return value.slice(0, 40);
	return "non-text";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

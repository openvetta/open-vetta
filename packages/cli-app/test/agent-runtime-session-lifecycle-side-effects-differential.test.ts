import { mkdir, readFile, writeFile } from "node:fs/promises";
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
	readSessionId,
	startAgentRpc,
	type TestAgentRuntimeBackend,
} from "./support/agent-rpc-test-process.js";
import { startOpenAiResponsesTestServer, textResponseEvents } from "./support/openai-responses-test-server.js";

const BACKENDS = ["greenfield-im"] as const satisfies readonly TestAgentRuntimeBackend[];
let executable: AgentRpcExecutable;

beforeAll(async () => {
	executable = await buildAgentRpcExecutable();
}, 60_000);

afterAll(async () => {
	await executable.dispose();
});

describe("real RPC CLI replacement lifecycle side effects differential", () => {
	it("preserves Extension and project Hook ordering across cancellation, replacement and shutdown", async () => {
		const observations = {} as Record<TestAgentRuntimeBackend, LifecycleObservation>;
		for (const backend of BACKENDS) observations[backend] = await runLifecycleScenario(backend);

		expect(observations["greenfield-im"]).toEqual({
			cancelledNewKeptIdentity: true,
			exitCode: 0,
			replacementCommandsSucceeded: true,
			timeline: [
				{
					owner: "hook",
					event: "SessionStart",
					sessionId: "source",
					sessionFile: "source",
					detail: "resume",
				},
				{
					owner: "extension",
					event: "session_before_switch",
					sessionId: "source",
					sessionFile: "source",
					detail: "new",
				},
				{
					owner: "extension",
					event: "session_before_switch",
					sessionId: "source",
					sessionFile: "source",
					detail: "new",
				},
				{
					owner: "hook",
					event: "SessionEnd",
					sessionId: "source",
					sessionFile: "source",
					detail: "clear",
				},
				{
					owner: "extension",
					event: "session_switch",
					sessionId: "new",
					sessionFile: "new",
					previousSessionFile: "source",
					detail: "new",
				},
				{
					owner: "hook",
					event: "SessionStart",
					sessionId: "new",
					sessionFile: "new",
					detail: "clear",
				},
				{
					owner: "extension",
					event: "session_before_switch",
					sessionId: "new",
					sessionFile: "new",
					targetSessionFile: "source",
					detail: "resume",
				},
				{
					owner: "hook",
					event: "SessionEnd",
					sessionId: "new",
					sessionFile: "new",
					detail: "resume",
				},
				{
					owner: "extension",
					event: "session_switch",
					sessionId: "source",
					sessionFile: "source",
					previousSessionFile: "new",
					detail: "resume",
				},
				{
					owner: "hook",
					event: "SessionStart",
					sessionId: "source",
					sessionFile: "source",
					detail: "resume",
				},
				{
					owner: "extension",
					event: "session_before_fork",
					sessionId: "source",
					sessionFile: "source",
				},
				{
					owner: "hook",
					event: "SessionEnd",
					sessionId: "source",
					sessionFile: "source",
					detail: "clear",
				},
				{
					owner: "extension",
					event: "session_fork",
					sessionId: "fork",
					sessionFile: "fork",
					previousSessionFile: "source",
				},
				{
					owner: "hook",
					event: "SessionStart",
					sessionId: "fork",
					sessionFile: "fork",
					detail: "clear",
				},
				{
					owner: "extension",
					event: "session_shutdown",
					sessionId: "fork",
					sessionFile: "fork",
				},
				{
					owner: "hook",
					event: "SessionEnd",
					sessionId: "fork",
					sessionFile: "fork",
					detail: "other",
				},
			],
		});
	}, 120_000);
});

interface LifecycleIdentity {
	readonly id: string;
	readonly path: string;
}

interface LifecycleObservation {
	readonly cancelledNewKeptIdentity: boolean;
	readonly exitCode: number;
	readonly replacementCommandsSucceeded: boolean;
	readonly timeline: readonly unknown[];
}

async function runLifecycleScenario(backend: TestAgentRuntimeBackend): Promise<LifecycleObservation> {
	let fixture: AgentRpcFixture | undefined;
	let process: AgentRpcProcess | undefined;
	const server = await startOpenAiResponsesTestServer((_request, index) => ({
		kind: "events",
		events: textResponseEvents(`lifecycle response ${index}`),
	}));
	try {
		fixture = await createAgentRpcFixture({ baseUrl: server.baseUrl });
		const auditPath = join(fixture.root, `${backend}-lifecycle.jsonl`);
		const cancelPath = join(fixture.root, `${backend}-cancel-next-new`);
		const extensionPath = await writeLifecycleExtension(fixture, auditPath, cancelPath);
		await writeProjectHookConfigs(fixture, auditPath);
		process = startAgentRpc(executable, fixture, {
			backend,
			extraArgs: ["--extension", extensionPath],
			env: { VETTA_TEST_FAIL_HOOK: "SessionEnd" },
		});

		const source = readIdentity(await process.request(`${backend}-source-state`, "get_state"));
		await promptTurn(process, `${backend}-source-prompt`, "source lifecycle prompt");

		await writeFile(cancelPath, "cancel", "utf8");
		const cancelledNew = await process.request(`${backend}-cancelled-new`, "new_session");
		const afterCancellation = readIdentity(await process.request(`${backend}-after-cancel`, "get_state"));

		const newResponse = await process.request(`${backend}-new`, "new_session");
		const created = readIdentity(await process.request(`${backend}-new-state`, "get_state"));
		await promptTurn(process, `${backend}-new-prompt`, "new session lifecycle prompt");

		const switchResponse = await process.request(`${backend}-switch`, "switch_session", {
			sessionPath: source.path,
		});
		await promptTurn(process, `${backend}-resumed-prompt`, "resumed source lifecycle prompt");
		const forkMessages = await process.request(`${backend}-fork-messages`, "get_fork_messages");
		const entryId = readForkEntryId(forkMessages, "resumed source lifecycle prompt");
		const forkResponse = await process.request(`${backend}-fork`, "fork", { entryId });
		const forked = readIdentity(await process.request(`${backend}-fork-state`, "get_state"));
		await promptTurn(process, `${backend}-fork-prompt`, "fork lifecycle prompt");

		const exitCode = await process.close();
		const records = await readAuditRecords(auditPath);
		return {
			cancelledNewKeptIdentity:
				cancelledNew.data?.cancelled === true &&
				afterCancellation.id === source.id &&
				afterCancellation.path === source.path,
			exitCode,
			replacementCommandsSucceeded:
				newResponse.success === true && switchResponse.success === true && forkResponse.success === true,
			timeline: normalizeTimeline(records, { source, new: created, fork: forked }),
		};
	} finally {
		await process?.close();
		await fixture?.dispose();
		await server.dispose();
	}
}

async function promptTurn(process: AgentRpcProcess, id: string, message: string): Promise<void> {
	const mark = process.mark();
	await process.request(id, "prompt", { message });
	const terminal = await process.waitFor(
		(frame) =>
			frame.type === "agent_end" || (frame.type === "response" && frame.id === id && frame.success === false),
		mark,
		30_000,
	);
	if (terminal.type === "response") throw new Error(`Prompt failed: ${String(terminal.error)}`);
}

async function writeLifecycleExtension(
	fixture: AgentRpcFixture,
	auditPath: string,
	cancelPath: string,
): Promise<string> {
	const extensionPath = join(fixture.root, "lifecycle-extension.ts");
	await writeFile(
		extensionPath,
		`import { appendFileSync, existsSync, unlinkSync } from "node:fs";
		const auditPath = ${JSON.stringify(auditPath)};
		const cancelPath = ${JSON.stringify(cancelPath)};
		function write(event, ctx) {
			appendFileSync(auditPath, JSON.stringify({
				owner: "extension",
				event: event.type,
				sessionId: ctx.sessionManager.getSessionId(),
				sessionFile: ctx.sessionManager.getSessionFile(),
				detail: event.reason,
				previousSessionFile: event.previousSessionFile,
				targetSessionFile: event.targetSessionFile,
			}) + "\\n", "utf8");
		}
		export default function(extension) {
			extension.on("session_before_switch", async (event, ctx) => {
				write(event, ctx);
				if (event.reason === "new" && existsSync(cancelPath)) {
					unlinkSync(cancelPath);
					return { cancel: true };
				}
			});
			extension.on("session_switch", async (event, ctx) => { write(event, ctx); });
			extension.on("session_before_fork", async (event, ctx) => { write(event, ctx); });
			extension.on("session_fork", async (event, ctx) => { write(event, ctx); });
			extension.on("session_shutdown", async (event, ctx) => { write(event, ctx); });
		}`,
		"utf8",
	);
	return extensionPath;
}

async function writeProjectHookConfigs(fixture: AgentRpcFixture, auditPath: string): Promise<void> {
	const hookScriptPath = join(fixture.workspace, ".vetta", "lifecycle-hook.cjs");
	const codexDirectory = join(fixture.workspace, ".vetta", ".codex");
	const claudeDirectory = join(fixture.workspace, ".vetta", ".claude");
	await Promise.all([mkdir(codexDirectory, { recursive: true }), mkdir(claudeDirectory, { recursive: true })]);
	await writeFile(
		hookScriptPath,
		`const { appendFileSync, readFileSync } = require("node:fs");
		const input = JSON.parse(readFileSync(0, "utf8"));
		appendFileSync(${JSON.stringify(auditPath)}, JSON.stringify({
			owner: "hook",
			event: input.hook_event_name,
			sessionId: input.session_id,
			sessionFile: input.transcript_path,
			detail: input.source ?? input.reason,
		}) + "\\n", "utf8");
		if (process.env.VETTA_TEST_FAIL_HOOK === input.hook_event_name) process.exitCode = 9;
		`,
		"utf8",
	);
	const command = "bun .vetta/lifecycle-hook.cjs";
	await Promise.all([
		writeFile(
			join(codexDirectory, "hooks.json"),
			JSON.stringify({
				hooks: { SessionStart: [{ hooks: [{ type: "command", command, commandWindows: command }] }] },
			}),
			"utf8",
		),
		writeFile(
			join(claudeDirectory, "settings.json"),
			JSON.stringify({
				hooks: { SessionEnd: [{ hooks: [{ type: "command", command }] }] },
			}),
			"utf8",
		),
	]);
}

function readIdentity(frame: RpcFrame): LifecycleIdentity {
	return { id: readSessionId(frame), path: readSessionFile(frame) };
}

function readForkEntryId(response: unknown, text: string): string {
	if (!isRecord(response) || !isRecord(response.data) || !Array.isArray(response.data.messages)) {
		throw new Error("Expected fork messages");
	}
	for (const message of response.data.messages) {
		if (isRecord(message) && message.text === text && typeof message.entryId === "string") return message.entryId;
	}
	throw new Error(`Fork message was not found: ${text}`);
}

async function readAuditRecords(path: string): Promise<readonly unknown[]> {
	return (await readFile(path, "utf8"))
		.trim()
		.split(/\r?\n/u)
		.filter(Boolean)
		.map((line) => JSON.parse(line) as unknown);
}

function normalizeTimeline(
	records: readonly unknown[],
	identities: Readonly<Record<"source" | "new" | "fork", LifecycleIdentity>>,
): readonly unknown[] {
	const sessionIds = new Map(Object.entries(identities).map(([label, identity]) => [identity.id, label]));
	const sessionFiles = new Map(Object.entries(identities).map(([label, identity]) => [identity.path, label]));
	return records.map((record) => {
		if (!isRecord(record) || typeof record.owner !== "string" || typeof record.event !== "string") {
			throw new Error(`Invalid lifecycle audit record: ${JSON.stringify(record)}`);
		}
		return withoutUndefined({
			owner: record.owner,
			event: record.event,
			sessionId: labelValue(record.sessionId, sessionIds),
			sessionFile: labelValue(record.sessionFile, sessionFiles),
			previousSessionFile: labelValue(record.previousSessionFile, sessionFiles),
			targetSessionFile: labelValue(record.targetSessionFile, sessionFiles),
			detail: record.detail,
		});
	});
}

function labelValue(value: unknown, labels: ReadonlyMap<string, string>): unknown {
	return typeof value === "string" ? (labels.get(value) ?? value) : value;
}

function withoutUndefined(record: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
	return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

import { stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { parseAgentRuntimeSelection } from "../src/agent-runtime-selection.js";
import {
	type AgentRpcExecutable,
	type AgentRpcFixture,
	type AgentRpcProcess,
	buildAgentRpcExecutable,
	createAgentRpcFixture,
	readSessionFile,
	readSessionId,
	startAgentRpc,
} from "./support/agent-rpc-test-process.js";

const fixtures = new Set<AgentRpcFixture>();
const runningProcesses = new Set<AgentRpcProcess>();
let executable: AgentRpcExecutable;

beforeAll(async () => {
	executable = await buildAgentRpcExecutable();
});

afterAll(async () => {
	await executable.dispose();
});

afterEach(async () => {
	await Promise.all([...runningProcesses].map((process) => process.close()));
	runningProcesses.clear();
	await Promise.all([...fixtures].map((fixture) => fixture.dispose()));
	fixtures.clear();
});

describe("Agent Runtime selection", () => {
	it("defaults to Legacy and removes only the explicit host runtime option", () => {
		expect(parseAgentRuntimeSelection(["--mode", "rpc"])).toEqual({
			backend: "legacy",
			agentArgs: ["--mode", "rpc"],
		});
		expect(
			parseAgentRuntimeSelection(["--agent-runtime=greenfield-im", "--mode", "rpc", "--agent-runtime", "legacy"]),
		).toEqual({
			backend: "legacy",
			agentArgs: ["--mode", "rpc"],
		});
		expect(() => parseAgentRuntimeSelection(["--agent-runtime", "unknown"])).toThrow(
			"Unsupported --agent-runtime value",
		);
	});

	it("runs fresh and resumed Greenfield conversations through pure JSONL stdout and releases ownership", async () => {
		const fixture = await createFixture();
		const fresh = await startRpc(fixture);
		const freshState = await fresh.request("fresh-state", "get_state");
		expect(freshState).toMatchObject({
			id: "fresh-state",
			type: "response",
			command: "get_state",
			success: true,
			data: { sessionId: expect.any(String) },
		});
		const sessionFile = readSessionFile(freshState);
		const sessionId = readSessionId(freshState);
		expect(sessionFile.endsWith(".conversation.jsonl")).toBe(true);
		expect(fresh.stderr).toContain("requested=greenfield-im effective=greenfield-im");
		await expect(stat(`${sessionFile}.owner.lock`)).resolves.toBeDefined();
		await expect(fresh.request("abort-idle", "abort")).resolves.toMatchObject({
			id: "abort-idle",
			type: "response",
			command: "abort",
			success: true,
		});
		await expect(fresh.request("flush-disabled-memory", "flush_memory")).resolves.toMatchObject({
			id: "flush-disabled-memory",
			type: "response",
			command: "flush_memory",
			success: true,
			data: { written: 0 },
		});

		await fresh.close();
		await expect(stat(`${sessionFile}.owner.lock`)).rejects.toMatchObject({ code: "ENOENT" });

		const resumed = await startRpc(fixture, ["--session", sessionFile]);
		const resumedState = await resumed.request("resumed-state", "get_state");
		expect(resumedState).toMatchObject({
			id: "resumed-state",
			type: "response",
			command: "get_state",
			success: true,
			data: { sessionId, sessionFile },
		});
		await resumed.close();

		const continued = await startRpc(fixture, ["--continue"]);
		const continuedState = await continued.request("continued-state", "get_state");
		expect(continuedState).toMatchObject({
			id: "continued-state",
			type: "response",
			command: "get_state",
			success: true,
			data: { sessionId, sessionFile },
		});
		expect(continued.stderr).toContain("requested=greenfield-im effective=greenfield-im");
		await continued.close();
	});

	it("creates a Greenfield conversation when continue has no previous session", async () => {
		const fixture = await createFixture();
		const continued = await startRpc(fixture, ["--continue"]);
		const state = await continued.request("empty-continue-state", "get_state");
		expect(state).toMatchObject({
			id: "empty-continue-state",
			type: "response",
			command: "get_state",
			success: true,
			data: { sessionId: expect.any(String) },
		});
		expect(readSessionFile(state).endsWith(".conversation.jsonl")).toBe(true);
		expect(continued.stderr).toContain("requested=greenfield-im effective=greenfield-im");
		await continued.close();
	});

	it("preserves the startup lock-conflict wire contract", async () => {
		const fixture = await createFixture();
		const owner = await startRpc(fixture);
		const ownerState = await owner.request("owner-state", "get_state");
		const sessionFile = readSessionFile(ownerState);

		const conflicting = await startRpc(fixture, ["--session", sessionFile]);
		const conflict = await conflicting.waitFor((frame) => frame.type === "response" && frame.command === "startup");
		expect(conflict).toMatchObject({
			type: "response",
			command: "startup",
			success: false,
			error: expect.stringContaining("already owned"),
			lockHolder: {
				pid: expect.any(Number),
				hostname: expect.any(String),
				openedAt: expect.any(String),
			},
		});
		expect(await conflicting.waitForExit()).toBe(2);

		await owner.close();
	});

	it("falls back to Legacy for an existing Legacy session without rebuilding the host bootstrap", async () => {
		const fixture = await createFixture();
		const legacySession = join(fixture.conversationDir, "legacy.jsonl");
		await writeFile(
			legacySession,
			`${JSON.stringify({
				type: "session",
				version: 3,
				id: "legacy-session",
				timestamp: new Date().toISOString(),
				cwd: fixture.workspace,
			})}\n${JSON.stringify({
				type: "message",
				id: "legacy-user",
				parentId: null,
				timestamp: new Date().toISOString(),
				message: { role: "user", content: "legacy", timestamp: Date.now() },
			})}\n`,
			"utf8",
		);

		const legacy = await startRpc(fixture, ["--session", legacySession]);
		const state = await legacy.request("legacy-state", "get_state");
		expect(state).toMatchObject({
			id: "legacy-state",
			type: "response",
			command: "get_state",
			success: true,
			data: { sessionId: "legacy-session", sessionFile: legacySession },
		});
		await legacy.close();
		expect(legacy.stderr).toContain("using Legacy runtime");
		expect(legacy.stderr).toContain("fallback=legacy-session");

		const continued = await startRpc(fixture, ["--continue"]);
		const continuedState = await continued.request("legacy-continue-state", "get_state");
		expect(continuedState).toMatchObject({
			id: "legacy-continue-state",
			type: "response",
			command: "get_state",
			success: true,
			data: { sessionId: "legacy-session", sessionFile: legacySession },
		});
		await continued.close();
		expect(continued.stderr).toContain("fallback=legacy-session");
	});
});

async function createFixture(): Promise<AgentRpcFixture> {
	const fixture = await createAgentRpcFixture();
	fixtures.add(fixture);
	return fixture;
}

async function startRpc(fixture: AgentRpcFixture, extraArgs: readonly string[] = []): Promise<AgentRpcProcess> {
	const process = startAgentRpc(executable, fixture, { extraArgs });
	runningProcesses.add(process);
	return process;
}

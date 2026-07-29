import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface, type Interface } from "node:readline";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { parseAgentRuntimeSelection } from "../src/agent-runtime-selection.js";

const temporaryDirectories: string[] = [];
const runningProcesses = new Set<RpcChild>();
const sourceEntryPath = fileURLToPath(new URL("../src/agent-rpc-cli.ts", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
let executableDirectory: string;
let executablePath: string;

beforeAll(async () => {
	executableDirectory = await mkdtemp(join(tmpdir(), "vetta-agent-rpc-executable-"));
	executablePath = join(executableDirectory, "agent-rpc.mjs");
	await runCommand("bun", ["build", sourceEntryPath, "--target", "bun", "--outfile", executablePath], repositoryRoot);
	await copyFile(
		join(repositoryRoot, "packages", "coding-agent", "package.json"),
		join(executableDirectory, "package.json"),
	);
});

afterAll(async () => {
	await rm(executableDirectory, { force: true, recursive: true });
});

afterEach(async () => {
	await Promise.all([...runningProcesses].map((process) => process.close()));
	for (const directory of temporaryDirectories.splice(0).reverse()) {
		await rm(directory, { force: true, recursive: true });
	}
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
	});

	it("preserves the startup lock-conflict wire contract", async () => {
		const fixture = await createFixture();
		const owner = await startRpc(fixture);
		const ownerState = await owner.request("owner-state", "get_state");
		const sessionFile = readSessionFile(ownerState);

		const conflicting = await startRpc(fixture, ["--session", sessionFile]);
		const conflict = await conflicting.readFrame();
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
	});
});

interface TestFixture {
	readonly root: string;
	readonly agentDir: string;
	readonly workspace: string;
	readonly conversationDir: string;
}

async function createFixture(): Promise<TestFixture> {
	const root = await mkdtemp(join(tmpdir(), "vetta-agent-runtime-selection-"));
	temporaryDirectories.push(root);
	const fixture = {
		root,
		agentDir: join(root, "agent"),
		workspace: join(root, "workspace"),
		conversationDir: join(root, "conversations"),
	};
	await Promise.all([
		mkdir(fixture.agentDir, { recursive: true }),
		mkdir(fixture.workspace, { recursive: true }),
		mkdir(fixture.conversationDir, { recursive: true }),
	]);
	await Promise.all([
		writeFile(
			join(fixture.agentDir, "models.json"),
			JSON.stringify({
				providers: {
					test: {
						baseUrl: "http://127.0.0.1:1",
						api: "openai-responses",
						models: [
							{
								id: "test-model",
								name: "Test Model",
								reasoning: true,
								input: ["text"],
								cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
								contextWindow: 8_000,
								maxTokens: 1_000,
							},
						],
					},
				},
			}),
			"utf8",
		),
		writeFile(
			join(fixture.agentDir, "auth.json"),
			JSON.stringify({ test: { type: "api_key", key: "test-key" } }),
			"utf8",
		),
	]);
	return fixture;
}

async function startRpc(fixture: TestFixture, extraArgs: readonly string[] = []): Promise<RpcChild> {
	const child = new RpcChild(
		spawn(
			"bun",
			[
				executablePath,
				"--agent-runtime",
				"greenfield-im",
				"--mode",
				"rpc",
				"--enable-host-bridge",
				"--scenario",
				"im-claw",
				"--session-dir",
				fixture.conversationDir,
				"--provider",
				"test",
				"--model",
				"test-model",
				"--offline",
				"--no-extensions",
				"--no-skills",
				"--no-prompt-templates",
				"--no-themes",
				...extraArgs,
			],
			{
				cwd: fixture.workspace,
				env: { ...process.env, VETTA_CODING_AGENT_DIR: fixture.agentDir },
				stdio: "pipe",
			},
		),
	);
	runningProcesses.add(child);
	return child;
}

async function runCommand(command: string, args: readonly string[], cwd: string): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
		let stderr = "";
		child.stderr.setEncoding("utf8");
		child.stderr.on("data", (chunk: string) => {
			stderr += chunk;
		});
		child.once("error", reject);
		child.once("exit", (code, signal) => {
			if (code === 0) resolve();
			else reject(new Error(`Command failed with code ${code}, signal ${signal}\n${stderr}`));
		});
	});
}

class RpcChild {
	readonly child: ChildProcessWithoutNullStreams;
	readonly lines: Interface;
	readonly iterator: AsyncIterator<string>;
	stderr = "";
	private exitPromise: Promise<number>;
	private closed = false;

	constructor(child: ChildProcessWithoutNullStreams) {
		this.child = child;
		this.lines = createInterface({ input: child.stdout });
		this.iterator = this.lines[Symbol.asyncIterator]();
		child.stderr.setEncoding("utf8");
		child.stderr.on("data", (chunk: string) => {
			this.stderr += chunk;
		});
		this.exitPromise = new Promise<number>((resolve, reject) => {
			child.once("error", reject);
			child.once("exit", (code, signal) => {
				if (signal) reject(new Error(`RPC child exited with signal ${signal}\n${this.stderr}`));
				else resolve(code ?? 1);
			});
		});
	}

	async request(id: string, type: string): Promise<RpcFrame> {
		this.child.stdin.write(`${JSON.stringify({ id, type })}\n`);
		return this.readFrame();
	}

	async readFrame(): Promise<RpcFrame> {
		let timeout: ReturnType<typeof setTimeout> | undefined;
		const timeoutPromise = new Promise<never>((_, reject) => {
			timeout = setTimeout(() => reject(new Error(`Timed out waiting for RPC frame\n${this.stderr}`)), 20_000);
		});
		const result = await Promise.race([this.iterator.next(), timeoutPromise]).finally(() => {
			if (timeout) clearTimeout(timeout);
		});
		if (result.done) throw new Error(`RPC stdout closed before a frame was received\n${this.stderr}`);
		const parsed: unknown = JSON.parse(result.value);
		if (!isRpcFrame(parsed)) throw new Error(`RPC stdout line was not an object: ${result.value}`);
		return parsed;
	}

	async waitForExit(): Promise<number> {
		return this.exitPromise;
	}

	async close(): Promise<void> {
		if (this.closed) return;
		this.closed = true;
		if (this.child.exitCode === null) this.child.stdin.end();
		await this.exitPromise;
		this.lines.close();
		runningProcesses.delete(this);
	}
}

interface RpcFrame {
	readonly [key: string]: unknown;
	readonly type: string;
	readonly data?: { readonly [key: string]: unknown };
}

function isRpcFrame(value: unknown): value is RpcFrame {
	return typeof value === "object" && value !== null && typeof Reflect.get(value, "type") === "string";
}

function readSessionFile(frame: RpcFrame): string {
	const sessionFile = frame.data?.sessionFile;
	if (typeof sessionFile !== "string") throw new Error("Expected RPC state to include sessionFile");
	return sessionFile;
}

function readSessionId(frame: RpcFrame): string {
	const sessionId = frame.data?.sessionId;
	if (typeof sessionId !== "string") throw new Error("Expected RPC state to include sessionId");
	return sessionId;
}

import { spawn } from "node:child_process";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type AgentRpcFixture, createAgentRpcFixture } from "./support/agent-rpc-test-process.js";
import { startOpenAiResponsesTestServer, textResponseEvents } from "./support/openai-responses-test-server.js";

interface AgentCliResult {
	readonly code: number;
	readonly stdout: string;
	readonly stderr: string;
}

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const sourceEntryPath = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
let executable: AgentCliExecutable;

interface AgentCliExecutable {
	readonly path: string;
	dispose(): Promise<void>;
}

beforeAll(async () => {
	executable = await buildAgentCliExecutable();
});

afterAll(async () => {
	await executable.dispose();
});

describe("Agent non-RPC CLI compatibility", () => {
	it("keeps explicit text print on the Legacy session path", async () => {
		const marker = "explicit text print response";
		const server = await startOpenAiResponsesTestServer(() => ({
			kind: "events",
			events: textResponseEvents(marker),
		}));
		const fixture = await createAgentRpcFixture({ baseUrl: server.baseUrl });
		try {
			const result = await runAgentCli(fixture, ["--print", "reply in text"]);

			expect(result.code).toBe(0);
			expect(result.stdout).toContain(marker);
			expect(result.stderr).toContain("requested=legacy effective=legacy");
			expect(server.requests).toHaveLength(1);
		} finally {
			await fixture.dispose();
			await server.dispose();
		}
	}, 30_000);

	it("keeps JSON print as a JSONL event stream", async () => {
		const marker = "JSON print response";
		const server = await startOpenAiResponsesTestServer(() => ({
			kind: "events",
			events: textResponseEvents(marker),
		}));
		const fixture = await createAgentRpcFixture({ baseUrl: server.baseUrl });
		try {
			const result = await runAgentCli(fixture, ["--mode", "json", "reply in JSON"]);
			const frames = result.stdout.split(/\r?\n/).flatMap((line) => parseJsonLine(line));

			expect(result.code).toBe(0);
			expect(frames.length).toBeGreaterThan(1);
			expect(result.stdout).toContain(marker);
			expect(result.stderr).toContain("requested=legacy effective=legacy");
		} finally {
			await fixture.dispose();
			await server.dispose();
		}
	}, 30_000);

	it("keeps piped stdin print-compatible without an explicit mode", async () => {
		const marker = "piped stdin response";
		const server = await startOpenAiResponsesTestServer(() => ({
			kind: "events",
			events: textResponseEvents(marker),
		}));
		const fixture = await createAgentRpcFixture({ baseUrl: server.baseUrl });
		try {
			const result = await runAgentCli(fixture, ["agent"], "reply from stdin\n");

			expect(result.code).toBe(0);
			expect(result.stdout).toContain(marker);
			expect(result.stderr).toContain("requested=legacy effective=legacy");
			expect(server.requests).toHaveLength(1);
		} finally {
			await fixture.dispose();
			await server.dispose();
		}
	}, 30_000);

	it("runs help as a control command without entering session runtime selection", async () => {
		const fixture = await createAgentRpcFixture();
		try {
			const result = await runAgentCli(fixture, ["agent", "--help"]);

			expect(result.code).toBe(0);
			expect(result.stdout).toContain("Usage:");
			expect(result.stderr).not.toContain("[agent-runtime]");
		} finally {
			await fixture.dispose();
		}
	}, 30_000);
});

async function runAgentCli(
	fixture: AgentRpcFixture,
	extraArgs: readonly string[],
	stdin = "",
): Promise<AgentCliResult> {
	return new Promise<AgentCliResult>((resolve, reject) => {
		const explicitAgentCommand = extraArgs[0] === "agent";
		const agentArgs = explicitAgentCommand ? extraArgs.slice(1) : extraArgs;
		const child = spawn(
			"bun",
			[
				executable.path,
				...(explicitAgentCommand ? ["agent"] : []),
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
				...agentArgs,
			],
			{
				cwd: fixture.workspace,
				env: {
					...process.env,
					VETTA_CODING_AGENT_DIR: fixture.agentDir,
					VETTA_PACKAGE_DIR: join(repositoryRoot, "packages", "coding-agent"),
				},
				stdio: "pipe",
			},
		);
		let stdout = "";
		let stderr = "";
		const timeout = setTimeout(() => child.kill(), 20_000);
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk: string) => {
			stderr += chunk;
		});
		child.once("error", reject);
		child.once("exit", (code, signal) => {
			clearTimeout(timeout);
			if (signal) reject(new Error(`Agent CLI exited with signal ${signal}\n${stderr}`));
			else resolve({ code: code ?? 1, stdout, stderr });
		});
		child.stdin.end(stdin);
	});
}

function parseJsonLine(line: string): readonly unknown[] {
	try {
		return [JSON.parse(line) as unknown];
	} catch {
		return [];
	}
}

async function buildAgentCliExecutable(): Promise<AgentCliExecutable> {
	const directory = await mkdtemp(join(tmpdir(), "vetta-agent-cli-executable-"));
	const path = join(directory, "vetta.mjs");
	try {
		await runCommand("bun", ["build", sourceEntryPath, "--target", "bun", "--outfile", path], repositoryRoot);
		await copyFile(join(repositoryRoot, "packages", "coding-agent", "package.json"), join(directory, "package.json"));
		return {
			path,
			dispose: () => rm(directory, { force: true, recursive: true }),
		};
	} catch (error) {
		await rm(directory, { force: true, recursive: true });
		throw error;
	}
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

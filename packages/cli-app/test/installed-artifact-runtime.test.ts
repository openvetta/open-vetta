import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, copyFile, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import {
	type AgentRpcFixture,
	AgentRpcProcess,
	createAgentRpcFixture,
	readSessionFile,
	readSessionId,
} from "./support/agent-rpc-test-process.js";
import {
	type OpenAiResponsesTestServer,
	startOpenAiResponsesTestServer,
	textResponseEvents,
	toolCallResponseEvents,
} from "./support/openai-responses-test-server.js";

const READ_PROMPT = "INSTALLED_ARTIFACT_READ_PROMPT";
const MCP_PROMPT = "INSTALLED_ARTIFACT_MCP_PROMPT";
const SKILL_MARKER = "INSTALLED_ARTIFACT_SKILL_MARKER";
const MCP_DESCRIPTION = "Installed artifact MCP restart canary";
const MCP_RESULT = "INSTALLED_MCP_RESULT:restart";
const FILE_CONTENT = "installed artifact file content";
const MCP_TOOL_NAME = "mcp_installed_canary_echo";
const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const compileScriptPath = fileURLToPath(new URL("../scripts/compile-standalone.mjs", import.meta.url));
const compileTargetByPlatform = {
	"darwin-arm64": "bun-darwin-arm64",
	"darwin-x64": "bun-darwin-x64",
	"linux-arm64": "bun-linux-arm64",
	"linux-x64": "bun-linux-x64",
	"win32-x64": "bun-windows-x64",
} as const;

const MetafileSchema = z
	.object({
		outputs: z.record(
			z.string(),
			z
				.object({
					imports: z
						.array(
							z
								.object({
									external: z.boolean().optional(),
									kind: z.string(),
									path: z.string(),
								})
								.loose(),
						)
						.default([]),
				})
				.loose(),
		),
	})
	.loose();

interface InstalledCliArtifact {
	readonly binaryPath: string;
	readonly buildMetafilePath: string;
	readonly installDir: string;
	readonly root: string;
	dispose(): Promise<void>;
}

let artifact: InstalledCliArtifact;
let activeProcess: AgentRpcProcess | undefined;
let fixture: AgentRpcFixture | undefined;
let providerServer: OpenAiResponsesTestServer | undefined;

beforeAll(async () => {
	artifact = await buildInstalledCliArtifact();
}, 120_000);

afterAll(async () => {
	await artifact.dispose();
});

afterEach(async () => {
	await activeProcess?.close();
	activeProcess = undefined;
	await fixture?.dispose();
	fixture = undefined;
	await providerServer?.dispose();
	providerServer = undefined;
});

describe("installed standalone CLI artifact", () => {
	it("loads host capabilities and resumes one conversation across two executable processes", async () => {
		await expectStandaloneArtifact(artifact);

		let workspaceFilePath = "";
		providerServer = await startOpenAiResponsesTestServer((request) => {
			if (request.rawBody.includes(MCP_PROMPT)) {
				return request.rawBody.includes(MCP_RESULT)
					? { kind: "events", events: textResponseEvents("MCP completed after restart.") }
					: {
							kind: "events",
							events: toolCallResponseEvents(MCP_TOOL_NAME, { value: "restart" }, { callId: "call_mcp" }),
						};
			}
			if (request.rawBody.includes(READ_PROMPT)) {
				return request.rawBody.includes(FILE_CONTENT)
					? { kind: "events", events: textResponseEvents("Read completed before restart.") }
					: {
							kind: "events",
							events: toolCallResponseEvents("read", { path: workspaceFilePath }, { callId: "call_read" }),
						};
			}
			throw new Error(`Unexpected installed-artifact Provider request: ${request.rawBody}`);
		});

		fixture = await createAgentRpcFixture({ baseUrl: providerServer.baseUrl });
		workspaceFilePath = join(fixture.workspace, "installed-artifact.txt");
		await writeFile(workspaceFilePath, FILE_CONTENT, "utf8");
		const skillPath = await writeInstalledSkill(fixture);
		await writeInstalledMcpServer(fixture);
		const isolatedEnv = createIsolatedArtifactEnv(fixture);
		expect(isOutside(repositoryRoot, artifact.binaryPath)).toBe(true);
		expect(isOutside(repositoryRoot, fixture.workspace)).toBe(true);
		expect(
			Object.values(isolatedEnv).some(
				(value) => typeof value === "string" && value.toLowerCase().includes(repositoryRoot.toLowerCase()),
			),
		).toBe(false);

		activeProcess = startInstalledCli(artifact.binaryPath, fixture, skillPath, isolatedEnv);
		const initialState = await activeProcess.request("installed-state-a", "get_state");
		const sessionFile = readSessionFile(initialState);
		const sessionId = readSessionId(initialState);
		const ownershipLock = `${sessionFile}.owner.lock`;
		expect(existsSync(ownershipLock)).toBe(true);

		const firstTurnMark = activeProcess.mark();
		await activeProcess.request("installed-read", "prompt", {
			message: `${READ_PROMPT}: read installed-artifact.txt`,
		});
		await activeProcess.waitFor((frame) => frame.type === "agent_end", firstTurnMark, 30_000);
		expect(providerServer.requests).toHaveLength(2);
		expect(providerServer.requests[0]?.rawBody).toContain(SKILL_MARKER);
		expect(readToolDescription(providerServer.requests[0]?.body.tools, "read")).not.toBe("");
		expect(JSON.stringify(providerServer.requests[1]?.body.input)).toContain(FILE_CONTENT);
		expect(
			activeProcess
				.framesSince(firstTurnMark)
				.some(
					(frame) => frame.type === "tool_execution_end" && frame.toolName === "read" && frame.isError !== true,
				),
		).toBe(true);

		await expect(activeProcess.close()).resolves.toBe(0);
		activeProcess = undefined;
		await expect(stat(ownershipLock)).rejects.toMatchObject({ code: "ENOENT" });

		activeProcess = startInstalledCli(artifact.binaryPath, fixture, skillPath, isolatedEnv, [
			"--session",
			sessionFile,
		]);
		const resumedState = await activeProcess.request("installed-state-b", "get_state");
		expect(readSessionFile(resumedState)).toBe(sessionFile);
		expect(readSessionId(resumedState)).toBe(sessionId);
		expect(existsSync(ownershipLock)).toBe(true);

		const secondTurnMark = activeProcess.mark();
		await activeProcess.request("installed-mcp", "prompt", {
			message: `${MCP_PROMPT}: call the installed canary with restart`,
		});
		await activeProcess.waitFor((frame) => frame.type === "agent_end", secondTurnMark, 30_000);
		expect(providerServer.requests).toHaveLength(4);
		expect(readToolDescription(providerServer.requests[2]?.body.tools, MCP_TOOL_NAME)).toBe(MCP_DESCRIPTION);
		expect(providerServer.requests[2]?.rawBody).toContain(SKILL_MARKER);
		expect(JSON.stringify(providerServer.requests[3]?.body.input)).toContain(MCP_RESULT);
		expect(
			activeProcess
				.framesSince(secondTurnMark)
				.some(
					(frame) =>
						frame.type === "tool_execution_end" && frame.toolName === MCP_TOOL_NAME && frame.isError !== true,
				),
		).toBe(true);

		await expect(activeProcess.close()).resolves.toBe(0);
		activeProcess = undefined;
		await expect(stat(ownershipLock)).rejects.toMatchObject({ code: "ENOENT" });
		const conversation = await readFile(sessionFile, "utf8");
		expect(conversation).toContain(READ_PROMPT);
		expect(conversation).toContain("Read completed before restart.");
		expect(conversation).toContain(MCP_PROMPT);
		expect(conversation).toContain("MCP completed after restart.");
	}, 120_000);
});

async function buildInstalledCliArtifact(): Promise<InstalledCliArtifact> {
	const root = await mkdtemp(join(tmpdir(), "vetta-installed-cli-artifact-"));
	const buildDir = join(root, "build");
	const installDir = join(root, "install");
	const binaryName = process.platform === "win32" ? "vetta.exe" : "vetta";
	const buildBinaryPath = join(buildDir, binaryName);
	const binaryPath = join(installDir, binaryName);
	const buildMetafilePath = join(buildDir, "metafile.json");
	const platformTag = `${process.platform}-${process.arch}` as keyof typeof compileTargetByPlatform;
	const compileTarget = compileTargetByPlatform[platformTag];
	if (!compileTarget) throw new Error(`Unsupported installed-artifact test platform: ${platformTag}`);
	try {
		await Promise.all([mkdir(buildDir, { recursive: true }), mkdir(installDir, { recursive: true })]);
		await runCommand("bun", [
			compileScriptPath,
			"--target",
			compileTarget,
			"--outfile",
			buildBinaryPath,
			"--metafile",
			buildMetafilePath,
		]);
		await copyFile(buildBinaryPath, binaryPath);
		if (process.platform !== "win32") await chmod(binaryPath, 0o755);
		return {
			binaryPath,
			buildMetafilePath,
			installDir,
			root,
			dispose: () => rm(root, { force: true, recursive: true }),
		};
	} catch (error) {
		await rm(root, { force: true, recursive: true });
		throw error;
	}
}

async function expectStandaloneArtifact(installed: InstalledCliArtifact): Promise<void> {
	expect(await readdir(installed.installDir)).toEqual([process.platform === "win32" ? "vetta.exe" : "vetta"]);
	expect((await stat(installed.binaryPath)).size).toBeGreaterThan(0);
	const metafile = MetafileSchema.parse(JSON.parse(await readFile(installed.buildMetafilePath, "utf8")));
	const externalImports = Object.values(metafile.outputs)
		.flatMap(({ imports }) => imports)
		.filter(({ external }) => external === true);
	expect(externalImports).toEqual([]);
}

async function writeInstalledSkill(currentFixture: AgentRpcFixture): Promise<string> {
	const skillDir = join(currentFixture.root, "host-skill");
	const skillPath = join(skillDir, "SKILL.md");
	await mkdir(skillDir, { recursive: true });
	await writeFile(
		skillPath,
		[
			"---",
			"name: installed-artifact-skill",
			`description: ${SKILL_MARKER}`,
			"---",
			"",
			"# Installed artifact skill",
			"",
			`Use this host-provided instruction marker: ${SKILL_MARKER}.`,
			"",
		].join("\n"),
		"utf8",
	);
	return skillPath;
}

async function writeInstalledMcpServer(currentFixture: AgentRpcFixture): Promise<void> {
	const serverPath = join(currentFixture.root, "installed-mcp-server.mjs");
	await writeFile(
		serverPath,
		[
			'import { createInterface } from "node:readline";',
			"",
			"const lines = createInterface({ input: process.stdin });",
			"for await (const line of lines) {",
			"\tconst request = JSON.parse(line);",
			'\tif (!Object.hasOwn(request, "id")) continue;',
			"\tlet result;",
			'\tif (request.method === "initialize") {',
			"\t\tresult = {",
			'\t\t\tprotocolVersion: request.params?.protocolVersion ?? "2024-11-05",',
			"\t\t\tcapabilities: { tools: {} },",
			'\t\t\tserverInfo: { name: "installed-canary", version: "1.0.0" },',
			"\t\t};",
			'\t} else if (request.method === "tools/list") {',
			"\t\tresult = {",
			"\t\t\ttools: [{",
			'\t\t\t\tname: "echo",',
			`\t\t\t\tdescription: ${JSON.stringify(MCP_DESCRIPTION)},`,
			"\t\t\t\tinputSchema: {",
			'\t\t\t\t\ttype: "object",',
			'\t\t\t\t\tproperties: { value: { type: "string" } },',
			'\t\t\t\t\trequired: ["value"],',
			"\t\t\t\t\tadditionalProperties: false,",
			"\t\t\t\t},",
			"\t\t\t}],",
			"\t\t};",
			'\t} else if (request.method === "tools/call") {',
			'\t\tconst value = typeof request.params?.arguments?.value === "string" ? request.params.arguments.value : "";',
			`\t\tresult = { content: [{ type: "text", text: ${JSON.stringify(`${MCP_RESULT.slice(0, -7)}`)} + value }] };`,
			"\t} else {",
			"\t\tresult = {};",
			"\t}",
			'\tprocess.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }) + "\\n");',
			"}",
			"",
		].join("\n"),
		"utf8",
	);
	await writeFile(
		join(currentFixture.agentDir, "mcp.json"),
		JSON.stringify({
			mcpServers: {
				installed_canary: {
					args: [serverPath],
					command: process.execPath,
					startupTimeout: 10_000,
				},
			},
		}),
		"utf8",
	);
}

function createIsolatedArtifactEnv(currentFixture: AgentRpcFixture): NodeJS.ProcessEnv {
	const env: NodeJS.ProcessEnv = {};
	for (const key of [
		"APPDATA",
		"ComSpec",
		"LANG",
		"LC_ALL",
		"LOCALAPPDATA",
		"NO_PROXY",
		"PATHEXT",
		"SystemRoot",
		"TEMP",
		"TMP",
		"TMPDIR",
		"WINDIR",
	]) {
		const value = process.env[key];
		if (value !== undefined) env[key] = value;
	}
	env.PATH = (process.env.PATH ?? "")
		.split(delimiter)
		.filter((entry) => entry.length > 0 && isOutside(repositoryRoot, resolve(entry)))
		.join(delimiter);
	env.CI = "1";
	env.HOME = currentFixture.root;
	env.NO_COLOR = "1";
	env.USERPROFILE = currentFixture.root;
	env.VETTA_CODING_AGENT_DIR = currentFixture.agentDir;
	env.VETTA_HOME = join(currentFixture.root, "home");
	return env;
}

function startInstalledCli(
	binaryPath: string,
	currentFixture: AgentRpcFixture,
	skillPath: string,
	env: NodeJS.ProcessEnv,
	extraArgs: readonly string[] = [],
): AgentRpcProcess {
	const child: ChildProcessWithoutNullStreams = spawn(
		binaryPath,
		[
			"agent",
			"--agent-runtime",
			"greenfield-im",
			"--mode",
			"rpc",
			"--enable-host-bridge",
			"--scenario",
			"im-claw",
			"--session-dir",
			currentFixture.conversationDir,
			"--provider",
			"test",
			"--model",
			"test-model",
			"--offline",
			"--no-extensions",
			"--skill",
			skillPath,
			"--no-prompt-templates",
			"--no-themes",
			...extraArgs,
		],
		{
			cwd: currentFixture.workspace,
			env,
			stdio: "pipe",
			windowsHide: true,
		},
	);
	return new AgentRpcProcess(child);
}

function readToolDescription(tools: readonly unknown[] | undefined, name: string): string {
	for (const tool of tools ?? []) {
		if (typeof tool !== "object" || tool === null || Reflect.get(tool, "name") !== name) continue;
		const description = Reflect.get(tool, "description");
		return typeof description === "string" ? description : "";
	}
	return "";
}

function isOutside(parent: string, candidate: string): boolean {
	const pathFromParent = relative(parent, candidate);
	return pathFromParent.startsWith("..") || isAbsolute(pathFromParent);
}

async function runCommand(command: string, args: readonly string[]): Promise<void> {
	await new Promise<void>((resolvePromise, rejectPromise) => {
		const child = spawn(command, args, {
			cwd: repositoryRoot,
			stdio: ["ignore", "pipe", "pipe"],
			windowsHide: true,
		});
		let output = "";
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => {
			output += chunk;
		});
		child.stderr.on("data", (chunk: string) => {
			output += chunk;
		});
		child.once("error", rejectPromise);
		child.once("exit", (code, signal) => {
			if (code === 0) {
				resolvePromise();
				return;
			}
			rejectPromise(new Error(`Command failed (code=${code ?? "null"}, signal=${signal ?? "null"})\n${output}`));
		});
	});
}

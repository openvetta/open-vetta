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
	type RpcFrame,
	readSessionFile,
	readSessionId,
	type TestAgentRuntimeBackend,
} from "./support/agent-rpc-test-process.js";
import {
	type OpenAiResponsesTestServer,
	type ProviderRequest,
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
const DYNAMIC_SKILL_V1 = "INSTALLED_ARTIFACT_DYNAMIC_SKILL_V1";
const DYNAMIC_SKILL_V2 = "INSTALLED_ARTIFACT_DYNAMIC_SKILL_V2";
const BACKENDS = ["legacy", "greenfield-im"] as const satisfies readonly TestAgentRuntimeBackend[];
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
	it("preserves the exact im-claw Provider frame and lifecycle sequence across runtime backends", async () => {
		await expectStandaloneArtifact(artifact);

		const observations = {} as Record<TestAgentRuntimeBackend, InstalledFrameObservation>;
		for (const backend of BACKENDS) {
			let currentFixture: AgentRpcFixture | undefined;
			let currentProcess: AgentRpcProcess | undefined;
			let currentServer: OpenAiResponsesTestServer | undefined;
			try {
				currentServer = await startOpenAiResponsesTestServer(() => ({
					kind: "events",
					events: textResponseEvents("Installed im-claw Provider frame captured."),
				}));
				currentFixture = await createAgentRpcFixture({ baseUrl: currentServer.baseUrl });
				currentProcess = startInstalledCli(
					artifact.binaryPath,
					currentFixture,
					createIsolatedArtifactEnv(currentFixture),
					{ backend, noSkills: true },
				);
				const mark = currentProcess.mark();
				await currentProcess.request(`installed-frame-${backend}`, "prompt", {
					message: "Capture the installed im-claw Provider frame",
				});
				await currentProcess.waitFor((frame) => frame.type === "agent_end", mark, 30_000);
				expect(currentServer.requests).toHaveLength(1);
				const request = currentServer.requests[0];
				if (!request) throw new Error(`Expected installed ${backend}/im-claw Provider request`);
				observations[backend] = {
					provider: observableProviderRequest(request.body, currentFixture),
					runtime: observeRuntimeFrames(currentProcess.framesSince(mark)),
				};
			} finally {
				await currentProcess?.close();
				await currentFixture?.dispose();
				await currentServer?.dispose();
			}
		}
		expect(providerToolNames(observations["greenfield-im"].provider)).toEqual(
			providerToolNames(observations.legacy.provider),
		);
		expect(observations["greenfield-im"]).toEqual(observations.legacy);
	}, 120_000);

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

		activeProcess = startInstalledCli(artifact.binaryPath, fixture, isolatedEnv, { skillPath });
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

		activeProcess = startInstalledCli(artifact.binaryPath, fixture, isolatedEnv, {
			skillPath,
			extraArgs: ["--session", sessionFile],
		});
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

	it("applies runtime Skill and MCP changes without rebuilding the installed session", async () => {
		await expectStandaloneArtifact(artifact);

		providerServer = await startOpenAiResponsesTestServer((_request, index) => ({
			kind: "events",
			events: textResponseEvents(`Installed dynamic capability turn ${index}.`),
		}));
		fixture = await createAgentRpcFixture({ baseUrl: providerServer.baseUrl });
		const isolatedEnv = createIsolatedArtifactEnv(fixture);
		activeProcess = startInstalledCli(artifact.binaryPath, fixture, isolatedEnv);
		const initialState = await activeProcess.request("installed-dynamic-state-before", "get_state");
		const sessionFile = readSessionFile(initialState);
		const sessionId = readSessionId(initialState);
		const ownershipLock = `${sessionFile}.owner.lock`;

		await promptInstalledTurn(activeProcess, "installed-dynamic-empty", "Observe empty dynamic capabilities");
		const initialRequest = providerServer.requests.at(-1);
		expect(initialRequest?.rawBody).not.toContain(DYNAMIC_SKILL_V1);
		expect(readToolDescription(initialRequest?.body.tools, MCP_TOOL_NAME)).toBe("");

		const skillDirectory = join(fixture.workspace, ".vetta", "skills", "installed-dynamic");
		const skillPath = join(skillDirectory, "SKILL.md");
		await mkdir(skillDirectory, { recursive: true });
		await writeFile(skillPath, dynamicSkillDocument(DYNAMIC_SKILL_V1), "utf8");
		await promptInstalledTurn(activeProcess, "installed-dynamic-skill-v1", "Observe dynamic Skill v1");
		const versionOneRequest = providerServer.requests.at(-1);
		expect(versionOneRequest?.rawBody).toContain(DYNAMIC_SKILL_V1);
		expect(versionOneRequest?.rawBody).not.toContain(DYNAMIC_SKILL_V2);

		await writeFile(skillPath, dynamicSkillDocument(DYNAMIC_SKILL_V2), "utf8");
		await promptInstalledTurn(activeProcess, "installed-dynamic-skill-v2", "Observe dynamic Skill v2");
		const versionTwoRequest = providerServer.requests.at(-1);
		expect(versionTwoRequest?.rawBody).not.toContain(DYNAMIC_SKILL_V1);
		expect(versionTwoRequest?.rawBody).toContain(DYNAMIC_SKILL_V2);

		await writeInstalledMcpServer(fixture);
		await promptInstalledTurn(activeProcess, "installed-dynamic-mcp-added", "Observe added MCP capability");
		const mcpAddedRequest = providerServer.requests.at(-1);
		expect(readToolDescription(mcpAddedRequest?.body.tools, MCP_TOOL_NAME)).toBe(MCP_DESCRIPTION);

		await Promise.all([
			rm(skillDirectory, { force: true, recursive: true }),
			writeFile(join(fixture.agentDir, "mcp.json"), JSON.stringify({ mcpServers: {} }), "utf8"),
		]);
		await promptInstalledTurn(activeProcess, "installed-dynamic-removed", "Observe removed dynamic capabilities");
		const removedRequest = providerServer.requests.at(-1);
		expect(removedRequest?.rawBody).not.toContain(DYNAMIC_SKILL_V1);
		expect(removedRequest?.rawBody).not.toContain(DYNAMIC_SKILL_V2);
		expect(readToolDescription(removedRequest?.body.tools, MCP_TOOL_NAME)).toBe("");

		const finalState = await activeProcess.request("installed-dynamic-state-after", "get_state");
		expect(readSessionId(finalState)).toBe(sessionId);
		expect(readSessionFile(finalState)).toBe(sessionFile);
		await expect(activeProcess.close()).resolves.toBe(0);
		activeProcess = undefined;
		await expect(stat(ownershipLock)).rejects.toMatchObject({ code: "ENOENT" });
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

interface StartInstalledCliOptions {
	readonly backend?: TestAgentRuntimeBackend;
	readonly skillPath?: string;
	readonly noSkills?: boolean;
	readonly extraArgs?: readonly string[];
}

function startInstalledCli(
	binaryPath: string,
	currentFixture: AgentRpcFixture,
	env: NodeJS.ProcessEnv,
	options: StartInstalledCliOptions = {},
): AgentRpcProcess {
	const child: ChildProcessWithoutNullStreams = spawn(
		binaryPath,
		[
			"agent",
			"--agent-runtime",
			options.backend ?? "greenfield-im",
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
			...(options.noSkills ? ["--no-skills"] : []),
			...(options.skillPath ? ["--skill", options.skillPath] : []),
			"--no-prompt-templates",
			"--no-themes",
			...(options.extraArgs ?? []),
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

interface InstalledFrameObservation {
	readonly provider: Readonly<Record<string, unknown>>;
	readonly runtime: InstalledRuntimeObservation;
}

function observableProviderRequest(
	body: ProviderRequest,
	currentFixture: AgentRpcFixture,
): Readonly<Record<string, unknown>> {
	const observation: Record<string, unknown> = { ...body };
	delete observation.prompt_cache_key;
	return normalizeProviderValue(observation, currentFixture) as Readonly<Record<string, unknown>>;
}

function normalizeProviderValue(value: unknown, currentFixture: AgentRpcFixture): unknown {
	if (typeof value === "string") {
		return value
			.replaceAll(currentFixture.root, "<fixture-root>")
			.replace(/^Current date and time: .*$/gm, "Current date and time: <turn-time>");
	}
	if (Array.isArray(value)) return value.map((entry) => normalizeProviderValue(entry, currentFixture));
	if (typeof value !== "object" || value === null) return value;
	return Object.fromEntries(
		Object.entries(value).map(([key, entry]) => [key, normalizeProviderValue(entry, currentFixture)]),
	);
}

interface InstalledRuntimeObservation {
	readonly lifecycle: readonly string[];
	readonly textDelta: string;
	readonly finalText: string;
	readonly tools: ReadonlyArray<{ readonly name: string; readonly isError: boolean }>;
	readonly sessionPathChanges: readonly string[];
}

function observeRuntimeFrames(frames: readonly RpcFrame[]): InstalledRuntimeObservation {
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

function providerToolNames(body: Readonly<Record<string, unknown>>): string[] {
	if (!Array.isArray(body.tools)) return [];
	return body.tools.flatMap((tool) => {
		if (typeof tool !== "object" || tool === null) return [];
		const name = Reflect.get(tool, "name");
		return typeof name === "string" ? [name] : [];
	});
}

async function promptInstalledTurn(process: AgentRpcProcess, id: string, message: string): Promise<void> {
	const mark = process.mark();
	await process.request(id, "prompt", { message });
	await process.waitFor((frame) => frame.type === "agent_end", mark, 30_000);
}

function dynamicSkillDocument(description: string): string {
	return `---
name: installed-dynamic
description: ${description}
---

Use this Skill only for the installed artifact dynamic capability gate.
`;
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

import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { RuntimeToolDefinition } from "@vetta/runtime-core/kernel";
import type {
	SandboxPermissionDecision,
	SandboxPermissionRequest,
	SandboxShellGrant,
} from "@vetta/runtime-core/sandbox";
import {
	type CodingToolRegistration,
	createNodeSandboxCodingToolEnvironment,
	type ForegroundCommandOperations,
} from "@vetta/runtime-node/coding";
import {
	clearSessionGrants,
	getSandboxShellGrant,
	type NodeSandboxPlatform,
	setSandboxSessionReadRootResolver,
} from "@vetta/runtime-node/sandbox";
import { afterEach, describe, expect, it } from "vitest";
import type { CodingAgentSandboxAuthorizationPort } from "../../src/execution/sandbox/authorization-contract.js";
import { createCodingAgentSandboxToolRegistrations } from "../../src/execution/sandbox/tool-registrations.js";
import { ALL_SCENARIOS } from "../../src/profiles/index.js";
import { declareCodingAgentPlatformTools } from "../../src/tool-policy/platform-tool-declarations.js";

const SESSION_IDS = [
	"sandbox-read-session",
	"sandbox-deny-session",
	"sandbox-shell-session",
	"sandbox-sibling-session",
] as const;

afterEach(() => {
	for (const sessionId of SESSION_IDS) clearSessionGrants(sessionId);
	setSandboxSessionReadRootResolver(undefined);
});

describe("Coding Agent sandbox tool registrations", () => {
	it.each([
		{ platform: "linux" as const, commandToolName: "bash" },
		{ platform: "darwin" as const, commandToolName: "bash" },
		{ platform: "win32" as const, commandToolName: "shell" },
	])("assembles native tool registrations for $platform", async ({ platform, commandToolName }) => {
		const cwd = await mkdtemp(join(tmpdir(), "vetta-sandbox-tools-"));
		try {
			const registrations = createRegistrations({ cwd, platform, decision: "deny" });
			const declarations = declareCodingAgentPlatformTools(registrations);

			expect(
				declarations.map((registration) => ({
					name: registration.tool.name,
					category: registration.category,
					scopeUse: registration.scopeUse,
				})),
			).toEqual([
				{ name: "read", category: "core", scopeUse: ALL_SCENARIOS },
				{ name: "write", category: "core", scopeUse: ALL_SCENARIOS },
				{ name: "edit", category: "core", scopeUse: ALL_SCENARIOS },
				{ name: commandToolName, category: "core", scopeUse: ALL_SCENARIOS },
			]);
			for (const registration of registrations) {
				expect(registration.tool.inputSchema).toMatchObject({ type: "object" });
				expect(registration.tool.description.length).toBeGreaterThan(0);
			}
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});

	it("routes outside-workspace read grants through the product authorization port and caches session grants", async () => {
		const cwd = await mkdtemp(join(tmpdir(), "vetta-sandbox-workspace-"));
		const outsideRoot = await mkdtemp(join(tmpdir(), "vetta-sandbox-outside-"));
		const outsidePath = join(outsideRoot, "outside.txt");
		await writeFile(outsidePath, "outside content", "utf8");
		const prompts: RecordedAuthorizationRequest[] = [];
		try {
			const registrations = createRegistrations({
				cwd,
				platform: "win32",
				decision: "allow_session",
				sessionId: "sandbox-read-session",
				prompts,
			});
			const readTool = requireTool(registrations, "read");

			const first = await readTool.execute(createRequest("sandbox-read-session", { path: outsidePath }));
			const second = await readTool.execute(createRequest("sandbox-read-session", { path: outsidePath }));

			expect(first.content).toEqual(second.content);
			expect(first.content[0]).toMatchObject({ type: "text", text: expect.stringContaining("outside content") });
			expect(prompts).toHaveLength(1);
			expect(prompts[0]).toMatchObject({
				toolName: "read",
				capability: "file.read",
				target: outsidePath,
				sensitive: false,
			});
		} finally {
			await rm(cwd, { recursive: true, force: true });
			await rm(outsideRoot, { recursive: true, force: true });
		}
	});

	it("preserves the existing outside-workspace denial error", async () => {
		const cwd = await mkdtemp(join(tmpdir(), "vetta-sandbox-deny-workspace-"));
		const outsideRoot = await mkdtemp(join(tmpdir(), "vetta-sandbox-deny-outside-"));
		try {
			const readTool = requireTool(
				createRegistrations({
					cwd,
					platform: "linux",
					decision: "deny",
					sessionId: "sandbox-deny-session",
				}),
				"read",
			);

			await expect(
				readTool.execute(createRequest("sandbox-deny-session", { path: join(outsideRoot, "missing.txt") })),
			).rejects.toThrow('is outside workspace root for tool "read"');
		} finally {
			await rm(cwd, { recursive: true, force: true });
			await rm(outsideRoot, { recursive: true, force: true });
		}
	});

	it("applies an outside-write grant while forwarding command timeout, signal and output", async () => {
		const cwd = await mkdtemp(join(tmpdir(), "vetta-sandbox-shell-"));
		const outsidePath = join(dirname(tmpdir()), `vetta-sandbox-contract-${Date.now()}`, "result.txt").replaceAll(
			"\\",
			"/",
		);
		const prompts: RecordedAuthorizationRequest[] = [];
		let activeGrant: SandboxShellGrant | undefined;
		let capturedTimeout: number | undefined;
		let capturedSignal: AbortSignal | undefined;
		const commandOperations: ForegroundCommandOperations = {
			async exec(_command, operationCwd, options) {
				activeGrant = getSandboxShellGrant(operationCwd);
				capturedTimeout = options.timeout;
				capturedSignal = options.signal;
				options.onData(Buffer.from("sandbox output"));
				return { exitCode: 0 };
			},
		};
		try {
			const shellTool = requireTool(
				createRegistrations({
					cwd,
					platform: "win32",
					decision: "allow_once",
					sessionId: "sandbox-shell-session",
					prompts,
					commandOperations,
				}),
				"shell",
			);
			const signal = new AbortController().signal;

			const result = await shellTool.execute(
				createRequest("sandbox-shell-session", { command: `echo ok > "${outsidePath}"`, timeout: 7 }, signal),
			);

			expect(result.content).toEqual([{ type: "text", text: "sandbox output" }]);
			expect(capturedTimeout).toBe(7);
			expect(capturedSignal).toBe(signal);
			expect(prompts).toHaveLength(1);
			const grantRoot = prompts[0]?.grantRoot;
			expect(grantRoot).toBeDefined();
			expect(activeGrant?.allowReadRoots).toContain(grantRoot);
			expect(activeGrant?.allowWriteRoots).toContain(grantRoot);
			expect(prompts[0]).toMatchObject({
				toolName: "shell",
				capability: "file.write",
				target: outsidePath,
				command: `echo ok > "${outsidePath}"`,
			});
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});
});

describe("session read roots (sibling projects, ADR-0159)", () => {
	async function setup() {
		const cwd = await mkdtemp(join(tmpdir(), "vetta-sibling-cwd-"));
		const sibling = await mkdtemp(join(tmpdir(), "vetta-sibling-project-"));
		const outside = await mkdtemp(join(tmpdir(), "vetta-sibling-outside-"));
		await mkdir(join(sibling, "docs"), { recursive: true });
		await writeFile(join(sibling, "docs", "guide.md"), "sibling guide", "utf8");
		await writeFile(join(outside, "secret.txt"), "outside secret", "utf8");
		const prompts: RecordedAuthorizationRequest[] = [];
		const registrations = createRegistrations({
			cwd,
			platform: "win32",
			decision: "deny",
			sessionId: "sandbox-sibling-session",
			prompts,
		});
		const cleanup = async () => {
			await Promise.all([cwd, sibling, outside].map((path) => rm(path, { recursive: true, force: true })));
		};
		return { cwd, sibling, outside, prompts, registrations, cleanup };
	}

	it("reads inside a sibling root without asking", async () => {
		const ctx = await setup();
		try {
			setSandboxSessionReadRootResolver((sessionId) =>
				sessionId === "sandbox-sibling-session" ? [ctx.sibling] : [],
			);
			const result = await requireTool(ctx.registrations, "read").execute(
				createRequest("sandbox-sibling-session", { path: join(ctx.sibling, "docs", "guide.md") }),
			);
			expect(result.content[0]).toMatchObject({ type: "text", text: expect.stringContaining("sibling guide") });
			expect(ctx.prompts).toEqual([]);
		} finally {
			await ctx.cleanup();
		}
	});

	it("still asks before writing into a sibling root", async () => {
		const ctx = await setup();
		try {
			setSandboxSessionReadRootResolver(() => [ctx.sibling]);
			await expect(
				requireTool(ctx.registrations, "write").execute(
					createRequest("sandbox-sibling-session", { path: join(ctx.sibling, "new.md"), content: "x" }),
				),
			).rejects.toThrow(/outside workspace root/);
			expect(ctx.prompts).toHaveLength(1);
			expect(ctx.prompts[0]).toMatchObject({ toolName: "write", capability: "file.write" });
		} finally {
			await ctx.cleanup();
		}
	});

	it("asks for paths outside every sibling root", async () => {
		const ctx = await setup();
		try {
			setSandboxSessionReadRootResolver(() => [ctx.sibling]);
			await expect(
				requireTool(ctx.registrations, "read").execute(
					createRequest("sandbox-sibling-session", { path: join(ctx.outside, "secret.txt") }),
				),
			).rejects.toThrow(/outside workspace root/);
			expect(ctx.prompts).toHaveLength(1);
		} finally {
			await ctx.cleanup();
		}
	});

	it("does not follow a symlink inside a sibling root to a path outside it", async () => {
		const ctx = await setup();
		try {
			await symlink(join(ctx.outside, "secret.txt"), join(ctx.sibling, "link.txt"));
			setSandboxSessionReadRootResolver(() => [ctx.sibling]);
			await expect(
				requireTool(ctx.registrations, "read").execute(
					createRequest("sandbox-sibling-session", { path: join(ctx.sibling, "link.txt") }),
				),
			).rejects.toThrow(/outside workspace root/);
			expect(ctx.prompts).toHaveLength(1);
		} finally {
			await ctx.cleanup();
		}
	});

	it("matches a sibling root given through a symlinked path", async () => {
		const ctx = await setup();
		const alias = join(ctx.outside, "alias");
		try {
			await symlink(ctx.sibling, alias);
			setSandboxSessionReadRootResolver(() => [alias]);
			const result = await requireTool(ctx.registrations, "read").execute(
				createRequest("sandbox-sibling-session", { path: join(ctx.sibling, "docs", "guide.md") }),
			);
			expect(result.content[0]).toMatchObject({ type: "text", text: expect.stringContaining("sibling guide") });
			expect(ctx.prompts).toEqual([]);
		} finally {
			await ctx.cleanup();
		}
	});

	it.each([
		{ name: "the resolver throws", resolver: () => Promise.reject(new Error("boom")) },
		{ name: "the resolver returns relative roots", resolver: () => ["relative/project"] },
		{ name: "no resolver is installed", resolver: undefined },
	])("falls back to the authorization prompt when $name", async ({ resolver }) => {
		const ctx = await setup();
		try {
			setSandboxSessionReadRootResolver(resolver);
			await expect(
				requireTool(ctx.registrations, "read").execute(
					createRequest("sandbox-sibling-session", { path: join(ctx.sibling, "docs", "guide.md") }),
				),
			).rejects.toThrow(/outside workspace root/);
			expect(ctx.prompts).toHaveLength(1);
		} finally {
			await ctx.cleanup();
		}
	});

	it("re-evaluates roots on every read so a removed sibling is asked for again", async () => {
		const ctx = await setup();
		try {
			let roots: string[] = [ctx.sibling];
			setSandboxSessionReadRootResolver(() => roots);
			const read = requireTool(ctx.registrations, "read");
			const path = join(ctx.sibling, "docs", "guide.md");
			await read.execute(createRequest("sandbox-sibling-session", { path }));
			roots = [];
			await expect(read.execute(createRequest("sandbox-sibling-session", { path }))).rejects.toThrow(
				/outside workspace root/,
			);
			expect(ctx.prompts).toHaveLength(1);
		} finally {
			await ctx.cleanup();
		}
	});
});

interface CreateRegistrationsOptions {
	readonly cwd: string;
	readonly platform: NodeSandboxPlatform;
	readonly decision: SandboxPermissionDecision;
	readonly sessionId?: string;
	readonly prompts?: RecordedAuthorizationRequest[];
	readonly commandOperations?: ForegroundCommandOperations;
}

function createRegistrations(options: CreateRegistrationsOptions): readonly CodingToolRegistration[] {
	const defaultOperations: ForegroundCommandOperations = {
		async exec(_command, _cwd, execOptions) {
			execOptions.onData(Buffer.from("ok"));
			return { exitCode: 0 };
		},
	};
	const authorization: CodingAgentSandboxAuthorizationPort = {
		isAvailable: () => true,
		request: async (sessionId, request, sensitive) => {
			options.prompts?.push({ ...request, sessionId, sensitive });
			return options.decision;
		},
	};
	return createCodingAgentSandboxToolRegistrations({
		cwd: options.cwd,
		authorization,
		getSessionId: () => options.sessionId,
		environment: {
			createToolSet: () =>
				createNodeSandboxCodingToolEnvironment({
					cwd: options.cwd,
					platform: options.platform,
					commandOperations: options.commandOperations ?? defaultOperations,
					editPathPolicy: { getRejectionReason: () => undefined },
					writePathPolicy: { getRejectionReason: () => undefined },
				}),
		},
	});
}

interface RecordedAuthorizationRequest extends SandboxPermissionRequest {
	readonly sessionId: string;
	readonly sensitive: boolean;
}

function requireTool(registrations: readonly CodingToolRegistration[], toolName: string): RuntimeToolDefinition {
	const registration = registrations.find(({ tool }) => tool.name === toolName);
	if (!registration) throw new Error(`Missing sandbox tool registration: ${toolName}`);
	return registration.tool;
}

function createRequest(
	sessionId: string,
	input: Readonly<Record<string, unknown>>,
	signal: AbortSignal = new AbortController().signal,
): Parameters<RuntimeToolDefinition["execute"]>[0] {
	return {
		sessionId,
		turnId: "turn-1",
		toolCallId: "tool-call-1",
		input,
		signal,
	};
}

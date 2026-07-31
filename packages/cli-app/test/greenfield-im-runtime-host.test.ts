import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type CodingAgentHostBootstrap, createCodingAgentHostBootstrap } from "@vetta/coding-agent";
import type { RuntimeSessionCatalog } from "@vetta/runtime-core";
import { CONVERSATION_STORAGE_ERROR_CODES } from "@vetta/runtime-storage/conversation";
import { afterEach, describe, expect, it } from "vitest";
import { createCliRuntimeSessionCatalog } from "../src/rpc/cli-session-format-compatibility.js";
import {
	type GreenfieldImRuntimeHostReady,
	prepareGreenfieldImRuntimeHost,
} from "../src/rpc/greenfield-im-runtime-host.js";

const temporaryDirectories: string[] = [];
const preparedHosts: GreenfieldImRuntimeHostReady[] = [];

afterEach(async () => {
	for (const prepared of preparedHosts.splice(0).reverse()) await prepared.capabilities.dispose();
	for (const directory of temporaryDirectories.splice(0).reverse()) {
		await rm(directory, { force: true, recursive: true });
	}
});

describe("Greenfield IM Runtime Host", () => {
	it("keeps legacy jsonl sessions on the Legacy fallback path", async () => {
		const fixture = await createFixture(["--session", join("legacy", "session.jsonl")]);

		const result = await prepareGreenfieldImRuntimeHost({
			bootstrap: fixture.bootstrap,
			conversationDir: fixture.conversationDir,
			sessionCatalog: fixture.sessionCatalog,
		});

		expect(result).toMatchObject({
			kind: "legacy-fallback",
			reason: "legacy-session",
			sessionPath: join("legacy", "session.jsonl"),
		});
	});

	it("owns fresh and resumed conversations for the whole runtime lifetime", async () => {
		const fixture = await createFixture([]);
		const fresh = await prepareGreenfieldImRuntimeHost({
			bootstrap: fixture.bootstrap,
			conversationDir: fixture.conversationDir,
			sessionCatalog: fixture.sessionCatalog,
			createSessionId: () => "im-session",
		});
		expect(fresh.kind).toBe("greenfield");
		if (fresh.kind !== "greenfield") throw new Error("Expected Greenfield runtime");
		preparedHosts.push(fresh);
		const sessionPath = fresh.session.createCoreAssembly().lifecycle.sessionPath;
		if (!sessionPath) throw new Error("Expected persisted Greenfield session path");
		const ownerPath = `${sessionPath}.owner.lock`;
		await expect(stat(ownerPath)).resolves.toBeDefined();

		const conflictingBootstrap = await createBootstrap(fixture, ["--session", sessionPath]);
		await expect(
			prepareGreenfieldImRuntimeHost({
				bootstrap: conflictingBootstrap,
				conversationDir: fixture.conversationDir,
				sessionCatalog: fixture.sessionCatalog,
			}),
		).rejects.toMatchObject({ code: CONVERSATION_STORAGE_ERROR_CODES.OWNERSHIP_CONFLICT });

		await fresh.capabilities.dispose();
		preparedHosts.splice(preparedHosts.indexOf(fresh), 1);
		await expect(stat(ownerPath)).rejects.toMatchObject({ code: "ENOENT" });

		const resumedBootstrap = await createBootstrap(fixture, ["--session", sessionPath]);
		const resumed = await prepareGreenfieldImRuntimeHost({
			bootstrap: resumedBootstrap,
			conversationDir: fixture.conversationDir,
			sessionCatalog: fixture.sessionCatalog,
		});
		expect(resumed.kind).toBe("greenfield");
		if (resumed.kind !== "greenfield") throw new Error("Expected resumed Greenfield runtime");
		preparedHosts.push(resumed);
		expect(resumed.session.sessionId).toBe("im-session");
	});

	it("rejects malformed Greenfield paths instead of treating them as Legacy", async () => {
		const fixture = await createFixture(["--session", join("outside", "bad.conversation.jsonl")]);

		await expect(
			prepareGreenfieldImRuntimeHost({
				bootstrap: fixture.bootstrap,
				conversationDir: fixture.conversationDir,
				sessionCatalog: fixture.sessionCatalog,
			}),
		).rejects.toThrow("Invalid Greenfield conversation path");
	});

	it("keeps interactive resume on the unsupported session-selection fallback", async () => {
		const fixture = await createFixture(["--resume"]);

		await expect(
			prepareGreenfieldImRuntimeHost({
				bootstrap: fixture.bootstrap,
				conversationDir: fixture.conversationDir,
				sessionCatalog: fixture.sessionCatalog,
			}),
		).resolves.toMatchObject({
			kind: "legacy-fallback",
			reason: "unsupported-session-selection",
		});
	});

	it("uses the Coding Agent capability assessment for Legacy Extension fallback", async () => {
		const fixture = await createFixture(
			[],
			`
				export default function(pi) {
					pi.registerFlag("audit-mode", { type: "boolean" });
					pi.on("agent_start", async () => {});
				}
			`,
		);
		expect(fixture.bootstrap.extensionsResult.extensions).toHaveLength(1);
		expect(fixture.bootstrap.extensionCompatibility).toMatchObject({
			bootstrapContributions: { flags: ["audit-mode"] },
			requiredRuntimeCapabilities: ["opaque-runtime-api", "event-handler"],
			unsupportedEvents: ["agent_start"],
			requiresLegacyRuntime: true,
		});

		fixture.bootstrap.extensionsResult.extensions.splice(0);
		const result = await prepareGreenfieldImRuntimeHost({
			bootstrap: fixture.bootstrap,
			conversationDir: fixture.conversationDir,
			sessionCatalog: fixture.sessionCatalog,
		});

		expect(result).toMatchObject({
			kind: "legacy-fallback",
			reason: "legacy-extension",
			extensionCompatibility: {
				requiredRuntimeCapabilities: ["opaque-runtime-api", "event-handler"],
				unsupportedEvents: ["agent_start"],
			},
		});
	});

	it("runs Provider/Flag-only Extensions on Greenfield and binds their retained actions", async () => {
		const fixture = await createFixture(
			[],
			`
				export default function(pi) {
					pi.registerFlag("endpoint", { type: "string" });
					pi.registerProvider("fixture-provider", {
						baseUrl: "https://fixture.test",
						api: "openai-responses",
						models: [],
					});
				}
			`,
		);

		const result = await prepareGreenfieldImRuntimeHost({
			bootstrap: fixture.bootstrap,
			conversationDir: fixture.conversationDir,
			sessionCatalog: fixture.sessionCatalog,
			createSessionId: () => "extension-session",
		});
		expect(result.kind).toBe("greenfield");
		if (result.kind !== "greenfield") throw new Error("Expected Greenfield runtime");
		preparedHosts.push(result);

		fixture.bootstrap.extensionsResult.runtime.setSessionName("Extension Session");
		await result.capabilities.dispose();
		preparedHosts.splice(preparedHosts.indexOf(result), 1);

		expect(result.session.createCoreAssembly).toThrow();
	});

	it("runs supported input events with a real Greenfield session context", async () => {
		const fixture = await createFixture(
			[],
			`
				export default function(pi) {
					pi.on("input", async (event, ctx) => {
						if (event.source !== "rpc") throw new Error("unexpected input source");
						if (ctx.sessionManager.getSessionId() !== "extension-event-session") {
							throw new Error("unexpected session id");
						}
						if (ctx.model?.id !== "test-model") throw new Error("unexpected model");
						if (!ctx.isIdle() || ctx.hasPendingMessages()) throw new Error("unexpected queue state");
						if (ctx.getContextUsage()?.contextWindow !== 8000) throw new Error("unexpected context usage");
						if (ctx.sessionManager.getHeader()?.id !== "extension-event-session") {
							throw new Error("unexpected session header");
						}
						if (ctx.sessionManager.getEntries().length !== 0 || ctx.sessionManager.getTree().length !== 0) {
							throw new Error("unexpected initial conversation");
						}
						if (!ctx.getSystemPrompt()) throw new Error("system prompt was not initialized");
						return { action: "handled" };
					});
				}
			`,
		);

		const result = await prepareGreenfieldImRuntimeHost({
			bootstrap: fixture.bootstrap,
			conversationDir: fixture.conversationDir,
			sessionCatalog: fixture.sessionCatalog,
			createSessionId: () => "extension-event-session",
		});
		expect(result.kind).toBe("greenfield");
		if (result.kind !== "greenfield") throw new Error("Expected Greenfield runtime");
		preparedHosts.push(result);

		await expect(result.session.prompt({ text: "handled by extension" })).resolves.toEqual({
			status: "handled",
			sessionId: "extension-event-session",
		});
		await expect(result.session.getMessages()).resolves.toEqual([]);
	});
});

async function createFixture(
	extraArgs: string[],
	extensionSource?: string,
): Promise<{
	readonly root: string;
	readonly agentDir: string;
	readonly workspace: string;
	readonly conversationDir: string;
	readonly sessionCatalog: RuntimeSessionCatalog;
	readonly bootstrap: CodingAgentHostBootstrap;
}> {
	const root = await mkdtemp(join(tmpdir(), "vetta-greenfield-im-host-"));
	temporaryDirectories.push(root);
	const fixture = {
		root,
		agentDir: join(root, "agent"),
		workspace: join(root, "workspace"),
		conversationDir: join(root, "conversations"),
	};
	await Promise.all([mkdir(fixture.workspace, { recursive: true }), mkdir(fixture.agentDir, { recursive: true })]);
	await writeFile(
		join(fixture.agentDir, "models.json"),
		JSON.stringify({
			providers: {
				test: {
					baseUrl: "https://example.test",
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
	);
	const extensionPath = join(root, "legacy-extension.ts");
	if (extensionSource) await writeFile(extensionPath, extensionSource, "utf8");
	const bootstrap = await createBootstrap(
		fixture,
		extensionSource ? [...extraArgs, "--extension", extensionPath] : extraArgs,
	);
	const sessionCatalog = createCliRuntimeSessionCatalog({
		cwd: fixture.workspace,
		sessionDir: fixture.conversationDir,
	});
	return { ...fixture, sessionCatalog, bootstrap };
}

async function createBootstrap(
	fixture: { readonly agentDir: string; readonly workspace: string },
	extraArgs: string[],
): Promise<CodingAgentHostBootstrap> {
	const bootstrap = await createCodingAgentHostBootstrap({
		args: ["--mode", "rpc", "--enable-host-bridge", "--scenario", "im-claw", ...extraArgs],
		cwd: fixture.workspace,
		agentDir: fixture.agentDir,
	});
	const model = bootstrap.modelRegistry.getAll()[0];
	if (!model) throw new Error("Expected at least one built-in model");
	bootstrap.authStorage.setRuntimeApiKey(model.provider, "test-key");
	bootstrap.settingsManager.setDefaultModelAndProvider(model.provider, model.id);
	return bootstrap;
}

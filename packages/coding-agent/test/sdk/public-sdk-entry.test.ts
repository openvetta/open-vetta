import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Api, Model } from "@vetta/ai";
import { afterEach, describe, expect, it } from "vitest";
import {
	CODING_AGENT_SESSION_CREATE_ERROR_CODES,
	CodingAgentSessionCreateError,
	type CreateCodingAgentSessionOptions,
	createCodingAgentSession,
} from "../../src/public-api/sdk.js";

describe("public Coding Agent SDK entry", () => {
	const temporaryDirectories: string[] = [];
	const sessions: Array<{ close(): Promise<void> }> = [];

	afterEach(async () => {
		await Promise.all(sessions.splice(0).map((session) => session.close()));
		await Promise.all(
			temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
		);
	});

	it("creates an in-memory session without exposing product managers or Extension runtime", async () => {
		const cwd = await temporaryDirectory("public-sdk-memory-cwd-");
		const agentDir = await temporaryDirectory("public-sdk-memory-agent-");
		const result = await createCodingAgentSession({
			cwd,
			agentDir,
			storage: { kind: "memory", sessionId: "public-memory" },
			model: MODEL,
			activeTools: [],
			enableMcp: false,
			enableSubagents: false,
			includeAgentSkills: false,
		});
		sessions.push(result.session);

		expect(result.session.sessionId).toBe("public-memory");
		expect(result.session.sessionFile).toBeUndefined();
		expect(result.session.getActiveToolNames()).toEqual([]);
		expect(result.diagnostics).toEqual([]);
		expect(Reflect.has(result, "extensionsResult")).toBe(false);
		for (const concrete of ["sessionManager", "settingsManager", "modelRegistry", "resourceLoader"]) {
			expect(Reflect.has(result.session, concrete)).toBe(false);
		}
	});

	it("creates and resumes a native file session through a value storage target", async () => {
		const cwd = await temporaryDirectory("public-sdk-file-cwd-");
		const agentDir = await temporaryDirectory("public-sdk-file-agent-");
		const conversationDir = await temporaryDirectory("public-sdk-file-conversations-");
		const created = await createCodingAgentSession({
			cwd,
			agentDir,
			storage: { kind: "file-create", conversationDir, sessionId: "public-file" },
			model: MODEL,
			enableMcp: false,
			enableSubagents: false,
			includeAgentSkills: false,
		});
		sessions.push(created.session);
		await created.session.sendCustomMessage({ customType: "public-sdk", content: "persisted", display: true });
		const sessionPath = created.session.sessionFile;
		if (!sessionPath) throw new Error("Expected a native public SDK session path");
		await created.session.close();

		const resumed = await createCodingAgentSession({
			cwd,
			agentDir,
			storage: { kind: "file-resume", conversationDir, sessionPath },
			model: MODEL,
			enableMcp: false,
			enableSubagents: false,
			includeAgentSkills: false,
		});
		sessions.push(resumed.session);

		expect(resumed.session.sessionId).toBe("public-file");
		expect(resumed.session.getSessionBranch()).toContainEqual(
			expect.objectContaining({
				type: "custom_message",
				customType: "public-sdk",
				content: [expect.objectContaining({ type: "text", text: "persisted" })],
			}),
		);
	});

	it("projects Extension loader failures into detached public diagnostics", async () => {
		const cwd = await temporaryDirectory("public-sdk-diagnostic-cwd-");
		const agentDir = await temporaryDirectory("public-sdk-diagnostic-agent-");
		const extensionDirectory = join(agentDir, "extensions");
		await mkdir(extensionDirectory, { recursive: true });
		await writeFile(join(extensionDirectory, "broken.ts"), "export default (", "utf8");

		const result = await createCodingAgentSession({
			cwd,
			agentDir,
			storage: { kind: "memory" },
			model: MODEL,
			enableMcp: false,
			enableSubagents: false,
			includeAgentSkills: false,
		});
		sessions.push(result.session);

		expect(result.diagnostics).toContainEqual(
			expect.objectContaining({
				code: "extension_load_failed",
				severity: "error",
				source: expect.stringContaining("broken.ts"),
			}),
		);
		expect(Reflect.has(result.diagnostics[0] ?? {}, "runtime")).toBe(false);
	});

	it("rejects unknown built-in tool names at the public composition boundary", async () => {
		const cwd = await temporaryDirectory("public-sdk-tool-cwd-");
		const agentDir = await temporaryDirectory("public-sdk-tool-agent-");
		const operation = createCodingAgentSession({ cwd, agentDir, model: MODEL, activeTools: ["missing-tool"] });
		await expect(operation).rejects.toBeInstanceOf(CodingAgentSessionCreateError);
		await expect(operation).rejects.toMatchObject({
			code: CODING_AGENT_SESSION_CREATE_ERROR_CODES.INVALID_ACTIVE_TOOL,
		});
	});

	async function temporaryDirectory(prefix: string): Promise<string> {
		const directory = await mkdtemp(join(tmpdir(), prefix));
		temporaryDirectories.push(directory);
		return directory;
	}
});

function verifyConcreteManagerOptionsStayOutOfPublicContract(): void {
	// @ts-expect-error SessionManager belongs to the Legacy compatibility factory.
	const sessionManager: CreateCodingAgentSessionOptions = { sessionManager: {} };
	// @ts-expect-error ResourceLoader belongs to the product Composition Root.
	const resourceLoader: CreateCodingAgentSessionOptions = { resourceLoader: {} };
	// @ts-expect-error ModelRegistry belongs to the product Composition Root.
	const modelRegistry: CreateCodingAgentSessionOptions = { modelRegistry: {} };
	void [sessionManager, resourceLoader, modelRegistry];
}

void verifyConcreteManagerOptionsStayOutOfPublicContract;

const MODEL: Model<Api> = {
	id: "public-sdk-model",
	name: "Public SDK Model",
	api: "openai-responses",
	provider: "public-sdk-provider",
	baseUrl: "https://example.test",
	reasoning: false,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 8_000,
	maxTokens: 1_000,
};

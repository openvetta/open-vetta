import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCodingAgentWritePathPolicy } from "@vetta/coding-agent/host";
import { afterEach, describe, expect, it } from "vitest";
import { getKnowledgeDir } from "../../../../coding-agent/src/config.js";
import { createWriteTool as createLegacyWriteTool } from "../../../../coding-agent/src/core/tools/write/index.js";
import {
	createWriteTool,
	createWriteToolRegistration,
	selectCodingToolsForScope,
	WRITE_TOOL_SCOPES,
	type WriteOperations,
	type WritePathPolicy,
} from "../../../src/coding/index.js";

const temporaryDirectories: string[] = [];
const permissivePathPolicy: WritePathPolicy = {
	getRejectionReason: () => undefined,
};

afterEach(() => {
	for (const directory of temporaryDirectories) rmSync(directory, { recursive: true, force: true });
	temporaryDirectories.length = 0;
});

function createTemporaryDirectory(label: string): string {
	const directory = mkdtempSync(join(tmpdir(), `vetta-runtime-write-${label}-`));
	temporaryDirectories.push(directory);
	return directory;
}

function runtimeRequest(
	input: { readonly path: string; readonly content: string },
	signal = new AbortController().signal,
) {
	return {
		sessionId: "session-1",
		turnId: "turn-1",
		toolCallId: "runtime-write",
		input,
		signal,
	};
}

function normalizeResult(value: unknown, directory: string): unknown {
	return JSON.parse(JSON.stringify(value).replaceAll(directory.replace(/\\/g, "\\\\"), "<workspace>"));
}

function recordingOperations(calls: string[]): WriteOperations {
	return {
		mkdir: async (directory) => {
			calls.push(`mkdir:${directory}`);
		},
		writeFile: async (path, content) => {
			calls.push(`write:${path}:${content}`);
		},
	};
}

describe("runtime write tool", () => {
	it("preserves the legacy definition, registration metadata, and full default scope", () => {
		const legacy = createLegacyWriteTool(process.cwd());
		const runtime = createWriteToolRegistration(process.cwd(), { pathPolicy: permissivePathPolicy });
		expect({
			name: runtime.tool.name,
			label: runtime.tool.label,
			description: runtime.tool.description,
			schema: runtime.tool.inputSchema,
			scopeUse: runtime.scopeUse,
			category: runtime.category,
		}).toEqual({
			name: legacy.name,
			label: legacy.label,
			description: legacy.description,
			schema: legacy.parameters,
			scopeUse: legacy.scope_use,
			category: legacy.category,
		});
		expect(runtime.scopeUse).toEqual(WRITE_TOOL_SCOPES);
		for (const scope of WRITE_TOOL_SCOPES) {
			expect(selectCodingToolsForScope([runtime], scope)).toEqual([runtime.tool]);
		}
	});

	it("preserves local parent creation, verbatim UTF-8 content, result text, and undefined details", async () => {
		const legacyDirectory = createTemporaryDirectory("legacy");
		const runtimeDirectory = createTemporaryDirectory("runtime");
		const relativePath = "nested/deep/output.txt";
		const content = 'héllo🙂\nconst path = "招标文件 - 发布稿.docx";\n';
		const legacy = createLegacyWriteTool(legacyDirectory);
		const runtime = createWriteTool(runtimeDirectory, { pathPolicy: permissivePathPolicy });

		const legacyResult = await legacy.execute("legacy-write", { path: relativePath, content });
		const runtimeResult = await runtime.execute(runtimeRequest({ path: relativePath, content }));
		expect(normalizeResult(runtimeResult, runtimeDirectory)).toEqual(normalizeResult(legacyResult, legacyDirectory));
		expect(readFileSync(join(legacyDirectory, relativePath), "utf-8")).toBe(content);
		expect(readFileSync(join(runtimeDirectory, relativePath), "utf-8")).toBe(content);
		expect(runtimeResult.details).toBeUndefined();
	});

	it("preserves custom operation order and content.length success accounting", async () => {
		const cwd = createTemporaryDirectory("operations");
		const legacyCalls: string[] = [];
		const runtimeCalls: string[] = [];
		const legacy = createLegacyWriteTool(cwd, { operations: recordingOperations(legacyCalls) });
		const runtime = createWriteTool(cwd, {
			operations: recordingOperations(runtimeCalls),
			pathPolicy: permissivePathPolicy,
		});
		const input = { path: "nested/file.txt", content: "🙂" };

		const legacyResult = await legacy.execute("legacy-write", input);
		const runtimeResult = await runtime.execute(runtimeRequest(input));
		expect(runtimeResult).toEqual(legacyResult);
		expect(runtimeCalls).toEqual(legacyCalls);
		expect(runtimeResult.content[0]).toMatchObject({ text: expect.stringContaining("Successfully wrote 2 bytes") });
	});

	it("preserves fuzzy output-path retargeting and its notice", async () => {
		const legacyDirectory = createTemporaryDirectory("legacy-retarget");
		const runtimeDirectory = createTemporaryDirectory("runtime-retarget");
		const exactName = "招标文件-发布稿.docx";
		const requestedName = "招标文件 - 发布稿.docx";
		writeFileSync(join(legacyDirectory, exactName), "old");
		writeFileSync(join(runtimeDirectory, exactName), "old");
		const legacy = createLegacyWriteTool(legacyDirectory);
		const runtime = createWriteTool(runtimeDirectory, { pathPolicy: permissivePathPolicy });

		const legacyResult = await legacy.execute("legacy-write", { path: requestedName, content: "new" });
		const runtimeResult = await runtime.execute(runtimeRequest({ path: requestedName, content: "new" }));
		expect(normalizeResult(runtimeResult, runtimeDirectory)).toEqual(normalizeResult(legacyResult, legacyDirectory));
		expect(readFileSync(join(runtimeDirectory, exactName), "utf-8")).toBe("new");
		expect(runtimeResult.content[0]).toMatchObject({ text: expect.stringContaining("[Auto-corrected output path:") });
	});

	it.each([".vetta/skills/output.txt", ".agents/skills/output.txt"])(
		"preserves protected skill path rejection for %s",
		async (path) => {
			const cwd = createTemporaryDirectory("protected");
			const legacy = createLegacyWriteTool(cwd);
			const runtime = createWriteTool(cwd, { pathPolicy: createCodingAgentWritePathPolicy(cwd) });
			const input = { path, content: "blocked" };
			const legacyResult = await legacy.execute("legacy-write", input);
			const runtimeResult = await runtime.execute(runtimeRequest(input));
			expect(runtimeResult).toEqual(legacyResult);
			expect(runtimeResult.content[0]).toMatchObject({
				text: expect.stringContaining("inside a skill/scene directory"),
			});
		},
	);

	it("preserves knowledge wiki rejection", async () => {
		const cwd = createTemporaryDirectory("wiki-policy");
		const path = join(getKnowledgeDir(), "wiki", "page.md");
		const legacy = createLegacyWriteTool(cwd);
		const runtime = createWriteTool(cwd, { pathPolicy: createCodingAgentWritePathPolicy(cwd) });
		const input = { path, content: "blocked" };
		const legacyResult = await legacy.execute("legacy-write", input);
		const runtimeResult = await runtime.execute(runtimeRequest(input));
		expect(runtimeResult).toEqual(legacyResult);
		expect(runtimeResult.content[0]).toMatchObject({ text: expect.stringContaining("kb_write_page tool") });
	});

	it("preserves early cancellation before filesystem operations", async () => {
		const cwd = createTemporaryDirectory("early-abort");
		const controller = new AbortController();
		controller.abort();
		const legacyCalls: string[] = [];
		const runtimeCalls: string[] = [];
		const legacy = createLegacyWriteTool(cwd, { operations: recordingOperations(legacyCalls) });
		const runtime = createWriteTool(cwd, {
			operations: recordingOperations(runtimeCalls),
			pathPolicy: permissivePathPolicy,
		});
		const input = { path: "output.txt", content: "blocked" };
		await expect(legacy.execute("legacy-write", input, controller.signal)).rejects.toThrow("Operation aborted");
		await expect(runtime.execute(runtimeRequest(input, controller.signal))).rejects.toThrow("Operation aborted");
		expect(runtimeCalls).toEqual(legacyCalls);
		expect(runtimeCalls).toEqual([]);
	});

	it("preserves cancellation during mkdir and prevents the later write", async () => {
		const cwd = createTemporaryDirectory("mkdir-abort");
		const legacyController = new AbortController();
		const runtimeController = new AbortController();
		let resolveLegacyMkdir: (() => void) | undefined;
		let resolveRuntimeMkdir: (() => void) | undefined;
		const legacyWrites: string[] = [];
		const runtimeWrites: string[] = [];
		const legacy = createLegacyWriteTool(cwd, {
			operations: {
				mkdir: () =>
					new Promise<void>((resolve) => {
						resolveLegacyMkdir = resolve;
					}),
				writeFile: async (path) => {
					legacyWrites.push(path);
				},
			},
		});
		const runtime = createWriteTool(cwd, {
			operations: {
				mkdir: () =>
					new Promise<void>((resolve) => {
						resolveRuntimeMkdir = resolve;
					}),
				writeFile: async (path) => {
					runtimeWrites.push(path);
				},
			},
			pathPolicy: permissivePathPolicy,
		});
		const input = { path: "output.txt", content: "blocked" };
		const legacyPromise = legacy.execute("legacy-write", input, legacyController.signal);
		const runtimePromise = runtime.execute(runtimeRequest(input, runtimeController.signal));
		legacyController.abort();
		runtimeController.abort();
		await expect(legacyPromise).rejects.toThrow("Operation aborted");
		await expect(runtimePromise).rejects.toThrow("Operation aborted");
		resolveLegacyMkdir?.();
		resolveRuntimeMkdir?.();
		await Promise.resolve();
		expect(runtimeWrites).toEqual(legacyWrites);
		expect(runtimeWrites).toEqual([]);
	});

	it.each(["mkdir", "writeFile"] as const)("preserves %s operation errors", async (failurePoint) => {
		const cwd = createTemporaryDirectory(`error-${failurePoint}`);
		const operations = (): WriteOperations => ({
			mkdir: async () => {
				if (failurePoint === "mkdir") throw new Error("mkdir failed");
			},
			writeFile: async () => {
				if (failurePoint === "writeFile") throw new Error("write failed");
			},
		});
		const legacy = createLegacyWriteTool(cwd, { operations: operations() });
		const runtime = createWriteTool(cwd, {
			operations: operations(),
			pathPolicy: permissivePathPolicy,
		});
		const input = { path: "output.txt", content: "content" };
		await expect(legacy.execute("legacy-write", input)).rejects.toThrow(
			`${failurePoint === "mkdir" ? "mkdir" : "write"} failed`,
		);
		await expect(runtime.execute(runtimeRequest(input))).rejects.toThrow(
			`${failurePoint === "mkdir" ? "mkdir" : "write"} failed`,
		);
	});
});

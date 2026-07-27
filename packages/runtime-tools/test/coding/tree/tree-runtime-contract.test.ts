import { describe, expect, it } from "vitest";
import { createTreeTool as createLegacyTreeTool } from "../../../../coding-agent/src/core/tools/tree/index.js";
import {
	createTreeTool,
	createTreeToolRegistration,
	selectCodingToolsForScope,
	TREE_TOOL_SCOPES,
	type TreeOperations,
} from "../../../src/coding/index.js";

interface ScanResult {
	readonly status: number | null;
	readonly stdout: string;
	readonly stderr: string;
}

interface FixtureOptions {
	readonly exists?: boolean;
	readonly isDirectory?: boolean;
	readonly fdPath?: string;
	readonly directories?: ScanResult;
	readonly files?: ScanResult;
}

function createOperations(options: FixtureOptions = {}) {
	const calls: Array<{ readonly fdPath: string; readonly args: readonly string[] }> = [];
	const runFd = async (fdPath: string, args: readonly string[]): Promise<ScanResult> => {
		calls.push({ fdPath, args: [...args] });
		return args[2] === "d"
			? (options.directories ?? {
					status: 0,
					stdout: "src\nsrc/core\npackages\n.hidden\n",
					stderr: "",
				})
			: (options.files ?? {
					status: 0,
					stdout: "README.md\nsrc/core/index.ts\npackages/zeta.ts\n.hidden/secret\n",
					stderr: "",
				});
	};
	const shared = {
		exists: () => options.exists ?? true,
		stat: () => ({ isDirectory: () => options.isDirectory ?? true }),
	};
	return {
		calls,
		legacy: {
			...shared,
			ensureFd: async () => options.fdPath ?? "fixture-fd",
			runFd: (fdPath: string, args: string[]) => runFd(fdPath, args),
		},
		runtime: {
			...shared,
			runFd,
		} satisfies TreeOperations,
	};
}

function runtimeRequest(input: {
	readonly path?: string;
	readonly maxDepth?: number;
	readonly limit?: number;
	readonly includeFiles?: boolean;
	readonly includeHidden?: boolean;
	readonly ignore?: string[];
}) {
	return {
		sessionId: "session-1",
		turnId: "turn-1",
		toolCallId: "runtime-tree",
		input,
		signal: new AbortController().signal,
	};
}

describe("runtime tree tool", () => {
	it("preserves the legacy definition, registration metadata, and full default scope", () => {
		const legacy = createLegacyTreeTool(process.cwd());
		const runtime = createTreeToolRegistration(process.cwd(), { operations: createOperations().runtime });
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
		expect(runtime.scopeUse).toEqual(TREE_TOOL_SCOPES);
		for (const scope of TREE_TOOL_SCOPES) {
			expect(selectCodingToolsForScope([runtime], scope)).toEqual([runtime.tool]);
		}
	});

	it("preserves hierarchy, sorting, child counts, node tags, and fd arguments", async () => {
		const legacyFixture = createOperations();
		const runtimeFixture = createOperations();
		const legacy = createLegacyTreeTool(process.cwd(), { operations: legacyFixture.legacy });
		const runtime = createTreeTool(process.cwd(), {
			operations: runtimeFixture.runtime,
			fdPath: "fixture-fd",
		});
		const input = {
			path: ".",
			maxDepth: 5,
			includeHidden: true,
			ignore: ["dist", "  ", "*.generated.ts"],
		};

		const legacyResult = await legacy.execute("legacy-tree", input);
		const runtimeResult = await runtime.execute(runtimeRequest(input));
		expect(runtimeResult).toEqual(legacyResult);
		expect(runtimeFixture.calls).toEqual(legacyFixture.calls);
		expect(runtimeResult.content[0]).toMatchObject({
			type: "text",
			text: expect.stringContaining("[D] src (d:1, f:0) (type=dir)"),
		});
	});

	it("preserves directory-only mode, floored limits, and limit notices", async () => {
		const options = {
			directories: { status: 0, stdout: "zeta\nalpha\nalpha/child\n", stderr: "" },
			files: { status: 0, stdout: "alpha/file.ts\n", stderr: "" },
		} satisfies FixtureOptions;
		const legacyFixture = createOperations(options);
		const runtimeFixture = createOperations(options);
		const legacy = createLegacyTreeTool(process.cwd(), { operations: legacyFixture.legacy });
		const runtime = createTreeTool(process.cwd(), { operations: runtimeFixture.runtime, fdPath: "fixture-fd" });
		const input = { includeFiles: false, maxDepth: 1.9, limit: 2.8 };

		const legacyResult = await legacy.execute("legacy-tree", input);
		const runtimeResult = await runtime.execute(runtimeRequest(input));
		expect(runtimeResult).toEqual(legacyResult);
		expect(runtimeFixture.calls).toEqual(legacyFixture.calls);
		expect(runtimeFixture.calls).toHaveLength(1);
		expect(runtimeResult.details).toMatchObject({ nodeLimitReached: 2, nodesRendered: 2 });
	});

	it("preserves scan-limit and output-byte-limit details", async () => {
		const paths = Array.from({ length: 2000 }, (_, index) => `${String(index).padStart(4, "0")}-${"x".repeat(120)}`);
		const options = {
			directories: { status: 0, stdout: paths.join("\n"), stderr: "" },
			files: { status: 0, stdout: "", stderr: "" },
		} satisfies FixtureOptions;
		const legacyFixture = createOperations(options);
		const runtimeFixture = createOperations(options);
		const legacy = createLegacyTreeTool(process.cwd(), { operations: legacyFixture.legacy });
		const runtime = createTreeTool(process.cwd(), { operations: runtimeFixture.runtime, fdPath: "fixture-fd" });

		const legacyResult = await legacy.execute("legacy-tree", { maxDepth: 2, limit: 500 });
		const runtimeResult = await runtime.execute(runtimeRequest({ maxDepth: 2, limit: 500 }));
		expect(runtimeResult).toEqual(legacyResult);
		expect(runtimeResult.details).toMatchObject({
			nodeLimitReached: 500,
			scanLimitReached: 2000,
			truncation: { truncated: true, truncatedBy: "bytes" },
		});
	});

	it("resolves fd on every execution and preserves unavailable-fd errors", async () => {
		let resolutions = 0;
		const runtime = createTreeTool(process.cwd(), {
			operations: createOperations().runtime,
			executableResolver: {
				resolve: async () => {
					resolutions += 1;
					return undefined;
				},
			},
		});
		for (let attempt = 0; attempt < 2; attempt += 1) {
			await expect(runtime.execute(runtimeRequest({}))).rejects.toThrow(
				"fd is not available and could not be downloaded",
			);
		}
		expect(resolutions).toBe(2);
	});

	it.each([
		{
			name: "missing path",
			options: { exists: false },
			expected: "Path not found:",
		},
		{
			name: "non-directory path",
			options: { isDirectory: false },
			expected: "Not a directory:",
		},
		{
			name: "directory scan failure",
			options: { directories: { status: 2, stdout: "", stderr: "scan failed" } },
			expected: "Failed to build directory tree: scan failed",
		},
		{
			name: "file scan failure",
			options: { files: { status: null, stdout: "", stderr: "" } },
			expected: "Failed to build directory tree: fd exited with code null",
		},
	] satisfies ReadonlyArray<{ name: string; options: FixtureOptions; expected: string }>)(
		"preserves $name errors",
		async ({ options, expected }) => {
			const legacyFixture = createOperations(options);
			const runtimeFixture = createOperations(options);
			const legacy = createLegacyTreeTool(process.cwd(), { operations: legacyFixture.legacy });
			const runtime = createTreeTool(process.cwd(), { operations: runtimeFixture.runtime, fdPath: "fixture-fd" });
			const legacyPromise = legacy.execute("legacy-tree", {});
			const runtimePromise = runtime.execute(runtimeRequest({}));
			await expect(legacyPromise).rejects.toThrow(expected);
			await expect(runtimePromise).rejects.toThrow(expected);
		},
	);

	it("preserves early cancellation", async () => {
		const controller = new AbortController();
		controller.abort();
		const legacy = createLegacyTreeTool(process.cwd(), { operations: createOperations().legacy });
		const runtime = createTreeTool(process.cwd(), { operations: createOperations().runtime, fdPath: "fixture-fd" });
		await expect(legacy.execute("legacy-tree", {}, controller.signal)).rejects.toThrow("Operation aborted");
		await expect(runtime.execute({ ...runtimeRequest({}), signal: controller.signal })).rejects.toThrow(
			"Operation aborted",
		);
	});
});

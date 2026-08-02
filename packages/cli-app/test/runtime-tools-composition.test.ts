import {
	BackgroundTaskManager,
	createBashTool,
	createEditTool,
	createFindTool,
	createGlobTool,
	createGrepTool,
	createLsTool,
	createReadTool,
	createShellTool,
	createTaskOutputTool,
	createTaskStopTool,
	createTreeTool,
	createWriteTool,
} from "@vetta/coding-agent/legacy/tools";
import { ALL_SCENARIOS } from "@vetta/coding-agent/profile";
import { describe, expect, it } from "vitest";
import { resolveActiveToolNames } from "../../coding-agent/src/core/session/tool-scope.js";
import { createCurrentTimeTool } from "../../coding-agent/src/core/tools/current-time/index.js";
import { createCodingToolsRuntimeComposition } from "../src/runtime-tools-composition.js";

function modelCallContext(signal = new AbortController().signal) {
	return {
		sessionId: "session-1",
		turnId: "turn-1",
		signal,
	};
}

describe("CLI Runtime Tools Composition Root", () => {
	it("registers and compiles the default CLI coding tools without downloading", async () => {
		const calls: Array<{ readonly tool: "fd" | "rg"; readonly silent: boolean | undefined }> = [];
		const composition = createCodingToolsRuntimeComposition({
			cwd: "C:/workspace",
			ensureTool: async (tool, silent) => {
				calls.push({ tool, silent });
				return undefined;
			},
		});

		const compiled = await composition.compile();
		try {
			const provider = compiled.snapshot.modelCallProviders?.[0];
			if (!provider) throw new Error("expected coding tools model call provider");
			const contribution = await provider.contribute(modelCallContext());
			expect(contribution.tools?.map(({ name }) => name)).toEqual(
				process.platform === "win32"
					? [
							"current_time",
							"dir_tree",
							"edit",
							"glob",
							"grep",
							"read",
							"shell",
							"task_output",
							"task_stop",
							"write",
						]
					: [
							"bash",
							"current_time",
							"dir_tree",
							"edit",
							"glob",
							"grep",
							"read",
							"task_output",
							"task_stop",
							"write",
						],
			);
			await expect(composition.executableResolver.resolve("rg")).resolves.toBeUndefined();
			expect(calls).toEqual([{ tool: "rg", silent: true }]);
		} finally {
			await compiled.dispose();
			composition.dispose();
		}
	});

	it("keeps fail-closed tools available for explicit activation", async () => {
		const composition = createCodingToolsRuntimeComposition({
			cwd: "C:/workspace",
			activation: {
				mode: "explicit",
				toolNames: ["find", "ls"],
			},
			ensureTool: async () => undefined,
		});

		const compiled = await composition.compile();
		try {
			const provider = compiled.snapshot.modelCallProviders?.[0];
			if (!provider) throw new Error("expected coding tools model call provider");
			const contribution = await provider.contribute(modelCallContext());
			expect(contribution.tools?.map(({ name }) => name)).toEqual(["find", "ls"]);
		} finally {
			await compiled.dispose();
			composition.dispose();
		}
	});

	it.each(ALL_SCENARIOS)("matches the legacy active tool profile for %s", async (scenario) => {
		const cwd = "C:/workspace";
		const backgroundTasks = new BackgroundTaskManager();
		const legacyTools = [
			createCurrentTimeTool(),
			createReadTool(cwd),
			createEditTool(cwd),
			createBashTool(cwd),
			createShellTool(cwd),
			createLsTool(cwd),
			createGlobTool(cwd),
			createGrepTool(cwd),
			createFindTool(cwd),
			createTreeTool(cwd),
			createWriteTool(cwd),
			createTaskOutputTool({ getManager: () => backgroundTasks }),
			createTaskStopTool({ getManager: () => backgroundTasks }),
		];
		const legacyToolNames = resolveActiveToolNames(
			scenario,
			legacyTools as unknown as Parameters<typeof resolveActiveToolNames>[1],
			new Set(["bg-tasks"]),
		).sort();
		const composition = createCodingToolsRuntimeComposition({
			cwd,
			activation: { mode: "scope", scope: scenario, capabilities: new Set(["bg-tasks"]) },
			ensureTool: async () => undefined,
		});

		const compiled = await composition.compile();
		try {
			const provider = compiled.snapshot.modelCallProviders?.[0];
			if (!provider) throw new Error("expected coding tools model call provider");
			const contribution = await provider.contribute(modelCallContext());
			const runtimeToolNames = contribution.tools?.map(({ name }) => name).sort();
			expect(runtimeToolNames).toEqual(legacyToolNames);
		} finally {
			await compiled.dispose();
			composition.dispose();
		}
	});
});

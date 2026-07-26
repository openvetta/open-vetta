import { afterEach, describe, expect, it, vi } from "vitest";
import { createCurrentTimeTool as createLegacyCurrentTimeTool } from "../../../coding-agent/src/core/tools/current-time/index.js";
import { createCurrentTimeTool } from "../../src/coding/index.js";

afterEach(() => {
	vi.useRealTimers();
});

describe("current_time legacy compatibility", () => {
	it("keeps the model-visible definition and execution result unchanged", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2026, 6, 26, 14, 30, 45));
		const legacyTool = createLegacyCurrentTimeTool();
		const runtimeTool = createCurrentTimeTool();

		expect({
			name: runtimeTool.name,
			label: runtimeTool.label,
			description: runtimeTool.description,
			schema: runtimeTool.inputSchema,
		}).toEqual({
			name: legacyTool.name,
			label: legacyTool.label,
			description: legacyTool.description,
			schema: legacyTool.parameters,
		});

		const legacyResult = await legacyTool.execute("legacy-call", {
			description: "Check the time",
		});
		const runtimeResult = await runtimeTool.execute({
			sessionId: "session-1",
			turnId: "turn-1",
			toolCallId: "runtime-call",
			input: {
				description: "Check the time",
			},
			signal: new AbortController().signal,
		});

		expect(runtimeResult).toEqual(legacyResult);
	});
});
